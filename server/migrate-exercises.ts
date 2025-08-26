import { db } from "./db";
import { exercises, exerciseHistory } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";

const EXERCISE_1RM_MAPPING: Record<string, string> = {
  "Back squat": "Back squat",
  "Front squat": "Back squat",
  "Barbell bench press": "Barbell bench press",
  "Incline barbell bench press": "Barbell bench press",
  "Deadlift": "Deadlift",
  "Romanian deadlift": "Deadlift",
  "Sumo deadlift": "Deadlift",
  "Overhead press": "Overhead press",
  "Push press": "Overhead press",
};

async function migrateExercises() {
  console.log("Starting exercise migration...");
  
  try {
    // Read the JSON file - use relative path from server directory
    const jsonData = JSON.parse(fs.readFileSync("../attached_assets/powerbuilding_data_v2_1755222339109.json", "utf-8"));
    
    // Extract unique exercise names from all workouts
    const uniqueExercises = new Set<string>();
    
    for (const program of jsonData.programs) {
      for (const workout of program.workouts) {
        for (const exercise of workout.exercises) {
          uniqueExercises.add(exercise.name);
        }
      }
    }
    
    console.log(`Found ${uniqueExercises.size} unique exercises`);
    
    // Insert exercises into database
    for (const exerciseName of uniqueExercises) {
      // Check if exercise already exists
      const existing = await db
        .select()
        .from(exercises)
        .where(eq(exercises.name, exerciseName))
        .limit(1);
      
      if (existing.length === 0) {
        // Determine if it uses a barbell based on name
        const usesBarbell = exerciseName.toLowerCase().includes("barbell") || 
                          exerciseName.toLowerCase().includes("squat") ||
                          exerciseName.toLowerCase().includes("deadlift") ||
                          exerciseName.toLowerCase().includes("press") ||
                          exerciseName.toLowerCase().includes("row");
        
        await db.insert(exercises).values({
          name: exerciseName,
          usesBarbell,
          notes: null,
          youtubeLink: null,
          onerm: null,
          onermExerciseId: null,
        });
        
        console.log(`Inserted exercise: ${exerciseName}`);
      } else {
        console.log(`Exercise already exists: ${exerciseName}`);
      }
    }
    
    // Now set up the 1RM relationships
    console.log("\nSetting up 1RM relationships...");
    for (const [exerciseName, parentExerciseName] of Object.entries(EXERCISE_1RM_MAPPING)) {
      if (exerciseName === parentExerciseName) continue; // Skip self-references
      
      // Get both exercises
      const [childExercise] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.name, exerciseName))
        .limit(1);
      
      const [parentExercise] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.name, parentExerciseName))
        .limit(1);
      
      if (childExercise && parentExercise) {
        await db
          .update(exercises)
          .set({ onermExerciseId: parentExercise.id })
          .where(eq(exercises.id, childExercise.id));
        
        console.log(`Set ${exerciseName} to use 1RM from ${parentExerciseName}`);
      }
    }
    
    console.log("\nMigration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// Run the migration
migrateExercises()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });