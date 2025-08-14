import type { Workout, WorkoutProgress, OneRM, ExerciseHistoryEntry } from "@shared/schema";

export interface WorkoutWithProgress extends Workout {
  progress?: WorkoutProgress;
}

export interface ExerciseWithCalculatedWeight {
  name: string;
  superset_label: string | null;
  type_of_set: "warm-up" | "working";
  number_of_sets: number;
  number_of_reps: number | null;
  is_amrap: boolean;
  load_percentage: number | null;
  rpe: number | null;
  notes: string;
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
