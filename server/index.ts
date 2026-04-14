import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { seedExercises } from "./seed-exercises";

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("Starting server initialization...");
    
    // Test database connection first
    try {
      console.log("Testing database connection...");
      const { pool } = await import('./db');
      await pool.query('SELECT 1');
      console.log("Database connection successful");
    } catch (error) {
      console.error("Database connection failed:", error);
      console.error("This may be due to missing DATABASE_URL or network issues");
      // Don't exit - let the app try to continue, but log the issue clearly
    }
  
  // Seed exercises on startup (only if database is empty)
  try {
    console.log("Starting exercise seeding...");
    await seedExercises();
    console.log("Exercise seeding completed successfully");
  } catch (error) {
    console.error("Failed to seed exercises:", error);
    console.error("Server will continue starting up despite seeding failure");
    // Continue server startup even if seeding fails
  }
  
  console.log("Registering API routes...");
  const server = await registerRoutes(app);
  console.log("API routes registered successfully");

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  console.log(`Environment: ${app.get("env")}`);
  if (app.get("env") === "development") {
    console.log("Setting up Vite development server...");
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    console.log("Setting up static file serving for production...");
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  console.log(`Starting server on host 0.0.0.0, port ${port}...`);
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    console.log("Server startup completed successfully");
    console.log(`Application is ready and listening on http://0.0.0.0:${port}`);
  });

  // Handle server startup errors
  server.on('error', (error: any) => {
    console.error("Server failed to start:", error);
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try a different port.`);
    } else if (error.code === 'EACCES') {
      console.error(`Permission denied to bind to port ${port}. Try a higher port number.`);
    }
    process.exit(1);
  });

  } catch (error) {
    console.error("Critical error during server startup:", error);
    console.error("Server failed to initialize. Check the logs above for specific issues.");
    console.error("Common causes:");
    console.error("- Missing DATABASE_URL environment variable");
    console.error("- Database connection refused or unavailable");
    console.error("- Port already in use");
    console.error("- Missing required dependencies or files");
    process.exit(1);
  }
})();
