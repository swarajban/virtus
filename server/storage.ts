import { 
  users, 
  oneRepMaxes,
  workoutProgress,
  exerciseHistory,
  type User, 
  type InsertUser,
  type OneRepMax,
  type InsertOneRepMax,
  type WorkoutProgressDB,
  type InsertWorkoutProgress,
  type ExerciseHistoryDB,
  type InsertExerciseHistory,
  type WorkoutProgress,
  type OneRM,
  type ExerciseHistoryEntry
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // One Rep Max operations
  getOneRepMax(userId: number): Promise<OneRM | null>;
  saveOneRepMax(userId: number, oneRM: OneRM): Promise<void>;
  
  // Workout Progress operations
  getWorkoutProgress(userId: number): Promise<Record<number, WorkoutProgress>>;
  saveWorkoutProgress(userId: number, workoutNumber: number, progress: WorkoutProgress): Promise<void>;
  
  // Exercise History operations  
  getExerciseHistory(userId: number, exerciseName?: string): Promise<ExerciseHistoryEntry[]>;
  saveExerciseHistory(userId: number, history: ExerciseHistoryEntry): Promise<void>;
  clearWorkoutProgress(userId: number, workoutNumber: number): Promise<void>;
  clearExerciseHistoryForWorkout(userId: number, workoutNumber: number): Promise<void>;
  updateUserProgram(userId: number, programName: string): Promise<void>;
  clearAllProgress(userId: number): Promise<void>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getOneRepMax(userId: number): Promise<OneRM | null> {
    const [orm] = await db
      .select()
      .from(oneRepMaxes)
      .where(eq(oneRepMaxes.userId, userId))
      .orderBy(desc(oneRepMaxes.updatedAt))
      .limit(1);
    
    if (!orm) return null;
    
    return {
      backSquat: orm.backSquat || 135,
      benchPress: orm.benchPress || 95,
      deadlift: orm.deadlift || 185,
      overheadPress: orm.overheadPress || 65,
    };
  }

  async saveOneRepMax(userId: number, oneRM: OneRM): Promise<void> {
    const existing = await db
      .select()
      .from(oneRepMaxes)
      .where(eq(oneRepMaxes.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(oneRepMaxes)
        .set({
          backSquat: oneRM.backSquat,
          benchPress: oneRM.benchPress,
          deadlift: oneRM.deadlift,
          overheadPress: oneRM.overheadPress,
          updatedAt: new Date(),
        })
        .where(eq(oneRepMaxes.userId, userId));
    } else {
      await db
        .insert(oneRepMaxes)
        .values({
          userId,
          backSquat: oneRM.backSquat,
          benchPress: oneRM.benchPress,
          deadlift: oneRM.deadlift,
          overheadPress: oneRM.overheadPress,
        });
    }
  }

  async getWorkoutProgress(userId: number): Promise<Record<number, WorkoutProgress>> {
    const progresses = await db
      .select()
      .from(workoutProgress)
      .where(eq(workoutProgress.userId, userId));
    
    const result: Record<number, WorkoutProgress> = {};
    for (const progress of progresses) {
      result[progress.workoutNumber] = {
        workoutNumber: progress.workoutNumber,
        status: progress.status as "not_started" | "in_progress" | "completed",
        startedAt: progress.startedAt?.toISOString(),
        completedAt: progress.completedAt?.toISOString(),
        exerciseProgress: progress.exerciseProgress as any,
      };
    }
    return result;
  }

  async saveWorkoutProgress(userId: number, workoutNumber: number, progress: WorkoutProgress): Promise<void> {
    const existing = await db
      .select()
      .from(workoutProgress)
      .where(and(
        eq(workoutProgress.userId, userId),
        eq(workoutProgress.workoutNumber, workoutNumber)
      ))
      .limit(1);

    const dbProgress = {
      userId,
      workoutNumber,
      status: progress.status,
      startedAt: progress.startedAt ? new Date(progress.startedAt) : null,
      completedAt: progress.completedAt ? new Date(progress.completedAt) : null,
      exerciseProgress: progress.exerciseProgress || {},
    };

    if (existing.length > 0) {
      await db
        .update(workoutProgress)
        .set({
          ...dbProgress,
          updatedAt: new Date(),
        })
        .where(and(
          eq(workoutProgress.userId, userId),
          eq(workoutProgress.workoutNumber, workoutNumber)
        ));
    } else {
      await db
        .insert(workoutProgress)
        .values(dbProgress);
    }
  }

  async getExerciseHistory(userId: number, exerciseName?: string): Promise<ExerciseHistoryEntry[]> {
    let query = db
      .select()
      .from(exerciseHistory)
      .where(and(
        eq(exerciseHistory.userId, userId),
        eq(exerciseHistory.typeOfSet, "working") // Only get working sets
      ))
      .orderBy(desc(exerciseHistory.performedAt));
    
    if (exerciseName) {
      query = db
        .select()
        .from(exerciseHistory)
        .where(and(
          eq(exerciseHistory.userId, userId),
          eq(exerciseHistory.exerciseName, exerciseName),
          eq(exerciseHistory.typeOfSet, "working") // Only get working sets
        ))
        .orderBy(desc(exerciseHistory.performedAt));
    }
    
    const histories = await query;
    
    return histories.map(h => ({
      date: h.performedAt.toISOString(),
      exerciseName: h.exerciseName,
      sets: h.sets,
      reps: h.reps,
      weight: h.weight,
      notes: h.notes || undefined,
      typeOfSet: h.typeOfSet as "warm-up" | "working" | undefined,
    }));
  }

  async saveExerciseHistory(userId: number, history: ExerciseHistoryEntry): Promise<void> {
    console.log("Inserting exercise history:", {
      userId,
      exerciseName: history.exerciseName,
      sets: history.sets,
      reps: history.reps,
      weight: history.weight,
      notes: history.notes,
      typeOfSet: history.typeOfSet || "working",
    });
    
    await db
      .insert(exerciseHistory)
      .values({
        userId,
        exerciseName: history.exerciseName,
        sets: history.sets,
        reps: history.reps,
        weight: history.weight,
        notes: history.notes,
        typeOfSet: history.typeOfSet || "working",
      });
    
    console.log("Exercise history saved successfully");
  }

  async clearWorkoutProgress(userId: number, workoutNumber: number): Promise<void> {
    await db
      .delete(workoutProgress)
      .where(and(
        eq(workoutProgress.userId, userId),
        eq(workoutProgress.workoutNumber, workoutNumber)
      ));
    console.log(`Cleared workout progress for user ${userId}, workout ${workoutNumber}`);
  }

  async clearExerciseHistoryForWorkout(userId: number, workoutNumber: number): Promise<void> {
    try {
      // Load workout data to get exercise names
      const fs = await import('fs');
      const path = await import('path');
      const workoutDataPath = path.join(process.cwd(), 'client/public/powerbuilding_data.json');
      const data = JSON.parse(fs.readFileSync(workoutDataPath, 'utf-8'));
      
      // Handle new JSON structure with programs
      const programData = data.programs ? data.programs[0] : { workouts: data };
      const workoutData = programData.workouts || [];
      const workout = workoutData.find((w: any) => w.workout_number === workoutNumber);
      
      if (!workout) {
        console.log(`No workout found with number ${workoutNumber}`);
        return;
      }

      const exerciseNames = workout.exercises.map((ex: any) => ex.name);
      console.log(`Clearing exercise history for workout ${workoutNumber}, exercises:`, exerciseNames);

      // Delete exercise history entries for this workout's exercises
      for (const exerciseName of exerciseNames) {
        await db
          .delete(exerciseHistory)
          .where(and(
            eq(exerciseHistory.userId, userId),
            eq(exerciseHistory.exerciseName, exerciseName)
          ));
      }

      console.log(`Cleared exercise history for workout ${workoutNumber}`);
    } catch (error) {
      console.error('Error clearing exercise history for workout:', error);
      throw error;
    }
  }

  async updateUserProgram(userId: number, programName: string): Promise<void> {
    await db
      .update(users)
      .set({ selectedProgram: programName })
      .where(eq(users.id, userId));
    console.log(`Updated user ${userId} program to ${programName}`);
  }

  async clearAllProgress(userId: number): Promise<void> {
    // Clear all workout progress
    await db
      .delete(workoutProgress)
      .where(eq(workoutProgress.userId, userId));
    
    // Clear all exercise history
    await db
      .delete(exerciseHistory)
      .where(eq(exerciseHistory.userId, userId));
    
    console.log(`Cleared all progress for user ${userId}`);
  }
}

export const storage = new DatabaseStorage();
