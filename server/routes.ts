import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve the workout data as a static API endpoint
  app.get("/api/workouts", (req, res) => {
    try {
      // The workout data is served from the frontend's import
      // This endpoint can be used for future enhancements
      res.json({ message: "Workout data is served from frontend imports" });
    } catch (error) {
      res.status(500).json({ error: "Failed to load workout data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
