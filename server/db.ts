import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  const error = new Error(
    "DATABASE_URL must be set. Did you forget to provision a database? " +
    "Check your environment variables in the Deployments pane for production, " +
    "or ensure you have a database configured in your Replit project."
  );
  console.error("Database configuration error:", error.message);
  throw error;
}

// Log database URL status (without exposing the actual URL for security)
console.log("Database URL configured:", process.env.DATABASE_URL ? "✓" : "✗");

let pool: Pool;
let db: ReturnType<typeof drizzle>;

try {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
  console.log("Database client initialized successfully");
} catch (error) {
  console.error("Failed to initialize database client:", error);
  throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
}

export { pool, db };