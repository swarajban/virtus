import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
const connectionString = directDatabaseUrl || databaseUrl;

if (!connectionString) {
  const error = new Error(
    "DIRECT_DATABASE_URL or DATABASE_URL must be set. " +
    "For Neon, prefer the direct (non-pooler) connection string for the app server."
  );
  console.error("Database configuration error:", error.message);
  throw error;
}

if (!directDatabaseUrl && databaseUrl?.includes("-pooler.")) {
  console.warn(
    "DATABASE_URL appears to be a Neon pooled connection string. " +
    "If you hit missing table/schema issues, set DIRECT_DATABASE_URL to the direct Neon host instead."
  );
}

// Log database URL status (without exposing the actual URL for security)
console.log("Database URL configured:", connectionString ? "✓" : "✗");
console.log("Database connection mode:", directDatabaseUrl ? "direct" : "default");

let pool: Pool;
let db: ReturnType<typeof drizzle>;

try {
  pool = new Pool({ connectionString });
  db = drizzle({ client: pool, schema });
  console.log("Database client initialized successfully");
} catch (error) {
  console.error("Failed to initialize database client:", error);
  throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
}

export { pool, db };