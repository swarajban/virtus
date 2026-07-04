// Repro/verify for BUG 1: stale resumed home page routes a fresh-cycle
// completion to a wrong workout_number (the "cycle-3 completion landed on
// workout 25" incident).
//
// Choreography (mirrors the real incident):
//   1. Test user is on Powerbuilding 2.0 cycle 2 with workouts 1..24 completed
//      → home renders "Next Workout" = 25 (PB2.0's W7D1, "Full Body 1").
//   2. With the page STILL OPEN (frozen tab), the user switches to
//      Powerbuilding 4x cycle 3 "on another device" (SQL update).
//   3. The tab "resumes" (visibilitychange fires, like iOS Safari).
//   4. User taps Next Workout, starts + completes the workout.
//   5. Assert which (program, cycle, workout_number) row the server persisted.
//
// Buggy behavior: row lands at (Powerbuilding 4x, cycle 3, workout_number 25).
// Fixed behavior: resume revalidation recomputes Next Workout → workout 1;
// row lands at (Powerbuilding 4x, cycle 3, workout_number 1, completed).
//
// Usage: PGURL=... node scripts/repro-bug1.mjs <username>
import { webkit } from "playwright";
import { execSync } from "child_process";

const PGURL = process.env.PGURL;
if (!PGURL) throw new Error("PGURL env var required");
const USER = process.argv[2] || "repro_bug1";
const BASE = process.env.BASE_URL || "http://localhost:5000";

const psql = (sql) =>
  // Collapse whitespace: JSON.stringify escapes newlines as literal \n which
  // bash passes through to psql as backslash-n, breaking multi-line SQL.
  execSync(`psql "${PGURL}" -tAc ${JSON.stringify(sql.replace(/\s+/g, " "))}`).toString().trim();

// --- setup: fresh test user frozen mid-PB2.0-cycle-2 (24 of 48 done) ---
psql(`DELETE FROM workout_progress WHERE user_id IN (SELECT id FROM users WHERE username='${USER}')`);
psql(`DELETE FROM exercise_history WHERE user_id IN (SELECT id FROM users WHERE username='${USER}')`);
psql(`DELETE FROM users WHERE username='${USER}'`);
psql(`INSERT INTO users (username, selected_program, current_program_cycle) VALUES ('${USER}', 'Powerbuilding 2.0', 2)`);
psql(`INSERT INTO workout_progress (user_id, workout_number, status, started_at, completed_at, program_name, program_cycle, exercise_progress)
      SELECT (SELECT id FROM users WHERE username='${USER}'), gs, 'completed',
             now() - interval '40 days' + gs * interval '1 day',
             now() - interval '40 days' + gs * interval '1 day' + interval '45 minutes',
             'Powerbuilding 2.0', 2, '{}'::jsonb
      FROM generate_series(1, 24) gs`);

const browser = await webkit.launch();
const page = await browser.newPage();
try {
  await page.goto(BASE + "/");
  await page.evaluate((u) => localStorage.setItem("selected-username", u), USER);
  await page.reload();

  // Home fully loaded in the PB2.0/cycle-2 world: 24 of 48 completed.
  await page.waitForFunction(() => document.body.innerText.includes("24 of 48"), null, { timeout: 15000 });
  console.log("[1] home rendered stale world:", (await page.textContent("body")).match(/\d+ of \d+/)[0]);

  // "Another device" switches the account to Powerbuilding 4x cycle 3.
  psql(`UPDATE users SET selected_program='Powerbuilding 4x', current_program_cycle=3 WHERE username='${USER}'`);
  console.log("[2] server user switched to Powerbuilding 4x cycle 3 (frozen tab not reloaded)");

  // Tab resumes (iOS fires visibilitychange when the page becomes visible).
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(2500); // let any revalidation land
  console.log("[3] after resume, home shows:", (await page.textContent("body")).match(/\d+ of \d+/)[0]);

  await page.click('button:has-text("Next Workout")');
  await page.waitForURL(/\/workout\/\d+$/, { timeout: 10000 });
  const routed = page.url();
  console.log("[4] Next Workout routed to:", routed);

  // Start + complete the workout the app put the user on.
  await page.click('button:has-text("Start Workout")', { timeout: 10000 });
  await page.click('button:has-text("Complete Workout")', { timeout: 10000 });
  await page.waitForFunction(() => document.body.innerText.includes("Completed"), null, { timeout: 10000 });
  await page.waitForTimeout(1500); // let the POST land

  const rows = psql(`SELECT program_name || ' | cycle ' || program_cycle || ' | workout ' || workout_number || ' | ' || status || ' | completed_at ' || COALESCE(completed_at::text, 'NULL')
                     FROM workout_progress
                     WHERE user_id=(SELECT id FROM users WHERE username='${USER}') AND program_name='Powerbuilding 4x'
                     ORDER BY workout_number`);
  console.log("[5] persisted Powerbuilding 4x rows for", USER + ":");
  console.log(rows || "(none)");

  const wroteTo25 = /workout 25/.test(rows);
  const wroteTo1 = /workout 1 \|/.test(rows);
  console.log("\nRESULT:", wroteTo25 ? "BUG REPRODUCED — completion written under workout_number 25"
    : wroteTo1 ? "FIXED — completion written under workout_number 1"
    : "UNEXPECTED — see rows above");
} finally {
  await browser.close();
}
