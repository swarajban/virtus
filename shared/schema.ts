import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, varchar, integer, real, boolean, jsonb, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Exercise table - stores exercise definitions
export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).unique().notNull(),
  notes: text("notes"),
  youtubeLink: varchar("youtube_link", { length: 500 }),
  usesBarbell: boolean("uses_barbell").default(true).notNull(),
  onerm: real("onerm"),
  onermExerciseId: integer("onerm_exercise_id").references(() => exercises.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_exercise_name").on(table.name),
  index("idx_exercise_onerm").on(table.onermExerciseId),
]);

// User table - stores usernames
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).unique().notNull(),
  selectedProgram: varchar("selected_program", { length: 255 }).notNull().default("Powerbuilding 4x"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One Rep Max table - stores user's 1RM values
export const oneRepMaxes = pgTable("one_rep_maxes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  backSquat: real("back_squat").default(135),
  benchPress: real("bench_press").default(95),
  deadlift: real("deadlift").default(185),
  overheadPress: real("overhead_press").default(65),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_orm_user_id").on(table.userId),
]);

// Workout Progress table - stores workout completion status and progress
export const workoutProgress = pgTable("workout_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  programName: varchar("program_name", { length: 255 }).notNull().default("Powerbuilding 4x"),
  workoutNumber: integer("workout_number").notNull(),
  sessionId: varchar("session_id", { length: 255 }), // Unique ID for each workout attempt
  status: varchar("status", { length: 20 }).notNull(), // 'not_started', 'in_progress', 'completed'
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  exerciseProgress: jsonb("exercise_progress").default({}).notNull(), // JSON object with exercise completion data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_wp_user_workout").on(table.userId, table.workoutNumber),
  index("idx_wp_session").on(table.sessionId),
]);

// Exercise History table - stores historical exercise performance data
export const exerciseHistory = pgTable("exercise_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  programName: varchar("program_name", { length: 255 }).notNull().default("Powerbuilding 4x"),
  exerciseId: integer("exercise_id").notNull().references(() => exercises.id),
  exerciseName: varchar("exercise_name", { length: 255 }), // Keep for migration, will be removed later
  sessionId: varchar("session_id", { length: 255 }), // Links to specific workout session
  sets: integer("sets").notNull(),
  reps: integer("reps").notNull(),
  weight: real("weight").notNull(),
  notes: text("notes"),
  typeOfSet: varchar("type_of_set", { length: 20 }).default("working"),
  performedAt: timestamp("performed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_eh_user_exercise").on(table.userId, table.exerciseId),
  index("idx_eh_performed_at").on(table.performedAt),
  index("idx_eh_session").on(table.sessionId),
]);

// Define relations
export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  exerciseHistories: many(exerciseHistory),
  parentExercise: one(exercises, {
    fields: [exercises.onermExerciseId],
    references: [exercises.id],
  }),
}));

export const exerciseHistoryRelations = relations(exerciseHistory, ({ one }) => ({
  user: one(users, {
    fields: [exerciseHistory.userId],
    references: [users.id],
  }),
  exercise: one(exercises, {
    fields: [exerciseHistory.exerciseId],
    references: [exercises.id],
  }),
}));

// Derive schemas and types for database tables
export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
  createdAt: true,
});
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type ExerciseDB = typeof exercises.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertOneRepMaxSchema = createInsertSchema(oneRepMaxes).omit({
  id: true,
  updatedAt: true,
});
export type InsertOneRepMax = z.infer<typeof insertOneRepMaxSchema>;
export type OneRepMax = typeof oneRepMaxes.$inferSelect;

export const insertWorkoutProgressSchema = createInsertSchema(workoutProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkoutProgress = z.infer<typeof insertWorkoutProgressSchema>;
export type WorkoutProgressDB = typeof workoutProgress.$inferSelect;

export const insertExerciseHistorySchema = createInsertSchema(exerciseHistory).omit({
  id: true,
  performedAt: true,
});
export type InsertExerciseHistory = z.infer<typeof insertExerciseHistorySchema>;
export type ExerciseHistoryDB = typeof exerciseHistory.$inferSelect;

// Keep original Zod schemas for JSON data and client-side types
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

export const programSchema = z.object({
  name: z.string(),
  workouts: z.array(workoutSchema),
});

export const programsDataSchema = z.object({
  programs: z.array(programSchema),
});

export const exerciseProgressSchema = z.object({
  sets: z.number(),
  reps: z.number(),
  weight: z.number().optional(),
  notes: z.string().optional(),
  completed: z.boolean().default(false),
});

export const workoutProgressSchema = z.object({
  programName: z.string().default("Powerbuilding 4x"),
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
  programName: z.string().default("Powerbuilding 4x"),
  exerciseName: z.string(),
  sets: z.number(),
  reps: z.number(),
  weight: z.number(),
  notes: z.string().optional(),
  typeOfSet: z.enum(["warm-up", "working"]).optional(),
});

export type Exercise = z.infer<typeof exerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type ExerciseProgress = z.infer<typeof exerciseProgressSchema>;
export type WorkoutProgress = z.infer<typeof workoutProgressSchema>;
export type OneRM = z.infer<typeof oneRMSchema>;
export type ExerciseHistoryEntry = z.infer<typeof exerciseHistoryEntrySchema>;
