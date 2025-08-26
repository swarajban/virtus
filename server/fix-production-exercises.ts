import { db } from "./db";
import { exercises } from "@shared/schema";
import { eq } from "drizzle-orm";

// Manual script to add missing exercises to production database
async function fixProductionExercises() {
  console.log("Checking and adding missing exercises...");
  
  try {
    // Critical missing exercises that must be added
    const missingExercises = [
      { name: "Deadlift", usesBarbell: true },
      // Add any other missing exercises here if found
    ];
    
    for (const exerciseData of missingExercises) {
      // Check if exercise already exists
      const existing = await db
        .select()
        .from(exercises)
        .where(eq(exercises.name, exerciseData.name))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(exercises).values({
          name: exerciseData.name,
          usesBarbell: exerciseData.usesBarbell,
          notes: null,
          youtubeLink: null,
          onerm: null,
          onermExerciseId: null,
        });
        console.log(`✅ Added missing exercise: ${exerciseData.name}`);
      } else {
        console.log(`✓ Exercise already exists: ${exerciseData.name}`);
      }
    }
    
    // Also update the 1RM relationships for deadlift variations
    const deadliftVariations = [
      "Romanian deadlift",
      "Stiff-legged deadlift", 
      "Sumo deadlift",
      "Deficit deadlift",
      "Pause deadlift",
      "3\" block pull",
      "5\" block pull"
    ];
    
    // Get the Deadlift exercise ID
    const [deadlift] = await db
      .select()
      .from(exercises)
      .where(eq(exercises.name, "Deadlift"))
      .limit(1);
    
    if (deadlift) {
      for (const variantName of deadliftVariations) {
        const [variant] = await db
          .select()
          .from(exercises)
          .where(eq(exercises.name, variantName))
          .limit(1);
        
        if (variant && !variant.onermExerciseId) {
          await db
            .update(exercises)
            .set({ onermExerciseId: deadlift.id })
            .where(eq(exercises.id, variant.id));
          console.log(`✅ Set ${variantName} to use Deadlift's 1RM`);
        }
      }
    }
    
    console.log("\n✅ Production exercise fix completed!");
    
  } catch (error) {
    console.error("Error fixing production exercises:", error);
    throw error;
  }
}

// Run the fix
if (process.argv[1].includes("fix-production-exercises")) {
  fixProductionExercises()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to fix production exercises:", err);
      process.exit(1);
    });
}