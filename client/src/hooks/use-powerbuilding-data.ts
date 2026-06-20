import { useQuery } from "@tanstack/react-query";

/**
 * The program JSON (~646KB) is a STATIC asset that never changes during a
 * session. Fetch it exactly once and serve every subsequent read from cache —
 * navigation must never block on a network round-trip for this file.
 *
 * staleTime/gcTime are Infinity so React Query keeps it in memory for the whole
 * session and never refetches. All pages share the same query key, so the file
 * is fetched once across home → workout → exercise, not per-screen.
 */
export const POWERBUILDING_DATA_KEY = ["powerbuilding-data"] as const;

async function fetchPowerbuildingData() {
  const res = await fetch("/powerbuilding_data.json");
  if (!res.ok) {
    throw new Error(`${res.status}: failed to load workout program data`);
  }
  return res.json();
}

export function usePowerbuildingData() {
  return useQuery({
    queryKey: POWERBUILDING_DATA_KEY,
    queryFn: fetchPowerbuildingData,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}

/** Resolve the workouts array for a program from the raw JSON (handles legacy shape). */
export function resolveProgramWorkouts(data: any, programName: string): any[] {
  if (!data) return [];
  const programData = data.programs
    ? data.programs.find((p: any) => p.name === programName) || data.programs[0]
    : { workouts: data };
  return programData?.workouts || [];
}

/**
 * Walk from `from` in direction `step` (+1 next / -1 previous), skipping hidden
 * warm-up entries, and return the first working-set index. May return an
 * out-of-bounds index (length when going forward past the end, -1 when going
 * back past the start) — callers check the bound to decide where to route.
 */
export function skipWarmups(exercises: any[], from: number, step: 1 | -1): number {
  let i = from;
  while (i >= 0 && i < exercises.length && exercises[i]?.type_of_set === "warm-up") {
    i += step;
  }
  return i;
}
