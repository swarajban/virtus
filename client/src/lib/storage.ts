import type { WorkoutProgress, OneRM, ExerciseHistoryEntry } from "@shared/schema";
import { api } from "./api-client";

const STORAGE_KEYS = {
  WORKOUT_PROGRESS: 'virtus_workout_progress',
  ONE_RM: 'virtus_one_rm',
  EXERCISE_HISTORY: 'virtus_exercise_history',
} as const;

// Cache for API data to reduce calls
let cache = {
  oneRM: null as OneRM | null,
  workoutProgress: null as Record<number, WorkoutProgress> | null,
  lastFetch: {
    oneRM: 0,
    workoutProgress: 0,
  }
};

const CACHE_DURATION = 5000; // 5 seconds

export class LocalStorage {
  // Load initial data from API on startup
  static async initialize() {
    try {
      // Check if a user is selected first, default to 'swaraj'
      let username = localStorage.getItem('selected-username');
      if (!username) {
        console.log("No user selected, defaulting to 'swaraj'");
        username = 'swaraj';
        localStorage.setItem('selected-username', username);
      }
      
      // Fetch initial data from API
      const [oneRM, progress] = await Promise.all([
        api.getOneRM(),
        api.getWorkoutProgress()
      ]);
      
      cache.oneRM = oneRM;
      cache.workoutProgress = progress;
      cache.lastFetch.oneRM = Date.now();
      cache.lastFetch.workoutProgress = Date.now();
      
      // Also save to localStorage as backup
      localStorage.setItem(STORAGE_KEYS.ONE_RM, JSON.stringify(oneRM));
      localStorage.setItem(STORAGE_KEYS.WORKOUT_PROGRESS, JSON.stringify(progress));
    } catch (error) {
      console.error("Failed to initialize from API:", error);
    }
  }

  static getWorkoutProgress(): Record<number, WorkoutProgress> {
    // Return cached data first, then fetch in background
    if (cache.workoutProgress) {
      // Refresh cache in background if stale
      if (Date.now() - cache.lastFetch.workoutProgress > CACHE_DURATION) {
        api.getWorkoutProgress().then(progress => {
          cache.workoutProgress = progress;
          cache.lastFetch.workoutProgress = Date.now();
          localStorage.setItem(STORAGE_KEYS.WORKOUT_PROGRESS, JSON.stringify(progress));
        }).catch(console.error);
      }
      return cache.workoutProgress;
    }
    
    // Fallback to localStorage
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKOUT_PROGRESS);
      const progress = data ? JSON.parse(data) : {};
      cache.workoutProgress = progress;
      return progress;
    } catch {
      return {};
    }
  }

  // Force refresh workout progress from database
  static async refreshWorkoutProgress(): Promise<Record<number, WorkoutProgress>> {
    try {
      const progress = await api.getWorkoutProgress();
      cache.workoutProgress = progress;
      cache.lastFetch.workoutProgress = Date.now();
      localStorage.setItem(STORAGE_KEYS.WORKOUT_PROGRESS, JSON.stringify(progress));
      return progress;
    } catch (error) {
      console.error("Failed to refresh workout progress:", error);
      return this.getWorkoutProgress();
    }
  }

  // Clear all cached data and force fresh sync
  static clearCache() {
    cache.oneRM = null;
    cache.workoutProgress = null;
    cache.lastFetch.oneRM = 0;
    cache.lastFetch.workoutProgress = 0;
    localStorage.removeItem(STORAGE_KEYS.WORKOUT_PROGRESS);
    localStorage.removeItem(STORAGE_KEYS.ONE_RM);
    localStorage.removeItem(STORAGE_KEYS.EXERCISE_HISTORY);
    console.log("Cache cleared, will fetch fresh data from database");
  }

  static saveWorkoutProgress(workoutNumber: number, progress: WorkoutProgress) {
    // Update cache immediately
    const allProgress = this.getWorkoutProgress();
    allProgress[workoutNumber] = progress;
    cache.workoutProgress = allProgress;
    
    // Save to localStorage immediately
    localStorage.setItem(STORAGE_KEYS.WORKOUT_PROGRESS, JSON.stringify(allProgress));
    
    // Save to API in background
    api.saveWorkoutProgress(workoutNumber, progress).catch(error => {
      console.error("Failed to save workout progress to API:", error);
    });
  }

  static clearWorkoutProgress(workoutNumber: number) {
    const allProgress = this.getWorkoutProgress();
    delete allProgress[workoutNumber];
    cache.workoutProgress = allProgress;
    localStorage.setItem(STORAGE_KEYS.WORKOUT_PROGRESS, JSON.stringify(allProgress));
    
    // Clear in API
    api.saveWorkoutProgress(workoutNumber, {
      workoutNumber,
      status: "not_started",
      exerciseProgress: {},
    }).catch(console.error);
  }

  static getOneRM(): OneRM {
    // Return cached data first, then fetch in background
    if (cache.oneRM) {
      // Refresh cache in background if stale
      if (Date.now() - cache.lastFetch.oneRM > CACHE_DURATION) {
        api.getOneRM().then(oneRM => {
          cache.oneRM = oneRM;
          cache.lastFetch.oneRM = Date.now();
          localStorage.setItem(STORAGE_KEYS.ONE_RM, JSON.stringify(oneRM));
        }).catch(console.error);
      }
      return cache.oneRM;
    }
    
    // Fallback to localStorage
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ONE_RM);
      const oneRM = data ? JSON.parse(data) : {
        backSquat: 135,
        benchPress: 95,
        deadlift: 185,
        overheadPress: 65,
      };
      cache.oneRM = oneRM;
      return oneRM;
    } catch {
      return {
        backSquat: 135,
        benchPress: 95,
        deadlift: 185,
        overheadPress: 65,
      };
    }
  }

  static saveOneRM(oneRM: OneRM) {
    // Update cache immediately
    cache.oneRM = oneRM;
    cache.lastFetch.oneRM = Date.now();
    
    // Save to localStorage immediately
    localStorage.setItem(STORAGE_KEYS.ONE_RM, JSON.stringify(oneRM));
    
    // Save to API in background
    api.saveOneRM(oneRM).catch(error => {
      console.error("Failed to save 1RM to API:", error);
    });
  }

  static getExerciseHistory(): ExerciseHistoryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISE_HISTORY);
      const history = data ? JSON.parse(data) : [];
      
      // Fetch from API in background to update cache
      api.getExerciseHistory().then(apiHistory => {
        localStorage.setItem(STORAGE_KEYS.EXERCISE_HISTORY, JSON.stringify(apiHistory));
      }).catch(console.error);
      
      return history;
    } catch {
      return [];
    }
  }

  static saveExerciseHistory(entry: ExerciseHistoryEntry) {
    // Save to localStorage immediately
    const history = this.getExerciseHistory();
    history.push(entry);
    localStorage.setItem(STORAGE_KEYS.EXERCISE_HISTORY, JSON.stringify(history));
    
    console.log("Saving exercise history to API:", entry);
    
    // Save to API in background
    api.saveExerciseHistory(entry)
      .then(() => {
        console.log("Exercise history saved to API successfully");
      })
      .catch(error => {
        console.error("Failed to save exercise history to API:", error);
      });
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  LocalStorage.initialize();
  
  // Add debug methods to global scope for troubleshooting
  (window as any).VirtusDebug = {
    clearCache: () => LocalStorage.clearCache(),
    getWorkoutProgress: () => LocalStorage.getWorkoutProgress(),
    refreshWorkoutProgress: () => LocalStorage.refreshWorkoutProgress(),
  };
}
