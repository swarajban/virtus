import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOneRepMaxSchema, insertWorkoutProgressSchema, insertExerciseHistorySchema } from "@shared/schema";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

// Helper to get user based on username from headers
async function getUserFromRequest(req: any) {
  const username = req.headers['x-username'] as string;
  if (!username) {
    throw new Error('Username header is required');
  }
  const user = await storage.getUserByUsername(username);
  if (!user) {
    throw new Error(`User ${username} not found`);
  }
  return user;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Get all users
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get current user (based on x-username header)
  app.get("/api/user/current", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      res.json(user);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch current user" });
    }
  });

  // Get user's 1RM values
  app.get("/api/one-rm", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const oneRM = await storage.getOneRepMax(user.id);
      
      // Return default values if no 1RM saved yet
      if (!oneRM) {
        res.json({
          backSquat: 135,
          benchPress: 95,
          deadlift: 185,
          overheadPress: 65,
        });
      } else {
        res.json(oneRM);
      }
    } catch (error) {
      console.error("Error fetching 1RM:", error);
      res.status(500).json({ error: "Failed to fetch 1RM values" });
    }
  });

  // Save user's 1RM values
  app.post("/api/one-rm", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const oneRM = req.body;
      
      await storage.saveOneRepMax(user.id, oneRM);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving 1RM:", error);
      res.status(500).json({ error: "Failed to save 1RM values" });
    }
  });

  // New 1RM routes for per-exercise system
  app.get("/api/one-rm/exercise/:exerciseId", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const exerciseId = parseInt(req.params.exerciseId);
      const oneRM = await storage.getOneRepMaxForExercise(user.id, exerciseId);
      
      if (!oneRM) {
        return res.status(404).json({ error: "No 1RM found for this exercise" });
      }
      res.json(oneRM);
    } catch (error) {
      console.error("Error fetching exercise 1RM:", error);
      res.status(500).json({ error: "Failed to fetch exercise 1RM" });
    }
  });

  app.post("/api/one-rm/exercise/:exerciseId", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const exerciseId = parseInt(req.params.exerciseId);
      const { weight } = req.body;
      
      await storage.saveOneRepMaxForExercise(user.id, exerciseId, weight);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving exercise 1RM:", error);
      res.status(500).json({ error: "Failed to save exercise 1RM" });
    }
  });

  app.delete("/api/one-rm/exercise/:exerciseId", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const exerciseId = parseInt(req.params.exerciseId);
      
      await storage.deleteOneRepMax(user.id, exerciseId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting exercise 1RM:", error);
      res.status(500).json({ error: "Failed to delete exercise 1RM" });
    }
  });

  app.get("/api/one-rm/all", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const allOneRMs = await storage.getAllOneRepMaxes(user.id);
      res.json(allOneRMs);
    } catch (error) {
      console.error("Error fetching all 1RMs:", error);
      res.status(500).json({ error: "Failed to fetch all 1RM values" });
    }
  });

  // Get workout progress
  app.get("/api/workout-progress", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      // Pass the user's selected program to filter progress correctly
      const progress = await storage.getWorkoutProgress(user.id, user.selectedProgram, user.currentProgramCycle);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching workout progress:", error);
      res.status(500).json({ error: "Failed to fetch workout progress" });
    }
  });

  // Save workout progress for a specific workout
  app.post("/api/workout-progress/:workoutNumber", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const workoutNumber = parseInt(req.params.workoutNumber);
      const progress = req.body;
      
      // Pass the user's selected program to save progress correctly
      await storage.saveWorkoutProgress(user.id, workoutNumber, progress, user.selectedProgram, user.currentProgramCycle);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving workout progress:", error);
      res.status(500).json({ error: "Failed to save workout progress" });
    }
  });

  // Get exercise history
  app.get("/api/exercise-history", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const exerciseName = req.query.exerciseName as string | undefined;
      const history = await storage.getExerciseHistory(user.id, exerciseName);
      res.json(history);
    } catch (error) {
      console.error("Error fetching exercise history:", error);
      res.status(500).json({ error: "Failed to fetch exercise history" });
    }
  });

  // Save exercise history entry
  app.post("/api/exercise-history", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const { historyEntry, workoutNumber } = req.body;
      
      console.log("Saving exercise history for user:", user.id, "Workout:", workoutNumber, "Entry:", historyEntry);
      await storage.saveExerciseHistory(user.id, historyEntry, workoutNumber);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving exercise history:", error);
      res.status(500).json({ error: "Failed to save exercise history" });
    }
  });

  // Delete individual exercise history entry
  app.delete("/api/exercise-history/:entryId", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const entryId = parseInt(req.params.entryId);
      
      await storage.deleteExerciseHistoryEntry(user.id, entryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting exercise history entry:", error);
      res.status(500).json({ error: "Failed to delete exercise history entry" });
    }
  });

  // Clear workout progress
  app.delete('/api/workout-progress/:workoutNumber', async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const workoutNumber = parseInt(req.params.workoutNumber);
      
      await storage.clearWorkoutProgress(user.id, workoutNumber);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing workout progress:', error);
      res.status(500).json({ error: 'Failed to clear workout progress' });
    }
  });

  // Clear exercise history for a workout
  app.delete('/api/exercise-history/workout/:workoutNumber', async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const workoutNumber = parseInt(req.params.workoutNumber);
      
      await storage.clearExerciseHistoryForWorkout(user.id, workoutNumber);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing exercise history for workout:', error);
      res.status(500).json({ error: 'Failed to clear exercise history for workout' });
    }
  });

  // Exercise management endpoints
  
  // Get all exercises
  app.get('/api/exercises', async (req, res) => {
    try {
      const query = req.query.search as string | undefined;
      const exercises = query 
        ? await storage.searchExercises(query)
        : await storage.getAllExercises();
      res.json(exercises);
    } catch (error) {
      console.error('Error fetching exercises:', error);
      res.status(500).json({ error: 'Failed to fetch exercises' });
    }
  });

  // Get single exercise by ID
  app.get('/api/exercises/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const exercise = await storage.getExercise(id);
      if (!exercise) {
        return res.status(404).json({ error: 'Exercise not found' });
      }
      res.json(exercise);
    } catch (error) {
      console.error('Error fetching exercise:', error);
      res.status(500).json({ error: 'Failed to fetch exercise' });
    }
  });

  // Create new exercise
  app.post('/api/exercises', async (req, res) => {
    try {
      const exercise = req.body;
      const created = await storage.createExercise(exercise);
      res.json(created);
    } catch (error) {
      console.error('Error creating exercise:', error);
      res.status(500).json({ error: 'Failed to create exercise' });
    }
  });

  // Update exercise
  app.put('/api/exercises/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      await storage.updateExercise(id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating exercise:', error);
      res.status(500).json({ error: 'Failed to update exercise' });
    }
  });

  // Update user's selected program
  app.post('/api/user/program', async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const { programName } = req.body;
      
      await storage.updateUserProgram(user.id, programName);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating user program:', error);
      res.status(500).json({ error: 'Failed to update user program' });
    }
  });

  // Clear all progress for the user
  app.post('/api/progress/clear', async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      
      await storage.clearAllProgress(user.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing all progress:', error);
      res.status(500).json({ error: 'Failed to clear all progress' });
    }
  });

  // Recover exercise progress from history
  app.post('/api/progress/recover', async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const result = await storage.recoverProgressFromHistory(user.id, req.body.workoutNumbers || [1, 2, 3, 4]);
      res.json({ success: true, result });
    } catch (error) {
      console.error('Error recovering progress:', error);
      res.status(500).json({ error: 'Failed to recover progress' });
    }
  });

  // Get available programs from powerbuilding_data.json
  app.get('/api/programs', async (req, res) => {
    try {
      const jsonPath = join(process.cwd(), 'client', 'public', 'powerbuilding_data.json');
      const fileContent = readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // Extract program data including workouts array for the modal
      const programs = data.programs.map((program: any) => ({
        name: program.name,
        workouts: program.workouts,
      }));
      
      res.json({ programs });
    } catch (error) {
      console.error('Error reading programs:', error);
      res.status(500).json({ error: 'Failed to fetch programs' });
    }
  });

  // Start a new program (repeat current or switch to different program)
  app.post('/api/start-new-program', async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const { programName } = req.body;
      
      if (!programName) {
        return res.status(400).json({ error: 'Program name is required' });
      }
      
      // Get max cycle for this program from historical workout_progress
      const maxCycle = await storage.getMaxProgramCycle(user.id, programName);
      
      // Determine next cycle
      let nextCycle = 1;
      if (user.selectedProgram === programName) {
        // Same program: increment to next cycle
        nextCycle = maxCycle + 1;
      } else {
        // Different program: start at cycle 1 or continue from max if history exists
        nextCycle = maxCycle > 0 ? maxCycle + 1 : 1;
      }
      
      // Update user's selected program and current cycle
      await storage.updateUserProgramAndCycle(user.id, programName, nextCycle);
      
      res.json({ 
        success: true, 
        programName,
        programCycle: nextCycle 
      });
    } catch (error) {
      console.error('Error starting new program:', error);
      res.status(500).json({ error: 'Failed to start new program' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
