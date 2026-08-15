import type { WorkoutProgress, OneRM, ExerciseHistoryEntry } from "@shared/schema";
import { api } from "./api-client";

// Simple in-memory cache for API data to reduce calls
let cache = {
  oneRM: null as OneRM | null,
  workoutProgress: null as Record<number, WorkoutProgress> | null,
  // True once a full GET of the server map has succeeded. Distinct from
  // `workoutProgress != null`, which a single optimistic save also flips on with
  // only ONE workout present — a partial map that does NOT tell the truth for
  // other workouts. Only a full fetch makes the cache authoritative.
  workoutProgressFetched: false,
  lastFetch: {
    oneRM: 0,
    workoutProgress: 0,
  }
};

const CACHE_DURATION = 2000; // 2 seconds

// Serializes workout-progress POSTs. The server overwrites exerciseProgress
// WHOLESALE (no per-key merge), so two completions racing on flaky wifi could
// otherwise overwrite each other. Chaining the writes — and sending the latest
// accumulated map on each — guarantees the final POST carries every completion.
let workoutProgressSaveChain: Promise<void> = Promise.resolve();

// Count of queued-but-unsettled saves per workout. While a workout has a
// pending save, a wholesale refetch must not replace its cache entry with the
// server's older row — that would regress an optimistic completion back to
// in_progress and the queued POST would then persist the regression.
const pendingWorkoutProgressSaves = new Map<number, number>();

const STATUS_RANK: Record<WorkoutProgress["status"], number> = {
  not_started: 0,
  in_progress: 1,
  completed: 2,
};

// Merge two snapshots of the same workout's progress without ever downgrading
// status. Within a session, status only moves forward (a reset DELETEs the row
// instead of posting a downgrade), so whichever side is further along wins —
// and completedAt travels WITH the completed status as an atomic pair: it is
// present iff the merged status is completed. This is what makes a completion
// un-clobberable: a stale in_progress snapshot merged in any order can no
// longer produce {status: in_progress, completedAt: set}.
// exerciseProgress is a per-key union with `next` (the newer side) winning.
// The {...base, ...next} spread is NOT redundant with the explicit fields
// below: it fills keys only one side carries (server-fetched entries have no
// programName, client snapshots always do).
function mergeWorkoutProgress(
  base: WorkoutProgress | undefined,
  next: WorkoutProgress
): WorkoutProgress {
  if (!base) return next;
  const status =
    STATUS_RANK[next.status] >= STATUS_RANK[base.status] ? next.status : base.status;
  const completedAt =
    status === "completed"
      ? next.completedAt ?? base.completedAt ?? new Date().toISOString()
      : undefined;
  return {
    ...base,
    ...next,
    status,
    completedAt,
    startedAt: next.startedAt ?? base.startedAt,
    exerciseProgress: {
      ...(base.exerciseProgress ?? {}),
      ...(next.exerciseProgress ?? {}),
    },
  };
}

export class DatabaseStorage {
  // Initialize with user selection
  static async initialize() {
    try {
      // Check if a user is selected first, default to 'swaraj'
      let username = localStorage.getItem('selected-username');
      if (!username) {
        console.log("No user selected, defaulting to 'swaraj'");
        username = 'swaraj';
        localStorage.setItem('selected-username', username);
      }
      
      console.log("Initializing with user:", username);
    } catch (error) {
      console.error("Failed to initialize:", error);
    }
  }

  // Synchronous read of the last-fetched workout progress from the in-memory
  // cache — no network. Used on the completion hot path so advancing to the next
  // exercise never blocks on a GET. Returns {} if nothing has been fetched yet.
  static getCachedWorkoutProgress(): Record<number, WorkoutProgress> {
    return cache.workoutProgress ?? {};
  }

  static getCachedOneRM(): OneRM | null {
    return cache.oneRM;
  }

  // True once a full GET of the workout-progress map has succeeded. A fetched
  // cache tells the full truth for every workout — a workout with no entry is
  // genuinely not_started — so callers can treat it as authoritative without a
  // network round-trip. NOTE: a single optimistic saveWorkoutProgress() makes
  // `workoutProgress` non-null with only ONE workout, which would WRONGLY report
  // every other workout as not_started; we gate on the fetched flag (not
  // null-ness) so a save-only/partial cache is still treated as cold.
  static hasCachedWorkoutProgress(): boolean {
    return cache.workoutProgressFetched;
  }

  // Get workout progress directly from API with light caching
  static async getWorkoutProgress(): Promise<Record<number, WorkoutProgress>> {
    try {
      // Return fresh data from API
      const progress = await api.getWorkoutProgress();
      // The server map replaces the cache WHOLESALE — that is what keeps the
      // flat, cycle-unaware cache honest across a program/cycle switch (old
      // cycle entries vanish because the new cycle's fetch doesn't contain
      // them). The one exception: workouts with a save still in flight. Their
      // optimistic entry is FURTHER ALONG than the server row this response
      // was built from, so replacing it would regress a completion that the
      // queued POST is about to (re)send. Keep those, merged monotonically.
      let merged: Record<number, WorkoutProgress> = progress;
      if (pendingWorkoutProgressSaves.size > 0) {
        merged = { ...progress };
        for (const [key, entry] of Object.entries(cache.workoutProgress ?? {})) {
          const workoutNumber = Number(key);
          if ((pendingWorkoutProgressSaves.get(workoutNumber) ?? 0) > 0) {
            merged[workoutNumber] = mergeWorkoutProgress(merged[workoutNumber], entry);
          }
        }
      }
      cache.workoutProgress = merged;
      cache.workoutProgressFetched = true;
      cache.lastFetch.workoutProgress = Date.now();
      return merged;
    } catch (error) {
      console.error("Failed to fetch workout progress:", error);
      return cache.workoutProgress || {};
    }
  }

  // Prefer the optimistic in-memory accumulator over a network refetch — so
  // navigating to the next exercise doesn't clobber an in-flight completion's
  // optimistic state with stale server data. Only hits the network when nothing
  // has been cached yet (first load / deep link).
  static async getWorkoutProgressPreferCache(): Promise<Record<number, WorkoutProgress>> {
    if (cache.workoutProgress) return cache.workoutProgress;
    return this.getWorkoutProgress();
  }

  // Save workout progress to the API. The completion path fires this WITHOUT
  // blocking navigation, so writes can overlap. To stay correct against the
  // server's wholesale overwrite of exerciseProgress:
  //  1) update the in-memory accumulator synchronously (so the next completion
  //     and the next queued POST both see this write immediately);
  //  2) serialize the POSTs and, at send time, POST the latest accumulated map
  //     merged with this write's own snapshot — so no completion is ever dropped,
  //     even if a refetch clobbered the cache or an earlier POST is retrying.
  static saveWorkoutProgress(workoutNumber: number, progress: WorkoutProgress): Promise<void> {
    // 1) Optimistic local accumulator update — monotonic merge, so a write
    //    carrying an older status (e.g. an exercise-complete's in_progress
    //    snapshot) can never knock a just-completed workout back down.
    cache.workoutProgress = {
      ...(cache.workoutProgress ?? {}),
      [workoutNumber]: mergeWorkoutProgress(cache.workoutProgress?.[workoutNumber], progress),
    };

    // 2) Serialized network write that always sends the freshest full map.
    const run = async () => {
      // At send time, merge this write's own snapshot with the accumulator:
      // later completions (latest) win per exercise key, this write's entries
      // fill anything a clobbering refetch dropped, and the monotonic status
      // rule guarantees the body can never pair completedAt with a status
      // that a stale snapshot dragged back to in_progress.
      const latest = cache.workoutProgress?.[workoutNumber];
      const body: WorkoutProgress = latest ? mergeWorkoutProgress(progress, latest) : progress;
      await api.saveWorkoutProgress(workoutNumber, body);
      // Fold what we persisted back into the cache. Merging (not overwriting)
      // matters: a NEWER write may have been queued while this POST was in
      // flight, and overwriting would regress its optimistic status until its
      // own turn — the exact window that produced completed_at-without-status
      // rows. If the entry was cleared (reset) mid-flight, don't resurrect it.
      const current = cache.workoutProgress?.[workoutNumber];
      if (current) {
        cache.workoutProgress = {
          ...cache.workoutProgress,
          [workoutNumber]: mergeWorkoutProgress(body, current),
        };
      }
      cache.lastFetch.workoutProgress = Date.now();
    };

    // Track the in-flight save so a concurrent refetch won't replace this
    // workout's optimistic entry with the server's older row (see
    // getWorkoutProgress). Released when this save settles either way.
    pendingWorkoutProgressSaves.set(
      workoutNumber,
      (pendingWorkoutProgressSaves.get(workoutNumber) ?? 0) + 1
    );
    const release = () => {
      const remaining = (pendingWorkoutProgressSaves.get(workoutNumber) ?? 1) - 1;
      if (remaining <= 0) pendingWorkoutProgressSaves.delete(workoutNumber);
      else pendingWorkoutProgressSaves.set(workoutNumber, remaining);
    };

    const result = workoutProgressSaveChain.then(run, run);
    // One derived promise does double duty: release the pending marker on
    // either outcome AND keep the chain alive (release returns undefined and
    // never throws). The caller handles its own rejection via `result` (e.g.
    // the completion path's retry loop).
    workoutProgressSaveChain = result.then(release, release);
    return result;
  }



  // Get OneRM directly from API with light caching
  static async getOneRM(): Promise<OneRM> {
    try {
      const oneRM = await api.getOneRM();
      cache.oneRM = oneRM;
      cache.lastFetch.oneRM = Date.now();
      return oneRM;
    } catch (error) {
      console.error("Failed to fetch OneRM:", error);
      // Return cached data if available, otherwise defaults
      return cache.oneRM || {
        backSquat: 135,
        benchPress: 95,
        deadlift: 185,
        overheadPress: 65,
      };
    }
  }

  // Prefer the in-memory cached 1RMs over a network refetch, so navigating into
  // an exercise on a warm session renders instantly instead of blocking on the
  // GET. getOneRM() awaits the network and only falls back to cache on FAILURE
  // (not slowness), so a hung request would otherwise keep the page spinner up.
  // Only hits the network when nothing has been cached yet (first load / deep
  // link); mirrors getWorkoutProgressPreferCache (no per-call revalidation —
  // the cache is refreshed by the next getOneRM()/saveOneRM()).
  static async getOneRMPreferCache(): Promise<OneRM> {
    if (cache.oneRM) return cache.oneRM;
    return this.getOneRM();
  }

  // Save OneRM directly to API
  static async saveOneRM(oneRM: OneRM): Promise<void> {
    try {
      await api.saveOneRM(oneRM);
      // Update cache after successful save
      cache.oneRM = oneRM;
      cache.lastFetch.oneRM = Date.now();
    } catch (error) {
      console.error("Failed to save OneRM:", error);
      throw error;
    }
  }

  // Get exercise history directly from API
  static async getExerciseHistory(): Promise<ExerciseHistoryEntry[]> {
    try {
      return await api.getExerciseHistory();
    } catch (error) {
      console.error("Failed to fetch exercise history:", error);
      return [];
    }
  }

  // Save exercise history directly to API
  static async saveExerciseHistory(entry: ExerciseHistoryEntry, workoutNumber?: number): Promise<void> {
    try {
      console.log("Saving exercise history to API:", entry, "for workout", workoutNumber);
      await api.saveExerciseHistory(entry, workoutNumber);
      console.log("Exercise history saved to API successfully");
    } catch (error) {
      console.error("Failed to save exercise history to API:", error);
      throw error;
    }
  }

  // Save multiple exercise-history rows (set-groups) for one exercise+session
  // atomically. NETWORK call — never await on a tap's hot path (the completion
  // path fires it through persistWithRetry, off the navigation path).
  static async saveExerciseHistoryBatch(entries: ExerciseHistoryEntry[], workoutNumber?: number): Promise<void> {
    try {
      await api.saveExerciseHistoryBatch(entries, workoutNumber);
      console.log("Exercise history batch saved to API successfully");
    } catch (error) {
      console.error("Failed to save exercise history batch to API:", error);
      throw error;
    }
  }

  // Delete exercise history entry directly from API
  static async deleteExerciseHistoryEntry(entryId: number): Promise<void> {
    try {
      console.log("Deleting exercise history entry:", entryId);
      await api.deleteExerciseHistoryEntry(entryId);
      console.log("Exercise history entry deleted successfully");
    } catch (error) {
      console.error("Failed to delete exercise history entry:", error);
      throw error;
    }
  }

  // Delete several exercise-history rows at once (a whole session's set-groups).
  static async deleteExerciseHistoryEntries(entryIds: number[]): Promise<void> {
    try {
      await api.deleteExerciseHistoryEntries(entryIds);
      console.log("Exercise history entries deleted successfully");
    } catch (error) {
      console.error("Failed to delete exercise history entries:", error);
      throw error;
    }
  }

  // Clear workout progress directly from API. Serialized through the SAME
  // chain as saves: a completion POST still queued for this workout must land
  // BEFORE the DELETE — otherwise the queued write would re-create the row
  // right after the reset and the workout would resurrect as completed on the
  // next refetch. Reset came last, so reset must win.
  static clearWorkoutProgress(workoutNumber: number): Promise<void> {
    const run = async () => {
      try {
        await api.clearWorkoutProgress(workoutNumber);
        // Drop the local entry too — otherwise the stale completed snapshot
        // lingers in the accumulator and the monotonic merge would resurrect it
        // on the next save (a reset MUST be able to go back to not_started).
        if (cache.workoutProgress && workoutNumber in cache.workoutProgress) {
          const next = { ...cache.workoutProgress };
          delete next[workoutNumber];
          cache.workoutProgress = next;
        }
        console.log("Workout progress cleared successfully");
      } catch (error) {
        console.error("Failed to clear workout progress:", error);
        throw error;
      }
    };
    const result = workoutProgressSaveChain.then(run, run);
    // Keep the chain alive whichever way the DELETE settles; the caller
    // handles rejection via `result`.
    workoutProgressSaveChain = result.then(() => undefined, () => undefined);
    return result;
  }

  // Clear exercise history for a workout directly from API
  static async clearExerciseHistoryForWorkout(workoutNumber: number): Promise<void> {
    try {
      await api.clearExerciseHistoryForWorkout(workoutNumber);
      console.log("Exercise history cleared for workout successfully");
    } catch (error) {
      console.error("Failed to clear exercise history for workout:", error);
      throw error;
    }
  }
}

// Export as default for easier imports
export { DatabaseStorage as LocalStorage };

// Initialize on load
if (typeof window !== 'undefined') {
  DatabaseStorage.initialize();
}
