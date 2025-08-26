import { db } from "./db";
import { exercises } from "@shared/schema";
import { eq } from "drizzle-orm";

// This is the exercise data that will be seeded into the database
const EXERCISE_DATA = [
  { name: "3\" block pull", usesBarbell: true },
  { name: "5\" block pull", usesBarbell: true },
  { name: "Alternating dumbbell curls", usesBarbell: false },
  { name: "Back squat", usesBarbell: true },
  { name: "Barbell bench press", usesBarbell: true },
  { name: "Barbell bent row", usesBarbell: true },
  { name: "Barbell curls", usesBarbell: true },
  { name: "Barbell reverse lunges", usesBarbell: true },
  { name: "Belt squat", usesBarbell: false },
  { name: "Cable face pulls", usesBarbell: false },
  { name: "Cable flyes", usesBarbell: false },
  { name: "Cable or dumbbell lateral raises", usesBarbell: false },
  { name: "Cable rows", usesBarbell: false },
  { name: "Cable triceps extensions", usesBarbell: false },
  { name: "Chest supported rows", usesBarbell: false },
  { name: "Close-grip barbell bench press", usesBarbell: true },
  { name: "Deadlift", usesBarbell: true },
  { name: "Deficit deadlift", usesBarbell: true },
  { name: "Dumbbell bench press", usesBarbell: false },
  { name: "Dumbbell flyes", usesBarbell: false },
  { name: "Dumbbell rows", usesBarbell: false },
  { name: "Front squat", usesBarbell: true },
  { name: "Good mornings", usesBarbell: true },
  { name: "Hack squat", usesBarbell: false },
  { name: "Hammer curls", usesBarbell: false },
  { name: "Incline barbell bench press", usesBarbell: true },
  { name: "Incline dumbbell bench press", usesBarbell: false },
  { name: "Lat pulldowns", usesBarbell: false },
  { name: "Leg curls", usesBarbell: false },
  { name: "Leg extensions", usesBarbell: false },
  { name: "Leg press", usesBarbell: false },
  { name: "Military press", usesBarbell: true },
  { name: "Overhead dumbbell triceps extensions", usesBarbell: false },
  { name: "Overhead press", usesBarbell: true },
  { name: "Pause back squat", usesBarbell: true },
  { name: "Pause bench press", usesBarbell: true },
  { name: "Pause deadlift", usesBarbell: true },
  { name: "Pause front squat", usesBarbell: true },
  { name: "Preacher curls", usesBarbell: false },
  { name: "Pull-ups", usesBarbell: false },
  { name: "Push press", usesBarbell: true },
  { name: "Romanian deadlift", usesBarbell: true },
  { name: "Seated dumbbell press", usesBarbell: false },
  { name: "Single-leg leg press", usesBarbell: false },
  { name: "Split squats", usesBarbell: false },
  { name: "Stiff-legged deadlift", usesBarbell: true },
  { name: "Sumo deadlift", usesBarbell: true },
  { name: "T-bar rows", usesBarbell: false },
  { name: "Triceps dips", usesBarbell: false },
  { name: "Walking lunges", usesBarbell: false },
  { name: "Wide-grip bench press", usesBarbell: true }
];

// Mapping of exercises that use another exercise's 1RM for calculations
const EXERCISE_1RM_MAPPING: Record<string, string> = {
  "Front squat": "Back squat",
  "Pause back squat": "Back squat",
  "Pause front squat": "Back squat",
  "Belt squat": "Back squat",
  "Hack squat": "Back squat",
  "Barbell reverse lunges": "Back squat",
  "Walking lunges": "Back squat",
  "Split squats": "Back squat",
  "Incline barbell bench press": "Barbell bench press",
  "Pause bench press": "Barbell bench press",
  "Close-grip barbell bench press": "Barbell bench press",
  "Wide-grip bench press": "Barbell bench press",
  "Dumbbell bench press": "Barbell bench press",
  "Incline dumbbell bench press": "Barbell bench press",
  "Romanian deadlift": "Deadlift",
  "Stiff-legged deadlift": "Deadlift",
  "Sumo deadlift": "Deadlift",
  "Deficit deadlift": "Deadlift",
  "Pause deadlift": "Deadlift",
  "3\" block pull": "Deadlift",
  "5\" block pull": "Deadlift",
  "Push press": "Overhead press",
  "Military press": "Overhead press",
  "Seated dumbbell press": "Overhead press"
};

export async function seedExercises() {
  console.log("Starting exercise seeding...");
  
  try {
    // Check if exercises already exist
    const existingExercises = await db.select().from(exercises);
    if (existingExercises.length > 0) {
      console.log(`Database already has ${existingExercises.length} exercises.`);
      
      // Special check for critical missing exercises (production fix)
      const criticalExercises = ["Deadlift", "Back squat", "Barbell bench press", "Overhead press"];
      for (const exerciseName of criticalExercises) {
        const [exists] = await db
          .select()
          .from(exercises)
          .where(eq(exercises.name, exerciseName))
          .limit(1);
        
        if (!exists) {
          const exerciseData = EXERCISE_DATA.find(e => e.name === exerciseName);
          if (exerciseData) {
            await db.insert(exercises).values({
              name: exerciseData.name,
              usesBarbell: exerciseData.usesBarbell,
              notes: null,
              youtubeLink: null,
              onerm: null,
              onermExerciseId: null,
            });
            console.log(`✅ Added critical missing exercise: ${exerciseName}`);
          }
        }
      }
      
      return;
    }
    
    // Insert all exercises
    for (const exerciseData of EXERCISE_DATA) {
      await db.insert(exercises).values({
        name: exerciseData.name,
        usesBarbell: exerciseData.usesBarbell,
        notes: null,
        youtubeLink: null,
        onerm: null,
        onermExerciseId: null,
      });
      console.log(`Inserted exercise: ${exerciseData.name}`);
    }
    
    // Now set up the 1RM relationships
    console.log("\nSetting up 1RM relationships...");
    for (const [exerciseName, parentExerciseName] of Object.entries(EXERCISE_1RM_MAPPING)) {
      // Get both exercises
      const [exercise] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.name, exerciseName))
        .limit(1);
      
      const [parentExercise] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.name, parentExerciseName))
        .limit(1);
      
      if (exercise && parentExercise) {
        await db
          .update(exercises)
          .set({ onermExerciseId: parentExercise.id })
          .where(eq(exercises.id, exercise.id));
        
        console.log(`Set ${exerciseName} to use 1RM from ${parentExerciseName}`);
      }
    }
    
    console.log("\n✅ Exercise seeding completed successfully!");
    console.log(`Total exercises seeded: ${EXERCISE_DATA.length}`);
    
  } catch (error) {
    console.error("Error seeding exercises:", error);
    throw error;
  }
}

// Run if called directly (for manual seeding)
// Usage: tsx server/seed-exercises.ts
if (process.argv[1].includes("seed-exercises")) {
  seedExercises()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed exercises:", err);
      process.exit(1);
    });
}