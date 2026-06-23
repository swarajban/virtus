import type { WorkoutProgress, OneRM, ExerciseHistoryEntry } from "@shared/schema";
import { api } from "./api-client";

// Simple in-memory cache for API data to reduce calls
let cache = {
  oneRM: null as OneRM | null,
  workoutProgress: null as Record<number, WorkoutProgress> | null,
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

  // Get workout progress directly from API with light caching
  static async getWorkoutProgress(): Promise<Record<number, WorkoutProgress>> {
    try {
      // Return fresh data from API
      const progress = await api.getWorkoutProgress();
      cache.workoutProgress = progress;
      cache.lastFetch.workoutProgress = Date.now();
      return progress;
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
    // 1) Optimistic local accumulator update.
    cache.workoutProgress = { ...(cache.workoutProgress ?? {}), [workoutNumber]: progress };

    // 2) Serialized network write that always sends the freshest full map.
    const run = async () => {
      const latest = cache.workoutProgress?.[workoutNumber];
      const body: WorkoutProgress = latest
        ? {
            ...progress,
            ...latest,
            // Union of exercise entries: later completions (latest) win, but this
            // write's own entries fill anything a clobbering refetch dropped.
            exerciseProgress: {
              ...(progress.exerciseProgress ?? {}),
              ...(latest.exerciseProgress ?? {}),
            },
          }
        : progress;
      await api.saveWorkoutProgress(workoutNumber, body);
      // Keep the cache in sync with exactly what we persisted.
      cache.workoutProgress = { ...(cache.workoutProgress ?? {}), [workoutNumber]: body };
      cache.lastFetch.workoutProgress = Date.now();
    };

    const result = workoutProgressSaveChain.then(run, run);
    // Keep the chain alive even if this write rejects; the caller handles its own
    // rejection (e.g. the completion path's retry loop).
    workoutProgressSaveChain = result.then(() => undefined, () => undefined);
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

  // Clear workout progress directly from API
  static async clearWorkoutProgress(workoutNumber: number): Promise<void> {
    try {
      await api.clearWorkoutProgress(workoutNumber);
      console.log("Workout progress cleared successfully");
    } catch (error) {
      console.error("Failed to clear workout progress:", error);
      throw error;
    }
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
