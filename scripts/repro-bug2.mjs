// Repro/verify for BUG 2: "Complete Workout" persists completed_at but status
// stays in_progress when it races a stalled exercise-complete write.
//
// Choreography (deterministic version of the gym-wifi race):
//   1. Test user on Powerbuilding 4x cycle 3, workout 2 in_progress with all
//      working exercises completed except the last (index 11).
//   2. Open the last exercise; STALL the exercise-complete's
//      POST /api/workout-progress/2 at the network layer.
//   3. Tap "Complete exercise" → auto-advance returns to the workout page
//      while its progress write is still stuck in flight.
//   4. Tap "Complete Workout" (queues behind the stalled write).
//   5. Release the stall; let both writes land; read the DB row.
//
// Buggy behavior: row ends {status: in_progress, completed_at: <set>} — the
// second POST's body was rebuilt from the cache that the first write's
// post-POST sync had regressed to in_progress, while completedAt survived.
// Fixed behavior: {status: completed, completed_at: <set>}.
//
// Usage: PGURL=... node scripts/repro-bug2.mjs <username>
import { webkit } from "playwright";
import { execSync } from "child_process";

const PGURL = process.env.PGURL;
if (!PGURL) throw new Error("PGURL env var required");
const USER = process.argv[2] || "repro_bug2";
const BASE = process.env.BASE_URL || "http://localhost:5000";

const psql = (sql) =>
  execSync(`psql "${PGURL}" -tAc ${JSON.stringify(sql)}`).toString().trim();

// --- setup: workout 2 in_progress, everything done except last exercise ---
const doneEntry = (sets, reps, weight) =>
  `{"sets": ${sets}, "reps": ${reps}, "weight": ${weight}, "notes": "", "completed": true}`;
const exerciseProgress = `{
  "1": ${doneEntry(3, 3, 365)}, "3": ${doneEntry(3, 6, 185)}, "4": ${doneEntry(1, 8, 165)},
  "5": ${doneEntry(3, 12, 90)}, "7": ${doneEntry(3, 10, 0)}, "9": ${doneEntry(3, 8, 70)}
}`;
psql(`DELETE FROM workout_progress WHERE user_id IN (SELECT id FROM users WHERE username='${USER}')`);
psql(`DELETE FROM exercise_history WHERE user_id IN (SELECT id FROM users WHERE username='${USER}')`);
psql(`DELETE FROM users WHERE username='${USER}'`);
psql(`INSERT INTO users (username, selected_program, current_program_cycle) VALUES ('${USER}', 'Powerbuilding 4x', 3)`);
psql(`INSERT INTO workout_progress (user_id, workout_number, status, started_at, program_name, program_cycle, session_id, exercise_progress)
      VALUES ((SELECT id FROM users WHERE username='${USER}'), 2, 'in_progress', now() - interval '40 minutes',
              'Powerbuilding 4x', 3, 'session_repro_bug2', '${exerciseProgress.replace(/\n/g, " ")}'::jsonb)`);

const browser = await webkit.launch();
const page = await browser.newPage();
try {
  // Stall only the FIRST progress POST (the exercise-complete write).
  let releaseStall;
  const stalled = new Promise((r) => (releaseStall = r));
  let stalledOne = false;
  let postCount = 0;
  const postsDone = [];
  await page.route("**/api/workout-progress/2", async (route) => {
    if (route.request().method() === "POST") {
      postCount += 1;
      const n = postCount;
      console.log(`  [net] POST #${n} body:`, route.request().postData());
      if (!stalledOne) {
        stalledOne = true;
        await stalled; // hold the exercise-complete write in flight
        console.log(`  [net] POST #${n} released`);
      }
    }
    await route.continue();
  });
  page.on("response", (res) => {
    if (res.url().includes("/api/workout-progress/2") && res.request().method() === "POST") {
      postsDone.push(res.status());
    }
  });

  await page.goto(BASE + "/");
  await page.evaluate((u) => localStorage.setItem("selected-username", u), USER);

  // Last exercise of workout 2 (index 11, Standing calf raise — working set).
  await page.goto(BASE + "/workout/2/exercise/11");
  await page.waitForSelector('button:has-text("Complete exercise")', { timeout: 20000 });

  console.log("[1] completing last exercise (progress POST stalled)…");
  await page.click('button:has-text("Complete exercise")');

  // Auto-advance lands back on the workout page while the write is in flight.
  await page.waitForURL(/\/workout\/2$/, { timeout: 15000 });
  await page.waitForSelector('button:has-text("Complete Workout")', { timeout: 15000 });
  console.log("[2] back on workout page; tapping Complete Workout while first write is stuck…");
  await page.click('button:has-text("Complete Workout")');

  await page.waitForTimeout(500);
  console.log("[3] releasing the stalled exercise-complete write…");
  releaseStall();

  // Wait until both POSTs have completed.
  const deadline = Date.now() + 20000;
  while (postsDone.length < 2 && Date.now() < deadline) {
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);
  console.log("[4] POST statuses:", postsDone.join(", "));

  const row = psql(`SELECT status || ' | completed_at ' || COALESCE(completed_at::text, 'NULL') || ' | exercises done: ' ||
                    (SELECT count(*) FROM jsonb_each(exercise_progress) e WHERE (e.value->>'completed')::boolean)
                    FROM workout_progress
                    WHERE user_id=(SELECT id FROM users WHERE username='${USER}') AND workout_number=2 AND program_cycle=3`);
  console.log("[5] persisted row for workout 2:", row);

  const partial = /^in_progress \| completed_at (?!NULL)/.test(row);
  const fixed = /^completed \| completed_at (?!NULL)/.test(row);
  console.log("\nRESULT:", partial ? "BUG REPRODUCED — completed_at set but status stayed in_progress"
    : fixed ? "FIXED — status=completed and completed_at persisted together"
    : "UNEXPECTED — see row above");
} finally {
  await browser.close();
}
