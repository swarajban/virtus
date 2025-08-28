#!/usr/bin/env tsx
/**
 * Migration script to populate exercise_id in exercise_history table
 * based on matching exercise_name to exercises.name
 * 
 * Usage: 
 * - Production: DATABASE_URL=your_prod_url tsx scripts/migrate-exercise-history.ts
 * - Development: tsx scripts/migrate-exercise-history.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { exercises, exerciseHistory } from '../shared/schema';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';
import ws from "ws";

// Configure neon for serverless
neonConfig.webSocketConstructor = ws;

async function migrateExerciseHistory() {
  console.log('🚀 Starting exercise history migration...');
  
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.log('Usage: DATABASE_URL=your_database_url tsx scripts/migrate-exercise-history.ts');
    process.exit(1);
  }
  
  console.log('📁 Database URL configured');
  
  // Initialize database connection
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema: { exercises, exerciseHistory } });
  
  try {
    // Test database connection
    console.log('🔌 Testing database connection...');
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful');
    
    // Get all exercises to create name-to-id mapping
    console.log('📋 Loading exercises...');
    const allExercises = await db.select().from(exercises);
    console.log(`✅ Found ${allExercises.length} exercises in database`);
    
    // Create mapping from exercise name to exercise ID
    const nameToIdMap = new Map<string, number>();
    for (const exercise of allExercises) {
      nameToIdMap.set(exercise.name, exercise.id);
    }
    
    // Find exercise history records that need migration
    // These are records where exerciseId is null or 0, but exerciseName exists
    console.log('🔍 Finding exercise history records that need migration...');
    const recordsToMigrate = await db
      .select()
      .from(exerciseHistory)
      .where(
        and(
          isNull(exerciseHistory.exerciseId), // Records where exerciseId is null
          isNotNull(exerciseHistory.exerciseName) // BUT exerciseName is not null
        )
      );
    
    // Also check for records where exerciseId might be 0
    const recordsWithZeroId = await db
      .select()
      .from(exerciseHistory)
      .where(eq(exerciseHistory.exerciseId, 0));
    
    const allRecordsToMigrate = [...recordsToMigrate, ...recordsWithZeroId];
    
    console.log(`📊 Found ${allRecordsToMigrate.length} exercise history records to migrate`);
    
    if (allRecordsToMigrate.length === 0) {
      console.log('✅ No records need migration. All exercise history records already have valid exercise IDs.');
      return;
    }
    
    // Statistics tracking
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const unmatchedExercises = new Set<string>();
    
    console.log('🔄 Starting migration...');
    
    // Process records in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < allRecordsToMigrate.length; i += batchSize) {
      const batch = allRecordsToMigrate.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allRecordsToMigrate.length/batchSize)} (${batch.length} records)`);
      
      for (const record of batch) {
        try {
          if (!record.exerciseName) {
            console.log(`⚠️  Skipping record ID ${record.id}: No exercise name`);
            skippedCount++;
            continue;
          }
          
          const exerciseId = nameToIdMap.get(record.exerciseName);
          
          if (!exerciseId) {
            console.log(`❌ No matching exercise found for "${record.exerciseName}" (record ID: ${record.id})`);
            unmatchedExercises.add(record.exerciseName);
            errorCount++;
            continue;
          }
          
          // Update the record
          await db
            .update(exerciseHistory)
            .set({ exerciseId })
            .where(eq(exerciseHistory.id, record.id));
          
          successCount++;
          
          if (successCount % 50 === 0) {
            console.log(`✅ Updated ${successCount} records so far...`);
          }
          
        } catch (error) {
          console.error(`❌ Error updating record ID ${record.id}:`, error);
          errorCount++;
        }
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully updated: ${successCount} records`);
    console.log(`⚠️  Skipped: ${skippedCount} records`);
    console.log(`❌ Errors: ${errorCount} records`);
    
    if (unmatchedExercises.size > 0) {
      console.log('\n🔍 Unmatched exercise names:');
      unmatchedExercises.forEach(name => {
        console.log(`  - "${name}"`);
      });
      console.log('\n💡 You may need to:');
      console.log('  1. Add these exercises to the exercises table, or');
      console.log('  2. Update the exercise names in history to match existing exercises');
    }
    
    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const remainingUnmigrated = await db
      .select()
      .from(exerciseHistory)
      .where(
        and(
          isNull(exerciseHistory.exerciseId)
        )
      );
    
    const remainingWithZeroId = await db
      .select()
      .from(exerciseHistory)
      .where(eq(exerciseHistory.exerciseId, 0));
    
    const totalRemaining = remainingUnmigrated.length + remainingWithZeroId.length;
    
    console.log(`📊 Remaining unmigrated records: ${totalRemaining}`);
    
    if (totalRemaining === 0) {
      console.log('🎉 Migration completed successfully! All exercise history records now have valid exercise IDs.');
    } else {
      console.log(`⚠️  ${totalRemaining} records still need attention.`);
    }
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
migrateExerciseHistory()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });