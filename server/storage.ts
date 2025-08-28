import { 
  users, 
  oneRepMaxes,
  workoutProgress,
  exerciseHistory,
  exercises,
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
  type ExerciseHistoryEntry,
  type ExerciseDB,
  type InsertExercise
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, like, sql } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // One Rep Max operations
  getOneRepMax(userId: number): Promise<OneRM | null>; // Legacy - for old clients
  saveOneRepMax(userId: number, oneRM: OneRM): Promise<void>; // Legacy - for old clients
  getOneRepMaxForExercise(userId: number, exerciseId: number): Promise<OneRepMax | null>;
  saveOneRepMaxForExercise(userId: number, exerciseId: number, weight: number): Promise<void>;
  getAllOneRepMaxes(userId: number): Promise<OneRepMax[]>;
  deleteOneRepMax(userId: number, exerciseId: number): Promise<void>;
  
  // Workout Progress operations
  getWorkoutProgress(userId: number): Promise<Record<number, WorkoutProgress>>;
  saveWorkoutProgress(userId: number, workoutNumber: number, progress: WorkoutProgress): Promise<string>;
  
  // Exercise operations
  getExercise(id: number): Promise<ExerciseDB | undefined>;
  getExerciseByName(name: string): Promise<ExerciseDB | undefined>;
  getAllExercises(): Promise<ExerciseDB[]>;
  searchExercises(query: string): Promise<ExerciseDB[]>;
  createExercise(exercise: InsertExercise): Promise<ExerciseDB>;
  updateExercise(id: number, exercise: Partial<InsertExercise>): Promise<void>;
  
  // Exercise History operations  
  getExerciseHistory(userId: number, exerciseName?: string): Promise<ExerciseHistoryEntry[]>;
  saveExerciseHistory(userId: number, history: ExerciseHistoryEntry, workoutNumber?: number): Promise<void>;
  clearWorkoutProgress(userId: number, workoutNumber: number): Promise<void>;
  clearExerciseHistoryForWorkout(userId: number, workoutNumber: number): Promise<void>;
  updateUserProgram(userId: number, programName: string): Promise<void>;
  clearAllProgress(userId: number): Promise<void>;
  recoverProgressFromHistory(userId: number, workoutNumbers: number[]): Promise<any>;
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

  // Legacy method - convert from new schema to old format for backward compatibility
  async getOneRepMax(userId: number): Promise<OneRM | null> {
    // Get exercise IDs for the standard lifts
    const backSquatExercise = await this.getExerciseByName("Back squat");
    const benchExercise = await this.getExerciseByName("Barbell bench press");
    const deadliftExercise = await this.getExerciseByName("Deadlift");
    const ohpExercise = await this.getExerciseByName("Overhead press");
    
    const result: OneRM = {
      backSquat: 135,
      benchPress: 95,
      deadlift: 185,
      overheadPress: 65,
    };
    
    if (backSquatExercise) {
      const orm = await this.getOneRepMaxForExercise(userId, backSquatExercise.id);
      if (orm) result.backSquat = orm.weight;
    }
    if (benchExercise) {
      const orm = await this.getOneRepMaxForExercise(userId, benchExercise.id);
      if (orm) result.benchPress = orm.weight;
    }
    if (deadliftExercise) {
      const orm = await this.getOneRepMaxForExercise(userId, deadliftExercise.id);
      if (orm) result.deadlift = orm.weight;
    }
    if (ohpExercise) {
      const orm = await this.getOneRepMaxForExercise(userId, ohpExercise.id);
      if (orm) result.overheadPress = orm.weight;
    }
    
    return result;
  }

  // Legacy method - convert from old format to new schema for backward compatibility
  async saveOneRepMax(userId: number, oneRM: OneRM): Promise<void> {
    // Get exercise IDs for the standard lifts
    const backSquatExercise = await this.getExerciseByName("Back squat");
    const benchExercise = await this.getExerciseByName("Barbell bench press");
    const deadliftExercise = await this.getExerciseByName("Deadlift");
    const ohpExercise = await this.getExerciseByName("Overhead press");
    
    // Save each 1RM value
    if (backSquatExercise && oneRM.backSquat) {
      await this.saveOneRepMaxForExercise(userId, backSquatExercise.id, oneRM.backSquat);
    }
    if (benchExercise && oneRM.benchPress) {
      await this.saveOneRepMaxForExercise(userId, benchExercise.id, oneRM.benchPress);
    }
    if (deadliftExercise && oneRM.deadlift) {
      await this.saveOneRepMaxForExercise(userId, deadliftExercise.id, oneRM.deadlift);
    }
    if (ohpExercise && oneRM.overheadPress) {
      await this.saveOneRepMaxForExercise(userId, ohpExercise.id, oneRM.overheadPress);
    }
  }

  // New methods for the updated schema
  async getOneRepMaxForExercise(userId: number, exerciseId: number): Promise<OneRepMax | null> {
    const [orm] = await db
      .select()
      .from(oneRepMaxes)
      .where(and(
        eq(oneRepMaxes.userId, userId),
        eq(oneRepMaxes.exerciseId, exerciseId)
      ))
      .limit(1);
    
    return orm || null;
  }

  async saveOneRepMaxForExercise(userId: number, exerciseId: number, weight: number): Promise<void> {
    const existing = await this.getOneRepMaxForExercise(userId, exerciseId);

    if (existing) {
      await db
        .update(oneRepMaxes)
        .set({
          weight,
          updatedAt: new Date(),
        })
        .where(and(
          eq(oneRepMaxes.userId, userId),
          eq(oneRepMaxes.exerciseId, exerciseId)
        ));
    } else {
      await db
        .insert(oneRepMaxes)
        .values({
          userId,
          exerciseId,
          weight,
        });
    }
  }

  async getAllOneRepMaxes(userId: number): Promise<OneRepMax[]> {
    return await db
      .select()
      .from(oneRepMaxes)
      .where(eq(oneRepMaxes.userId, userId));
  }

  async deleteOneRepMax(userId: number, exerciseId: number): Promise<void> {
    await db
      .delete(oneRepMaxes)
      .where(and(
        eq(oneRepMaxes.userId, userId),
        eq(oneRepMaxes.exerciseId, exerciseId)
      ));
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

  async saveWorkoutProgress(userId: number, workoutNumber: number, progress: WorkoutProgress): Promise<string> {
    const existing = await db
      .select()
      .from(workoutProgress)
      .where(and(
        eq(workoutProgress.userId, userId),
        eq(workoutProgress.workoutNumber, workoutNumber)
      ))
      .limit(1);

    // Generate session ID if this is a new workout start or restart
    let sessionId = existing[0]?.sessionId;
    if (!sessionId || (progress.status === 'in_progress' && existing[0]?.status === 'not_started')) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      console.log(`Generated new session ID: ${sessionId} for workout ${workoutNumber}`);
    }

    const dbProgress = {
      userId,
      workoutNumber,
      sessionId,
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
    
    return sessionId || '';
  }

  // Exercise operations
  async getExercise(id: number): Promise<ExerciseDB | undefined> {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id));
    return exercise || undefined;
  }

  async getExerciseByName(name: string): Promise<ExerciseDB | undefined> {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.name, name));
    return exercise || undefined;
  }

  async getAllExercises(): Promise<ExerciseDB[]> {
    return await db.select().from(exercises).orderBy(exercises.name);
  }

  async searchExercises(query: string): Promise<ExerciseDB[]> {
    if (!query) return this.getAllExercises();
    return await db
      .select()
      .from(exercises)
      .where(like(exercises.name, `%${query}%`))
      .orderBy(exercises.name);
  }

  async createExercise(exercise: InsertExercise): Promise<ExerciseDB> {
    const [created] = await db
      .insert(exercises)
      .values(exercise)
      .returning();
    return created;
  }

  async updateExercise(id: number, exercise: Partial<InsertExercise>): Promise<void> {
    await db
      .update(exercises)
      .set(exercise)
      .where(eq(exercises.id, id));
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

  async saveExerciseHistory(userId: number, history: ExerciseHistoryEntry, workoutNumber?: number): Promise<void> {
    // Get current session ID from workout progress if workoutNumber is provided
    let sessionId: string | undefined;
    if (workoutNumber) {
      const progress = await db
        .select()
        .from(workoutProgress)
        .where(and(
          eq(workoutProgress.userId, userId),
          eq(workoutProgress.workoutNumber, workoutNumber)
        ))
        .limit(1);
      
      sessionId = progress[0]?.sessionId || undefined;
    }
    
    // Get exercise by name to get its ID
    const exercise = await this.getExerciseByName(history.exerciseName);
    if (!exercise) {
      throw new Error(`Exercise not found: ${history.exerciseName}`);
    }
    
    console.log("Inserting exercise history:", {
      userId,
      exerciseId: exercise.id,
      exerciseName: history.exerciseName,
      sessionId,
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
        exerciseId: exercise.id,
        exerciseName: history.exerciseName, // Keep for backward compatibility
        sessionId,
        sets: history.sets,
        reps: history.reps,
        weight: history.weight,
        notes: history.notes,
        typeOfSet: history.typeOfSet || "working",
      });
    
    console.log("Exercise history saved successfully with sessionId:", sessionId);
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
      // Get the session ID for this workout BEFORE we clear the progress
      const progress = await db
        .select()
        .from(workoutProgress)
        .where(and(
          eq(workoutProgress.userId, userId),
          eq(workoutProgress.workoutNumber, workoutNumber)
        ))
        .limit(1);
      
      if (!progress[0]?.sessionId) {
        console.log(`No session ID found for workout ${workoutNumber}, skipping exercise history clear`);
        return;
      }
      
      const sessionId = progress[0].sessionId;
      console.log(`Found session ID for workout ${workoutNumber}: ${sessionId}`);
      
      // Delete exercise history entries for this specific session
      const result = await db
        .delete(exerciseHistory)
        .where(and(
          eq(exerciseHistory.userId, userId),
          eq(exerciseHistory.sessionId, sessionId)
        ));
      
      console.log(`Cleared exercise history for workout ${workoutNumber}, session ${sessionId}`);
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

  async recoverProgressFromHistory(userId: number, workoutNumbers: number[]): Promise<any> {
    console.log(`Starting recovery for user ${userId}, workouts: ${workoutNumbers.join(', ')}`);
    
    // Load workout data to understand exercise structure
    const fs = await import('fs');
    const path = await import('path');
    const workoutDataPath = path.join(process.cwd(), 'client/public/powerbuilding_data.json');
    const data = JSON.parse(fs.readFileSync(workoutDataPath, 'utf-8'));
    
    // Get the user to find their selected program
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const selectedProgram = user[0]?.selectedProgram || data.programs[0].name;
    const program = data.programs.find((p: any) => p.name === selectedProgram) || data.programs[0];
    
    // Get exercise history for this user
    const userHistory = await db
      .select()
      .from(exerciseHistory)
      .where(eq(exerciseHistory.userId, userId))
      .orderBy(exerciseHistory.performedAt);
    
    console.log(`Found ${userHistory.length} exercise history entries`);
    
    // Group by date to identify workout sessions
    const workoutsByDate = new Map<string, typeof userHistory>();
    
    for (const entry of userHistory) {
      const dateKey = entry.performedAt.toISOString().split('T')[0];
      if (!workoutsByDate.has(dateKey)) {
        workoutsByDate.set(dateKey, []);
      }
      workoutsByDate.get(dateKey)!.push(entry);
    }
    
    const sortedDates = Array.from(workoutsByDate.keys()).sort();
    console.log(`Found ${sortedDates.length} unique workout dates`);
    
    // Process each workout number
    for (let i = 0; i < Math.min(workoutNumbers.length, sortedDates.length); i++) {
      const workoutNumber = workoutNumbers[i];
      const dateKey = sortedDates[i];
      const historicalExercises = workoutsByDate.get(dateKey)!;
      
      console.log(`Processing workout ${workoutNumber} from ${dateKey} with ${historicalExercises.length} entries`);
      
      // Get the workout structure from the program
      const workoutData = program.workouts.find((w: any) => w.workout_number === workoutNumber);
      if (!workoutData) {
        console.log(`Warning: No workout structure found for workout ${workoutNumber}`);
        continue;
      }
      
      // Build exercise progress JSON matching the workout structure
      const exerciseProgressData: Record<string, any> = {};
      let globalIndex = 0;
      
      // Process each exercise in the workout structure
      for (const exerciseTemplate of workoutData.exercises) {
        const exerciseName = exerciseTemplate.name;
        
        // Find all history entries for this exercise (both warmup and working sets)
        const exerciseHistories = historicalExercises.filter(h => h.exerciseName === exerciseName);
        
        if (exerciseHistories.length === 0) {
          console.log(`No history found for exercise: ${exerciseName}`);
          continue;
        }
        
        // Process warmup sets first
        const warmupSets = exerciseHistories.filter(h => h.typeOfSet === 'warmup');
        for (const warmup of warmupSets) {
          exerciseProgressData[globalIndex.toString()] = {
            sets: warmup.sets,
            reps: warmup.reps,
            weight: warmup.weight,
            notes: warmup.notes || "",
            completed: true
          };
          globalIndex++;
        }
        
        // Process working sets
        const workingSets = exerciseHistories.filter(h => h.typeOfSet === 'working' || !h.typeOfSet);
        for (const working of workingSets) {
          exerciseProgressData[globalIndex.toString()] = {
            sets: working.sets,
            reps: working.reps,
            weight: working.weight,
            notes: working.notes || "",
            completed: true
          };
          globalIndex++;
        }
      }
      
      console.log(`Built exercise progress with ${globalIndex} total entries (warmups + working sets)`);
      
      // Check if workout progress already exists
      const existing = await db
        .select()
        .from(workoutProgress)
        .where(and(
          eq(workoutProgress.userId, userId),
          eq(workoutProgress.workoutNumber, workoutNumber)
        ))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing record
        await db
          .update(workoutProgress)
          .set({
            exerciseProgress: exerciseProgressData,
            status: "completed",
            completedAt: historicalExercises[historicalExercises.length - 1].performedAt,
            updatedAt: new Date()
          })
          .where(and(
            eq(workoutProgress.userId, userId),
            eq(workoutProgress.workoutNumber, workoutNumber)
          ));
        console.log(`Updated workout ${workoutNumber} with ${globalIndex} exercises`);
      } else {
        // Create new record
        await db
          .insert(workoutProgress)
          .values({
            userId,
            workoutNumber,
            status: "completed",
            startedAt: historicalExercises[0].performedAt,
            completedAt: historicalExercises[historicalExercises.length - 1].performedAt,
            exerciseProgress: exerciseProgressData
          });
        console.log(`Created workout ${workoutNumber} with ${globalIndex} exercises`);
      }
    }
    
    return {
      recovered: Math.min(workoutNumbers.length, sortedDates.length),
      totalHistory: userHistory.length,
      dates: sortedDates
    };
  }
}

export const storage = new DatabaseStorage();
