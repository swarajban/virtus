# Deployment Guide for Virtus

## Production Deployment Process

When deploying to production, the exercise database will be automatically populated with the necessary data.

### Automatic Exercise Seeding

The application includes an automatic seeding system that runs on server startup:

1. **On First Deploy**: When the server starts and detects an empty `exercises` table, it will automatically populate it with 56 pre-configured exercises.

2. **Seed Data Includes**:
   - All exercise names from the workout programs
   - Proper barbell/equipment flags
   - 1RM relationship mappings (e.g., Front Squat uses Back Squat's 1RM)

3. **No Manual Intervention Required**: The seeding happens automatically, so you don't need to run any manual commands.

### How It Works

1. When the server starts (`npm start` in production), it runs `seedExercises()` 
2. The function checks if exercises already exist in the database
3. If the table is empty, it inserts all 56 exercises with proper configurations
4. If exercises already exist, it skips the seeding to prevent duplicates

### Manual Seeding (If Needed)

If you ever need to manually seed the database, you can run:

```bash
tsx server/seed-exercises.ts
```

This is useful for:
- Testing the seed process
- Re-seeding after clearing the database
- Development/staging environments

### Exercise Data Structure

The seed includes:
- **Exercise Names**: All unique exercises from the powerbuilding program
- **Equipment Flags**: Whether each exercise uses a barbell
- **1RM Relationships**: Exercises that calculate weights based on other exercises' 1RM values

### Important Notes

1. **Idempotent Operation**: The seeding is safe to run multiple times - it won't create duplicates
2. **User Data Preserved**: Only populates the exercises table, doesn't affect user data or workout history
3. **Automatic on Deploy**: No need to remember to run it - happens automatically on server start

### Database Environment Variables

The app now prefers:

1. `DIRECT_DATABASE_URL`
2. `DATABASE_URL`

For Neon, use the **direct** connection string for the app server when possible.
If you only set `DATABASE_URL` and it points to a Neon `-pooler` host, the app will still try to boot, but you may hit schema or table visibility issues depending on connection mode.

Recommended setup for Neon:

```bash
DIRECT_DATABASE_URL=postgresql://user:password@ep-...us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

If you also need a pooled connection for some other tool, keep that in `DATABASE_URL`, but let the server use `DIRECT_DATABASE_URL` by default.

### Deployment Checklist

1. ✅ Push code to production
2. ✅ Ensure PostgreSQL database is configured (`DIRECT_DATABASE_URL` preferred, `DATABASE_URL` supported)
3. ✅ Start the application, exercises will seed automatically
4. ✅ Verify exercises are populated by checking the Exercises page

That's it! The exercise database will be ready to use immediately after deployment.