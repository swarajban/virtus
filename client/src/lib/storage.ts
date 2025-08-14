import type { WorkoutProgress, OneRM, ExerciseHistoryEntry } from "@shared/schema";

const STORAGE_KEYS = {
  WORKOUT_PROGRESS: 'virtus_workout_progress',
  ONE_RM: 'virtus_one_rm',
  EXERCISE_HISTORY: 'virtus_exercise_history',
} as const;

export class LocalStorage {
  static getWorkoutProgress(): Record<number, WorkoutProgress> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKOUT_PROGRESS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  static saveWorkoutProgress(workoutNumber: number, progress: WorkoutProgress) {
    const allProgress = this.getWorkoutProgress();
    allProgress[workoutNumber] = progress;
    localStorage.setItem(STORAGE_KEYS.WORKOUT_PROGRESS, JSON.stringify(allProgress));
  }

  static getOneRM(): OneRM {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ONE_RM);
      return data ? JSON.parse(data) : {
        backSquat: 275,
        benchPress: 210,
        deadlift: 315,
        overheadPress: 135,
      };
    } catch {
      return {
        backSquat: 275,
        benchPress: 210,
        deadlift: 315,
        overheadPress: 135,
      };
    }
  }

  static saveOneRM(oneRM: OneRM) {
    localStorage.setItem(STORAGE_KEYS.ONE_RM, JSON.stringify(oneRM));
  }

  static getExerciseHistory(): ExerciseHistoryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISE_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveExerciseHistory(entry: ExerciseHistoryEntry) {
    const history = this.getExerciseHistory();
    history.push(entry);
    localStorage.setItem(STORAGE_KEYS.EXERCISE_HISTORY, JSON.stringify(history));
  }
}
