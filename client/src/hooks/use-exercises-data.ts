import { useQuery } from "@tanstack/react-query";

/**
 * Shared TanStack Query hooks for the common `/api/*` GET reads.
 *
 * WHY THIS EXISTS (gym-wifi resilience):
 * Several pages used to load `/api/exercises` and `/api/one-rm/all` with raw
 * `await fetch(...)` inside a useEffect. Raw fetches get ZERO of the app's
 * TanStack resilience — no retry/backoff, no staleTime cache, no cached
 * fallback — so a cold fetch on flaky gym wifi could hang for 30s+ with the
 * page stuck on a blocking loader. The reported bug: tapping "Workout" to go
 * back from an exercise hung waiting for the workout list.
 *
 * These hooks route those reads through the shared queryClient
 * (client/src/lib/queryClient.ts: staleTime 5min, gcTime 30min, retry 3 with
 * exponential backoff, refetchOnWindowFocus off). Crucially, every page that
 * needs the full exercise list or every-1RM map consumes the SAME query keys,
 * so the data is fetched once and served from the warm cache across
 * home → workout → exercise → history navigation. Navigating back to the
 * workout page now hits cache and renders INSTANTLY, revalidating in the
 * background, instead of blocking on a cold network round-trip.
 *
 * KEY CHOICE: we reuse the canonical URL-shaped keys `["/api/exercises"]` and
 * `["/api/one-rm/all"]` (already used by exercise-info.tsx and one-rm.tsx via
 * the default queryFn) rather than inventing new ones, so ALL callers share a
 * single cache entry. The default queryFn (getQueryFn in queryClient.ts) builds
 * the URL from the key and injects the `x-username` header — identical header
 * behavior to the old raw fetches.
 */

export const ALL_EXERCISES_KEY = ["/api/exercises"] as const;
export const ALL_ONE_RMS_KEY = ["/api/one-rm/all"] as const;
export const ALL_EXERCISE_HISTORY_KEY = ["/api/exercise-history"] as const;

/** Every exercise in the user's library (id, name, notes, onermExerciseId, …). */
export function useAllExercises<T = any[]>() {
  return useQuery<T>({ queryKey: ALL_EXERCISES_KEY });
}

/** Every per-exercise 1RM record: `{ exerciseId, weight }[]`. */
export function useAllOneRMs<T = any[]>() {
  return useQuery<T>({ queryKey: ALL_ONE_RMS_KEY });
}

/** The full exercise-history log (all exercises), newest-first per the API. */
export function useAllExerciseHistory<T = any[]>() {
  return useQuery<T>({ queryKey: ALL_EXERCISE_HISTORY_KEY });
}

const username = () => localStorage.getItem("selected-username") || "demo";

/**
 * Query options for one exercise's history, keyed by name. Shared shape so a
 * `useQuery`/`useExerciseHistory` consumer and an imperative
 * `queryClient.fetchQuery(...)` hit the SAME cache entry.
 *
 * The key matches the shape exercise-info.tsx already uses
 * (`["/api/exercise-history", { exerciseName }]`) so that cache is shared too.
 * A custom queryFn is required because the default queryFn can't encode a query
 * string from the key.
 */
export function exerciseHistoryQueryOptions(exerciseName: string) {
  return {
    queryKey: ["/api/exercise-history", { exerciseName }] as const,
    queryFn: async () => {
      const res = await fetch(
        `/api/exercise-history?exerciseName=${encodeURIComponent(exerciseName)}`,
        { headers: { "x-username": username() }, credentials: "include" as const },
      );
      if (!res.ok) {
        throw new Error(`${res.status}: failed to load exercise history`);
      }
      return res.json();
    },
  };
}

/** One exercise's history by name (e.g. for the detail/info view). */
export function useExerciseHistory<T = any[]>(exerciseName: string | undefined | null) {
  const name = exerciseName ?? "";
  return useQuery<T>({
    ...exerciseHistoryQueryOptions(name),
    enabled: !!name,
  });
}

/** A single exercise record by id (shares cache with exercise-info.tsx). */
export function useExercise<T = any>(exerciseId: number | undefined | null) {
  return useQuery<T>({
    queryKey: [`/api/exercises/${exerciseId}`],
    enabled: !!exerciseId,
  });
}

/** The 1RM record for a single exercise id (shares cache with exercise-info.tsx). */
export function useOneRMForExercise<T = any>(exerciseId: number | undefined | null) {
  return useQuery<T>({
    queryKey: [`/api/one-rm/exercise/${exerciseId}`],
    enabled: !!exerciseId,
    retry: false,
  });
}
