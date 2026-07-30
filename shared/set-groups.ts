import { z } from "zod";

// Set-group helpers live in their OWN module (no drizzle imports) so the client
// bundle can execute them without pulling in drizzle-orm/pg-core via schema.ts.
// schema.ts re-exports these for server-side convenience.

// One logged set-group: N sets of M reps at a weight. An exercise can be logged
// as several of these (e.g. 2x1 @ 315, then 3x3 @ 275).
export const setGroupSchema = z.object({
  sets: z.number(),
  reps: z.number(),
  weight: z.number().nullable().optional(),
});

export type SetGroup = z.infer<typeof setGroupSchema>;

// Canonical fallback used by EVERY read site: prefer the explicit groups array,
// otherwise synthesize a single group from the legacy top-level sets/reps/weight.
// This is what keeps the pre-groups jsonb and the single-group common case
// rendering identically to before.
export function getSetGroups(progress: {
  sets?: number;
  reps?: number;
  weight?: number | null;
  groups?: SetGroup[] | null;
}): SetGroup[] {
  if (progress.groups && progress.groups.length > 0) return progress.groups;
  return [{ sets: progress.sets ?? 0, reps: progress.reps ?? 0, weight: progress.weight ?? undefined }];
}

// The TOP SET = the group with the heaviest weight (tie-break: first). Groups
// with no weight count as 0. Used for the history chart, the default-weight
// lookup, and the top-level sets/reps/weight we keep in sync for graceful
// degradation. Returns the first group for an empty/degenerate input.
export function getTopSetGroup(groups: SetGroup[]): SetGroup {
  if (groups.length === 0) return { sets: 0, reps: 0, weight: undefined };
  return groups.reduce((top, g) => ((g.weight ?? 0) > (top.weight ?? 0) ? g : top), groups[0]);
}
