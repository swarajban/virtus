#!/usr/bin/env tsx
/**
 * Idempotent exercise import for the "Min-Max 5x" program.
 *
 * For every exercise the program references (after dedup against existing
 * DB names):
 *  - inserts the exercise with its YouTube demo link if it doesn't exist yet
 *  - fills in youtube_link on existing exercises that have none
 * Existing youtube_link values are never overwritten. Safe to re-run.
 *
 * Usage:
 * - Development: DIRECT_DATABASE_URL=<dev branch url> tsx scripts/import-minmax-exercises.ts
 * - Production:  DIRECT_DATABASE_URL=<prod url> tsx scripts/import-minmax-exercises.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { exercises } from '../shared/schema';
import { eq, isNull, and } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// name -> { youtubeLink, usesBarbell }. Names already deduped against the DB
// (e.g. program "Cable Crunch" -> DB "Cable Crunch (Abs)").
const MINMAX_EXERCISES: Record<string, { youtubeLink: string; usesBarbell: boolean }> = {
  // Existing DB names (only their missing youtube_link gets filled)
  'Back squat': { youtubeLink: 'https://youtu.be/v3N4tpPpmyQ', usesBarbell: true },
  'Cable Crunch (Abs)': { youtubeLink: 'https://youtu.be/LvJM9V3D_CQ', usesBarbell: false },
  'Chest-supported T-Bar row': { youtubeLink: 'https://youtu.be/-FAxUZoPDc4', usesBarbell: true },
  'Constant-Tension Cable Triceps Kickback': { youtubeLink: 'https://youtu.be/FGJ64JyKod0', usesBarbell: false },
  'Deadlift': { youtubeLink: 'https://youtu.be/xbnan2iNh-Q', usesBarbell: true },
  'Hip abduction': { youtubeLink: 'https://youtu.be/iGd7fQffkkM', usesBarbell: false },
  'Incline bench press': { youtubeLink: 'https://youtu.be/ad0NL7TH2-I', usesBarbell: true },
  'Leg extension': { youtubeLink: 'https://youtu.be/G0_M9LBCT0o', usesBarbell: false },
  'Leg press': { youtubeLink: 'https://youtu.be/ksBaBSfmZf4', usesBarbell: false },
  'Lying leg curl': { youtubeLink: 'https://youtu.be/y28L1m1PYUQ', usesBarbell: false },
  'Rope Overhead Triceps Extension': { youtubeLink: 'https://youtu.be/7GvY7yTEepM', usesBarbell: false },
  'Standing calf raise': { youtubeLink: 'https://youtu.be/WMkCGNwo5ts', usesBarbell: false },
  'Triceps pressdown': { youtubeLink: 'https://youtu.be/B5S2mbg0g5c', usesBarbell: false },
  // New exercises introduced by Min-Max 5x
  '1-Arm Reverse Pec Deck': { youtubeLink: 'https://youtu.be/WkI6IHmYORY', usesBarbell: false },
  'Alternating DB Curl': { youtubeLink: 'https://youtu.be/kSxgX6HIYxQ', usesBarbell: false },
  'Bayesian Cable Curl': { youtubeLink: 'https://youtu.be/_w_Uan2dG-4', usesBarbell: false },
  'Close-Grip Lat Pulldown': { youtubeLink: 'https://youtu.be/7l859qd4E48', usesBarbell: false },
  'DB Wrist Curl': { youtubeLink: 'https://youtu.be/HJx1sIZKDqk', usesBarbell: false },
  'DB Wrist Extension': { youtubeLink: 'https://youtu.be/uCAoI5FnLhs', usesBarbell: false },
  'Dead Hang (optional)': { youtubeLink: 'https://youtu.be/5M8uPbfQsbg', usesBarbell: false },
  'Dragon Flag': { youtubeLink: 'https://youtu.be/p6VfK1YDhhQ', usesBarbell: false },
  'EZ-Bar Preacher Curl': { youtubeLink: 'https://youtu.be/zX0KvQCLbac', usesBarbell: false },
  'High-Cable Lateral Raise': { youtubeLink: 'https://youtu.be/DX1WzS7k0Uc', usesBarbell: false },
  'Incline DB Y-Raise': { youtubeLink: 'https://youtu.be/xaOQJjzNrd8', usesBarbell: false },
  'Kelso Shrug': { youtubeLink: 'https://youtu.be/76rz0UNAlYI', usesBarbell: false },
  'Machine Chest Press': { youtubeLink: 'https://youtu.be/qTSTOVVr8rU', usesBarbell: false },
  'Machine Hip Thrust': { youtubeLink: 'https://youtu.be/ELgSmlwFsFQ', usesBarbell: false },
  'Machine Lateral Raise': { youtubeLink: 'https://youtu.be/nc6pAci8Tpg', usesBarbell: false },
  'Machine Shrug': { youtubeLink: 'https://youtu.be/2KDc6iAcrAw', usesBarbell: false },
  'Modified Zottman Curl': { youtubeLink: 'https://youtu.be/J0l0qQCy80Q', usesBarbell: false },
  'Pec Deck': { youtubeLink: 'https://youtu.be/xei-JEpfAS4', usesBarbell: false },
  'Pull-Up (Wide Grip)': { youtubeLink: 'https://youtu.be/oB27u_w3pX4', usesBarbell: false },
  'Smith Machine Lunge': { youtubeLink: 'https://youtu.be/FPIsTw-jh5s', usesBarbell: false },
};

async function importMinMaxExercises() {
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DIRECT_DATABASE_URL or DATABASE_URL must be set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });

  let inserted = 0;
  let linked = 0;
  let untouched = 0;

  for (const [name, { youtubeLink, usesBarbell }] of Object.entries(MINMAX_EXERCISES)) {
    const existing = await db.select().from(exercises).where(eq(exercises.name, name));

    if (existing.length === 0) {
      await db.insert(exercises).values({ name, youtubeLink, usesBarbell });
      console.log(`inserted: ${name}`);
      inserted++;
    } else if (existing[0].youtubeLink === null) {
      await db
        .update(exercises)
        .set({ youtubeLink })
        .where(and(eq(exercises.name, name), isNull(exercises.youtubeLink)));
      console.log(`linked:   ${name}`);
      linked++;
    } else {
      untouched++;
    }
  }

  console.log(`\nDone. inserted=${inserted} youtube_link filled=${linked} untouched=${untouched}`);
  await pool.end();
}

importMinMaxExercises().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
