import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOneRepMaxSchema, insertWorkoutProgressSchema, insertExerciseHistorySchema } from "@shared/schema";
import { z } from "zod";

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

  // Get workout progress
  app.get("/api/workout-progress", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      const progress = await storage.getWorkoutProgress(user.id);
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
      
      await storage.saveWorkoutProgress(user.id, workoutNumber, progress);
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
      const historyEntry = req.body;
      
      console.log("Saving exercise history for user:", user.id, "Entry:", historyEntry);
      await storage.saveExerciseHistory(user.id, historyEntry);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving exercise history:", error);
      res.status(500).json({ error: "Failed to save exercise history" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
