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

  // Save workout progress directly to API
  static async saveWorkoutProgress(workoutNumber: number, progress: WorkoutProgress): Promise<void> {
    try {
      await api.saveWorkoutProgress(workoutNumber, progress);
      // Update cache after successful save
      if (cache.workoutProgress) {
        cache.workoutProgress[workoutNumber] = progress;
      }
    } catch (error) {
      console.error("Failed to save workout progress:", error);
      throw error;
    }
  }

  // Clear workout progress directly in API
  static async clearWorkoutProgress(workoutNumber: number): Promise<void> {
    try {
      await api.saveWorkoutProgress(workoutNumber, {
        workoutNumber,
        status: "not_started",
        exerciseProgress: {},
      });
      // Update cache after successful clear
      if (cache.workoutProgress) {
        delete cache.workoutProgress[workoutNumber];
      }
    } catch (error) {
      console.error("Failed to clear workout progress:", error);
      throw error;
    }
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
  static async saveExerciseHistory(entry: ExerciseHistoryEntry): Promise<void> {
    try {
      console.log("Saving exercise history to API:", entry);
      await api.saveExerciseHistory(entry);
      console.log("Exercise history saved to API successfully");
    } catch (error) {
      console.error("Failed to save exercise history to API:", error);
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
