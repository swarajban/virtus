import type { Workout, WorkoutProgress, OneRM, ExerciseHistoryEntry, Exercise } from "@shared/schema";

export interface WorkoutWithProgress extends Workout {
  progress?: WorkoutProgress;
}

// Derives from the zod-inferred Exercise so new schema fields (e.g. the RIR
// prescriptions) can't silently go missing from this type.
export interface ExerciseWithCalculatedWeight extends Exercise {
  calculatedWeight?: number;
  userWeight?: number;
  userSets?: number;
  userReps?: number;
  userNotes?: string;
  completed?: boolean;
}

export interface AppState {
  workouts: WorkoutWithProgress[];
  oneRM: OneRM;
  exerciseHistory: ExerciseHistoryEntry[];
  currentWorkout?: number;
  currentExercise?: number;
}
