# Production Database Fix

## Issue: Missing "Deadlift" Exercise

The production database is missing the "Deadlift" exercise because the initial seed used "Conventional deadlift" instead of just "Deadlift".

## Quick Fix (Run in Production)

You can run this script directly on production to add the missing exercise:

```bash
tsx server/fix-production-exercises.ts
```

This script will:
1. Add "Deadlift" if it's missing
2. Set up proper 1RM relationships for deadlift variations
3. Won't create duplicates if run multiple times

## What the Fix Does

1. **Adds Missing Exercise**: Inserts "Deadlift" with proper barbell flag
2. **Fixes Relationships**: Updates all deadlift variations to use Deadlift's 1RM:
   - Romanian deadlift
   - Stiff-legged deadlift
   - Sumo deadlift
   - Deficit deadlift
   - Pause deadlift
   - 3" block pull
   - 5" block pull

## Prevention for Future Deployments

The seed script has been updated to:
1. Use "Deadlift" instead of "Conventional deadlift"
2. Always check for critical missing exercises even if database is not empty
3. Add missing critical exercises automatically on server startup

Critical exercises that are always checked:
- Deadlift
- Back squat
- Barbell bench press
- Overhead press

## Verification

After running the fix, verify that:
1. "Deadlift" appears in the Exercises page
2. Workout programs that use Deadlift work correctly
3. 1RM calculations for Deadlift work properly