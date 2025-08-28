import { db } from './db';
import { exercises } from '@shared/schema';
import fs from 'fs';
import path from 'path';

async function seedExercises() {
  console.log('Starting dynamic exercise seeding...');
  
  try {
    // Read the powerbuilding data JSON file from public folder (single source of truth)
    const jsonPath = path.join(process.cwd(), 'client', 'public', 'powerbuilding_data.json');
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
    
    console.log(`Found ${uniqueExercises.size} unique exercises in workout JSON`);
    
    // Check existing exercises in database
    const existingExercises = await db.select().from(exercises);
    const existingNames = new Set(existingExercises.map(e => e.name));
    
    // Find exercises that need to be added
    const toAdd = Array.from(uniqueExercises).filter(name => !existingNames.has(name));
    
    if (toAdd.length === 0) {
      console.log(`Database already has all ${existingExercises.length} exercises.`);
      return;
    }
    
    console.log(`Adding ${toAdd.length} new exercises:`, toAdd);
    
    // Determine which exercises use a barbell based on common patterns
    const barbellPatterns = [
      'squat', 'press', 'deadlift', 'row', 'bench', 'clean',
      'snatch', 'jerk', 'thruster', 'rack pull', 'good morning',
      'barbell', 'bar '
    ];
    
    // Insert missing exercises
    for (const exerciseName of toAdd) {
      const nameLower = exerciseName.toLowerCase();
      const usesBarbell = barbellPatterns.some(pattern => nameLower.includes(pattern));
      
      await db.insert(exercises).values({
        name: exerciseName,
        usesBarbell,
        notes: null,
        youtubeLink: null,
        onerm: null,
        onermExerciseId: null
      });
      
      console.log(`Added: ${exerciseName} (barbell: ${usesBarbell})`);
    }
    
    // Final count
    const finalCount = await db.select().from(exercises);
    console.log(`Exercise seeding complete. Database now has ${finalCount.length} exercises.`);
    
  } catch (error) {
    console.error('Error seeding exercises:', error);
    // Don't throw - allow server to continue even if seeding fails
  }
}

export { seedExercises };