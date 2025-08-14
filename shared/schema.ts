import { z } from "zod";

export const exerciseSchema = z.object({
  name: z.string(),
  superset_label: z.string().nullable(),
  type_of_set: z.enum(["warm-up", "working"]),
  number_of_sets: z.number(),
  number_of_reps: z.number().nullable(),
  is_amrap: z.boolean(),
  load_percentage: z.number().nullable(),
  rpe: z.number().nullable(),
  notes: z.string(),
});

export const workoutSchema = z.object({
  workout_number: z.number(),
  week_number: z.number(),
  day_number: z.number(),
  workout_name: z.string(),
  exercises: z.array(exerciseSchema),
});

export const exerciseProgressSchema = z.object({
  sets: z.number(),
  reps: z.number(),
  weight: z.number().optional(),
  notes: z.string().optional(),
  completed: z.boolean().default(false),
});

export const workoutProgressSchema = z.object({
  workoutNumber: z.number(),
  status: z.enum(["not_started", "in_progress", "completed"]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  exerciseProgress: z.record(exerciseProgressSchema).optional(),
});

export const oneRMSchema = z.object({
  backSquat: z.number(),
  benchPress: z.number(),
  deadlift: z.number(),
  overheadPress: z.number(),
});

export const exerciseHistoryEntrySchema = z.object({
  date: z.string(),
  exerciseName: z.string(),
  sets: z.number(),
  reps: z.number(),
  weight: z.number(),
  notes: z.string().optional(),
});

export type Exercise = z.infer<typeof exerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type ExerciseProgress = z.infer<typeof exerciseProgressSchema>;
export type WorkoutProgress = z.infer<typeof workoutProgressSchema>;
export type OneRM = z.infer<typeof oneRMSchema>;
export type ExerciseHistoryEntry = z.infer<typeof exerciseHistoryEntrySchema>;
