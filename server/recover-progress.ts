import { db } from "./db";
import { workoutProgress, exerciseHistory, users } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

async function recoverExerciseProgress() {
  console.log("Starting exercise progress recovery...");
  
  try {
    // Get all users
    const allUsers = await db.select().from(users);
    console.log(`Found ${allUsers.length} users`);

    for (const user of allUsers) {
      console.log(`\nProcessing user: ${user.username} (ID: ${user.id})`);
      
      // Get all exercise history for this user
      const userExerciseHistory = await db
        .select()
        .from(exerciseHistory)
        .where(eq(exerciseHistory.userId, user.id))
        .orderBy(exerciseHistory.performedAt);
      
      console.log(`Found ${userExerciseHistory.length} exercise history entries`);
      
      // Group exercise history by workout (based on date)
      const workoutGroups = new Map<string, typeof userExerciseHistory>();
      
      for (const entry of userExerciseHistory) {
        // Group by date (same day = same workout session)
        const dateKey = entry.performedAt.toISOString().split('T')[0];
        if (!workoutGroups.has(dateKey)) {
          workoutGroups.set(dateKey, []);
        }
        workoutGroups.get(dateKey)!.push(entry);
      }
      
      console.log(`Found ${workoutGroups.size} workout sessions`);
      
      // For the first 4 workouts, reconstruct exercise progress
      let workoutCounter = 0;
      const sortedDates = Array.from(workoutGroups.keys()).sort();
      
      for (const dateKey of sortedDates) {
        if (workoutCounter >= 4) break; // Only process first 4 workouts as mentioned
        
        workoutCounter++;
        const exercises = workoutGroups.get(dateKey)!;
        
        console.log(`\nWorkout ${workoutCounter} on ${dateKey}:`);
        console.log(`  - ${exercises.length} exercises`);
        
        // Build exercise progress object
        const exerciseProgressData: Record<string, any> = {};
        exercises.forEach((exercise, index) => {
          // Only include working sets (not warm-ups)
          if (exercise.typeOfSet === "working") {
            exerciseProgressData[index.toString()] = {
              sets: exercise.sets,
              reps: exercise.reps,
              weight: exercise.weight,
              notes: exercise.notes || "",
              completed: true
            };
            console.log(`    Exercise ${index}: ${exercise.exerciseName} - ${exercise.sets}x${exercise.reps} @ ${exercise.weight}lbs`);
          }
        });
        
        // Check if workout progress exists
        const existingProgress = await db
          .select()
          .from(workoutProgress)
          .where(and(
            eq(workoutProgress.userId, user.id),
            eq(workoutProgress.workoutNumber, workoutCounter)
          ))
          .limit(1);
        
        if (existingProgress.length > 0) {
          // Update existing workout progress
          await db
            .update(workoutProgress)
            .set({
              exerciseProgress: exerciseProgressData,
              status: "completed",
              completedAt: exercises[exercises.length - 1].performedAt,
              updatedAt: new Date()
            })
            .where(and(
              eq(workoutProgress.userId, user.id),
              eq(workoutProgress.workoutNumber, workoutCounter)
            ));
          console.log(`  ✓ Updated workout ${workoutCounter} progress`);
        } else {
          // Create new workout progress
          await db
            .insert(workoutProgress)
            .values({
              userId: user.id,
              workoutNumber: workoutCounter,
              programName: user.selectedProgram,
              status: "completed",
              startedAt: exercises[0].performedAt,
              completedAt: exercises[exercises.length - 1].performedAt,
              exerciseProgress: exerciseProgressData
            });
          console.log(`  ✓ Created workout ${workoutCounter} progress`);
        }
      }
      
      console.log(`\n✓ Completed recovery for user ${user.username}`);
    }
    
    console.log("\n✅ Exercise progress recovery completed successfully!");
    
  } catch (error) {
    console.error("❌ Error during recovery:", error);
    throw error;
  }
}

// Run the recovery
if (require.main === module) {
  recoverExerciseProgress()
    .then(() => {
      console.log("\nRecovery process finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nRecovery failed:", error);
      process.exit(1);
    });
}

export { recoverExerciseProgress };