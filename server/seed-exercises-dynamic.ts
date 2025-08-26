import { db } from './db';
import { exercises } from '@shared/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function seedExercises() {
  try {
    console.log('Starting dynamic exercise seeding...');
    
    // Read the powerbuilding data JSON file
    const jsonPath = path.join(process.cwd(), 'attached_assets', 'powerbuilding_data_v2_1755222339109.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    // Extract all unique exercise names from the entire JSON structure
    const uniqueExercises = new Set<string>();
    
    // Loop through all programs
    for (const program of jsonData.programs) {
      // Loop through all workouts in the program
      for (const workout of program.workouts) {
        // Loop through all exercises in the workout
        for (const exercise of workout.exercises) {
          if (exercise.name) {
            uniqueExercises.add(exercise.name);
          }
        }
      }
    }
    
    console.log(`Found ${uniqueExercises.size} unique exercises in the JSON file`);
    console.log('Exercise names:', Array.from(uniqueExercises).sort());
    
    // Check existing exercises in database
    const existingExercises = await db.select().from(exercises);
    const existingNames = new Set(existingExercises.map(e => e.name));
    
    // Find exercises that need to be added
    const toAdd = Array.from(uniqueExercises).filter(name => !existingNames.has(name));
    
    if (toAdd.length === 0) {
      console.log('All exercises already exist in database');
      return;
    }
    
    console.log(`Adding ${toAdd.length} new exercises:`, toAdd);
    
    // Determine which exercises use a barbell based on common patterns
    const barbellPatterns = [
      'squat', 'press', 'deadlift', 'row', 'bench', 'clean',
      'snatch', 'jerk', 'thruster', 'rack pull', 'good morning'
    ];
    
    // Insert missing exercises
    for (const exerciseName of toAdd) {
      const usesBarbell = barbellPatterns.some(pattern => 
        exerciseName.toLowerCase().includes(pattern)
      );
      
      await db.insert(exercises).values({
        name: exerciseName,
        usesBarbell,
        notes: null,
        youtubeLink: null,
        onerm: null,
        onermExerciseId: null
      });
      
      console.log(`Added exercise: ${exerciseName} (barbell: ${usesBarbell})`);
    }
    
    // Final count
    const finalCount = await db.select().from(exercises);
    console.log(`Database now has ${finalCount.length} exercises`);
    
  } catch (error) {
    console.error('Error seeding exercises:', error);
    throw error;
  }
}

// Run the seeding
seedExercises()
  .then(() => {
    console.log('Exercise seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Exercise seeding failed:', error);
    process.exit(1);
  });

export { seedExercises };