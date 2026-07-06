#!/usr/bin/env tsx
/**
 * Idempotent exercise import for the "Min-Max 5x" program.
 *
 * For every exercise the program references (after dedup against existing
 * DB names):
 *  - inserts the exercise with its YouTube demo link if it doesn't exist yet
 *  - fills in youtube_link on existing exercises that have none
 *  - corrects usesBarbell on the program's NEW exercises (the server's
 *    startup seeder may insert them first with a name-pattern heuristic that
 *    gets e.g. "Machine Chest Press" wrong)
 * Existing youtube_link values are never overwritten. Safe to re-run.
 *
 * Usage:
 * - Development: DIRECT_DATABASE_URL=<dev branch url> tsx scripts/import-minmax-exercises.ts
 * - Production:  DIRECT_DATABASE_URL=<prod url> tsx scripts/import-minmax-exercises.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { exercises } from '../shared/schema';
import { eq } from 'drizzle-orm';
import ws from 'ws';
import fs from 'fs';
import path from 'path';

neonConfig.webSocketConstructor = ws;

// name -> { youtubeLink, usesBarbell }. Names already deduped against the DB
// (e.g. program "Cable Crunch" -> DB "Cable Crunch (Abs)").
const MINMAX_EXERCISES: Record<string, { youtubeLink?: string; usesBarbell: boolean; isNew?: boolean }> = {
  // Existing DB names (only their missing youtube_link gets filled)
  'Back squat': { youtubeLink: 'https://youtu.be/v3N4tpPpmyQ', usesBarbell: true },
  'Barbell bench press': { usesBarbell: true },
  'Cable Crunch (Abs)': { youtubeLink: 'https://youtu.be/LvJM9V3D_CQ', usesBarbell: false },
  'Chest-supported T-Bar row': { youtubeLink: 'https://youtu.be/-FAxUZoPDc4', usesBarbell: true },
  'Constant-Tension Cable Triceps Kickback': { youtubeLink: 'https://youtu.be/FGJ64JyKod0', usesBarbell: false },
  'Cable lateral raise': { youtubeLink: 'https://youtu.be/DX1WzS7k0Uc', usesBarbell: false },
  'Deadlift': { youtubeLink: 'https://youtu.be/xbnan2iNh-Q', usesBarbell: true },
  'Hip Thrust': { youtubeLink: 'https://youtu.be/ELgSmlwFsFQ', usesBarbell: false },
  'Hip abduction': { youtubeLink: 'https://youtu.be/iGd7fQffkkM', usesBarbell: false },
  'Leg extension': { youtubeLink: 'https://youtu.be/G0_M9LBCT0o', usesBarbell: false },
  'Leg press': { youtubeLink: 'https://youtu.be/ksBaBSfmZf4', usesBarbell: false },
  'Lying leg curl': { youtubeLink: 'https://youtu.be/y28L1m1PYUQ', usesBarbell: false },
  'Pec Flye': { youtubeLink: 'https://youtu.be/xei-JEpfAS4', usesBarbell: false },
  'Rope Overhead Triceps Extension': { youtubeLink: 'https://youtu.be/7GvY7yTEepM', usesBarbell: false },
  'Standing calf raise': { youtubeLink: 'https://youtu.be/WMkCGNwo5ts', usesBarbell: false },
  'Triceps pressdown': { youtubeLink: 'https://youtu.be/B5S2mbg0g5c', usesBarbell: false },
  'Weighted pull-up': { youtubeLink: 'https://youtu.be/oB27u_w3pX4', usesBarbell: false },
  // New exercises introduced by Min-Max 5x
  '1-Arm Reverse Pec Deck': { youtubeLink: 'https://youtu.be/WkI6IHmYORY', usesBarbell: false, isNew: true },
  'Alternating DB Curl': { youtubeLink: 'https://youtu.be/kSxgX6HIYxQ', usesBarbell: false, isNew: true },
  'Bayesian Cable Curl': { youtubeLink: 'https://youtu.be/_w_Uan2dG-4', usesBarbell: false, isNew: true },
  'Close-Grip Lat Pulldown': { youtubeLink: 'https://youtu.be/7l859qd4E48', usesBarbell: false, isNew: true },
  'DB Wrist Curl': { youtubeLink: 'https://youtu.be/HJx1sIZKDqk', usesBarbell: false, isNew: true },
  'DB Wrist Extension': { youtubeLink: 'https://youtu.be/uCAoI5FnLhs', usesBarbell: false, isNew: true },
  'Dead Hang (optional)': { youtubeLink: 'https://youtu.be/5M8uPbfQsbg', usesBarbell: false, isNew: true },
  'Dragon Flag': { youtubeLink: 'https://youtu.be/p6VfK1YDhhQ', usesBarbell: false, isNew: true },
  'EZ-Bar Preacher Curl': { youtubeLink: 'https://youtu.be/zX0KvQCLbac', usesBarbell: false, isNew: true },
  'Incline DB Y-Raise': { youtubeLink: 'https://youtu.be/xaOQJjzNrd8', usesBarbell: false, isNew: true },
  'Kelso Shrug': { youtubeLink: 'https://youtu.be/76rz0UNAlYI', usesBarbell: false, isNew: true },
  'Machine Chest Press': { youtubeLink: 'https://youtu.be/qTSTOVVr8rU', usesBarbell: false, isNew: true },
  'Machine Lateral Raise': { youtubeLink: 'https://youtu.be/nc6pAci8Tpg', usesBarbell: false, isNew: true },
  'Machine Shrug': { youtubeLink: 'https://youtu.be/2KDc6iAcrAw', usesBarbell: false, isNew: true },
  'Modified Zottman Curl': { youtubeLink: 'https://youtu.be/J0l0qQCy80Q', usesBarbell: false, isNew: true },
  'Smith Machine Lunge': { youtubeLink: 'https://youtu.be/FPIsTw-jh5s', usesBarbell: false, isNew: true },
};

// Guard against the map and the program JSON drifting apart: every exercise
// name Min-Max 5x references must be covered here, or its video link / DB row
// silently goes missing in the app.
function assertMapCoversProgramJson() {
  const jsonPath = path.join(process.cwd(), 'client', 'public', 'powerbuilding_data.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const program = data.programs.find((p: any) => p.name === 'Min-Max 5x');
  if (!program) {
    console.error('Program "Min-Max 5x" not found in powerbuilding_data.json');
    process.exit(1);
  }
  const jsonNames = new Set<string>(
    program.workouts.flatMap((w: any) => w.exercises.map((e: any) => e.name)),
  );
  const missing = [...jsonNames].filter((n) => !(n in MINMAX_EXERCISES));
  if (missing.length > 0) {
    console.error('Exercise names in the Min-Max 5x JSON but not in this import map:', missing);
    process.exit(1);
  }
}

async function importMinMaxExercises() {
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DIRECT_DATABASE_URL or DATABASE_URL must be set');
    process.exit(1);
  }

  assertMapCoversProgramJson();

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });

  let inserted = 0;
  let updated = 0;
  let untouched = 0;

  for (const [name, { youtubeLink, usesBarbell, isNew }] of Object.entries(MINMAX_EXERCISES)) {
    const existing = await db.select().from(exercises).where(eq(exercises.name, name));

    if (existing.length === 0) {
      await db.insert(exercises).values({ name, youtubeLink, usesBarbell });
      console.log(`inserted: ${name}`);
      inserted++;
      continue;
    }

    const patch: { youtubeLink?: string; usesBarbell?: boolean } = {};
    // Never overwrite a real link; do fill NULL or '' left by earlier tooling.
    // Skip entirely when the map intentionally provides no link (youtubeLink
    // undefined) — e.g. a shared barbell lift we don't want a video forced on.
    if (youtubeLink && !existing[0].youtubeLink) {
      patch.youtubeLink = youtubeLink;
    }
    // For the program's new exercises this map is authoritative for
    // usesBarbell: the startup seeder may have inserted the row first with a
    // wrong name-pattern guess. Pre-existing rows keep their flag.
    if (isNew && existing[0].usesBarbell !== usesBarbell) {
      patch.usesBarbell = usesBarbell;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(exercises).set(patch).where(eq(exercises.name, name));
      console.log(`updated:  ${name} (${Object.keys(patch).join(', ')})`);
      updated++;
    } else {
      untouched++;
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated} untouched=${untouched}`);
  await pool.end();
}

importMinMaxExercises().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
