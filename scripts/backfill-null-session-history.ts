#!/usr/bin/env tsx
/**
 * Backfill session_id (and program_cycle) for orphaned exercise_history rows.
 *
 * WHY THIS EXISTS
 * ----------------
 * Completing the FIRST exercise of a workout used to be able to write an
 * exercise_history row with session_id = NULL (and program_cycle = NULL): the
 * optimistic history write (PR #20) could reach the server BEFORE the
 * workout_progress write that owns the session_id, so resolveHistoryContext()
 * found no progress row and inserted NULL. The server race is fixed in
 * server/storage.ts (bounded retry + advisory-locked get-or-create), but rows
 * already written with NULL session_id remain — and the grouped history UI keys
 * on session_id, so those rows render detached from their workout. This script
 * repairs them.
 *
 * MATCHING STRATEGY (deliberately conservative — a WRONG session is worse than a NULL)
 * ----------------------------------------------------------------------------------
 * For each NULL-session exercise_history row, find the workout_progress rows for
 * the SAME user_id and SAME program_name (and same program_cycle when the orphan
 * already has one) whose session time window contains the orphan's performed_at:
 *
 *     started_at - TOL  <=  performed_at  <=  COALESCE(completed_at, updated_at) + TOL
 *
 * The small tolerance (default 5 min) exists because the racing history write
 * lands a hair BEFORE the progress row's started_at is stamped, so the orphan's
 * performed_at sits right on the session's leading edge. (In prod-copy data the
 * gap is ~0s and the match set is identical for any tolerance from 2 to 60 min —
 * sessions are days apart, so there is a huge margin before ambiguity.)
 *
 * A row is repaired ONLY when EXACTLY ONE session window contains it. Zero
 * candidates or more than one candidate => LEFT UNTOUCHED and reported. We never
 * pick a "nearest" guess.
 *
 * SAFETY
 * ------
 *  - --dry-run is the DEFAULT. Pass --apply to write.
 *  - Only ever touches rows where session_id IS NULL, so it is idempotent
 *    (a second run repairs nothing).
 *  - program_cycle is only populated when it is currently NULL.
 *  - This is a MANUAL tool. It is NOT wired into server startup or deploy.
 *
 * USAGE
 * -----
 *   Dry run (default), dev branch:
 *     DIRECT_DATABASE_URL=postgres://... tsx scripts/backfill-null-session-history.ts
 *   Apply:
 *     DIRECT_DATABASE_URL=postgres://... tsx scripts/backfill-null-session-history.ts --apply
 *   Options:
 *     --apply               actually write (otherwise dry run)
 *     --user <id>           only this user_id (default: all users)
 *     --tolerance-min <n>   window tolerance in minutes (default: 5)
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

interface Args {
  apply: boolean;
  userId?: number;
  toleranceMin: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, toleranceMin: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--user") args.userId = parseInt(argv[++i], 10);
    else if (a === "--tolerance-min") args.toleranceMin = parseFloat(argv[++i]);
    else if (a === "--dry-run") args.apply = false;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  if (args.userId !== undefined && Number.isNaN(args.userId)) {
    console.error("--user requires a numeric id");
    process.exit(1);
  }
  if (Number.isNaN(args.toleranceMin) || args.toleranceMin < 0) {
    console.error("--tolerance-min requires a non-negative number");
    process.exit(1);
  }
  return args;
}

interface OrphanRow {
  id: number;
  user_id: number;
  exercise_name: string | null;
  program_name: string;
  program_cycle: number | null;
  performed_at: Date;
}

interface ProgressRow {
  user_id: number;
  program_name: string;
  program_cycle: number;
  workout_number: number;
  session_id: string;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date | null;
}

interface Plan {
  orphan: OrphanRow;
  status: "matched" | "no-match" | "ambiguous";
  sessionId?: string;
  programCycle?: number; // the cycle to write (only when orphan's is currently NULL)
  why: string;
}

function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) : "—";
}

function buildPlan(orphan: OrphanRow, progress: ProgressRow[], tolMs: number): Plan {
  const t = orphan.performed_at.getTime();

  // Candidate sessions: same user + program, matching cycle when the orphan
  // already has one. A session must have a started_at to define a lower bound.
  const candidates = progress.filter((p) => {
    if (p.user_id !== orphan.user_id) return false;
    if (p.program_name !== orphan.program_name) return false;
    if (orphan.program_cycle != null && p.program_cycle !== orphan.program_cycle) return false;
    return p.started_at != null;
  });

  const containing = candidates.filter((p) => {
    const lo = p.started_at!.getTime() - tolMs;
    const end = p.completed_at ?? p.updated_at;
    if (!end) return false;
    const hi = end.getTime() + tolMs;
    return t >= lo && t <= hi;
  });

  if (containing.length === 0) {
    return {
      orphan,
      status: "no-match",
      why: `no workout_progress session for user ${orphan.user_id} / program '${orphan.program_name}'`
        + `${orphan.program_cycle != null ? ` / cycle ${orphan.program_cycle}` : ""} whose window contains ${fmt(orphan.performed_at)}`,
    };
  }

  if (containing.length > 1) {
    return {
      orphan,
      status: "ambiguous",
      why: `${containing.length} sessions contain ${fmt(orphan.performed_at)} `
        + `(${containing.map((c) => c.session_id).join(", ")}) — refusing to guess`,
    };
  }

  const m = containing[0];
  const end = m.completed_at ?? m.updated_at!;
  const programCycle = orphan.program_cycle == null ? m.program_cycle : undefined;
  return {
    orphan,
    status: "matched",
    sessionId: m.session_id,
    programCycle,
    why: `performed_at ${fmt(orphan.performed_at)} within session window `
      + `[${fmt(m.started_at)} .. ${fmt(end)}] (±${tolMs / 60000}m); workout #${m.workout_number}, `
      + `program '${m.program_name}' cycle ${m.program_cycle}; unique match`
      + `${programCycle != null ? ` (also setting program_cycle=${programCycle})` : ""}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DIRECT_DATABASE_URL or DATABASE_URL must be set");
    process.exit(1);
  }

  const host = connectionString.replace(/.*@([^/]+)\/.*/, "$1");
  console.log("=".repeat(72));
  console.log(`Backfill NULL-session exercise_history rows`);
  console.log(`  DB host:    ${host}`);
  console.log(`  Mode:       ${args.apply ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`);
  console.log(`  Tolerance:  ±${args.toleranceMin} min`);
  console.log(`  User scope: ${args.userId ?? "all users"}`);
  console.log("=".repeat(72));

  const pool = new Pool({ connectionString });
  const tolMs = args.toleranceMin * 60 * 1000;

  try {
    const userFilter = args.userId !== undefined ? "AND user_id = $1" : "";
    const params = args.userId !== undefined ? [args.userId] : [];

    const orphans: OrphanRow[] = (
      await pool.query(
        `SELECT id, user_id, exercise_name, program_name, program_cycle, performed_at
           FROM exercise_history
          WHERE session_id IS NULL ${userFilter}
          ORDER BY user_id, performed_at`,
        params,
      )
    ).rows;

    console.log(`\nFound ${orphans.length} exercise_history row(s) with session_id IS NULL.\n`);
    if (orphans.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    // Load every session-bearing workout_progress row for the affected users so
    // we can match in memory.
    const userIds = Array.from(new Set(orphans.map((o) => o.user_id)));
    const progress: ProgressRow[] = (
      await pool.query(
        `SELECT user_id, program_name, program_cycle, workout_number, session_id,
                started_at, completed_at, updated_at
           FROM workout_progress
          WHERE session_id IS NOT NULL AND user_id = ANY($1::int[])`,
        [userIds],
      )
    ).rows;

    const plans = orphans.map((o) => buildPlan(o, progress, tolMs));

    console.log("Per-row plan:");
    console.log("-".repeat(72));
    for (const p of plans) {
      const o = p.orphan;
      const icon = p.status === "matched" ? "✅" : p.status === "ambiguous" ? "⚠️ " : "⏭️ ";
      console.log(
        `${icon} id=${o.id} u=${o.user_id} "${o.exercise_name}" ${fmt(o.performed_at)} `
          + `[${o.program_name} c${o.program_cycle ?? "null"}]`,
      );
      console.log(`     ${p.status.toUpperCase()}: ${p.why}`);
    }
    console.log("-".repeat(72));

    const matched = plans.filter((p) => p.status === "matched");
    const ambiguous = plans.filter((p) => p.status === "ambiguous");
    const noMatch = plans.filter((p) => p.status === "no-match");

    if (args.apply && matched.length > 0) {
      console.log(`\nApplying ${matched.length} update(s)...`);
      // One transaction so the backfill is all-or-nothing. Each UPDATE is guarded
      // with session_id IS NULL so a concurrent writer (or a re-run) can't be
      // clobbered — the update becomes a no-op if the row was resolved meanwhile.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let applied = 0;
        for (const p of matched) {
          const setCycle = p.programCycle != null;
          const res = await client.query(
            setCycle
              ? `UPDATE exercise_history
                    SET session_id = $1, program_cycle = $2
                  WHERE id = $3 AND session_id IS NULL`
              : `UPDATE exercise_history
                    SET session_id = $1
                  WHERE id = $2 AND session_id IS NULL`,
            setCycle ? [p.sessionId, p.programCycle, p.orphan.id] : [p.sessionId, p.orphan.id],
          );
          applied += res.rowCount ?? 0;
        }
        await client.query("COMMIT");
        console.log(`✅ Committed. Rows changed: ${applied} (of ${matched.length} planned).`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else if (matched.length > 0) {
      console.log(`\n(dry run) Would update ${matched.length} row(s). Re-run with --apply to write.`);
    }

    console.log("\n" + "=".repeat(72));
    console.log("Summary");
    console.log(`  matched  (repairable): ${matched.length}`);
    console.log(`  skipped  (no match):   ${noMatch.length}`);
    console.log(`  skipped  (ambiguous):  ${ambiguous.length}`);
    console.log(`  total orphans:         ${orphans.length}`);
    console.log("=".repeat(72));
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("💥 Backfill failed:", err);
    process.exit(1);
  });
