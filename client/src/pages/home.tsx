import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { WorkoutCard } from "@/components/workout-card";
import { LocalStorage } from "@/lib/storage";
import { Play, Settings, Activity, Dumbbell } from "lucide-react";
import type { WorkoutWithProgress } from "@/types/workout";

// Import the workout data
import { Workout } from "@shared/schema";

export default function HomePage() {
  const [location, setLocation] = useLocation();
  const [workouts, setWorkouts] = useState<WorkoutWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const nextWorkoutRef = useRef<HTMLDivElement>(null);

  const loadWorkouts = useCallback(async (force = false) => {
    // Throttle requests to prevent rapid reloading
    const now = Date.now();
    if (!force && now - lastLoadTime < 1000) {
      return;
    }
    
    try {
      setIsLoading(true);
      const [response, workoutProgress] = await Promise.all([
        fetch('/powerbuilding_data.json'),
        LocalStorage.getWorkoutProgress()
      ]);
      
      const data = await response.json();
      // Handle new JSON structure with programs
      const programData = data.programs ? data.programs[0] : { workouts: data };
      const workoutData = programData.workouts || [];
      
      const workoutsWithProgress = workoutData.map((workout: any) => ({
        ...workout,
        progress: workoutProgress[workout.workout_number],
      }));
      setWorkouts(workoutsWithProgress);
      setLastLoadTime(now);
    } catch (error) {
      console.error('Error loading workout data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [lastLoadTime]);

  useEffect(() => {
    loadWorkouts(true);
  }, []);

  const completedWorkouts = workouts.filter(w => w.progress?.status === "completed").length;
  const totalWorkouts = workouts.length;
  const progressPercentage = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0;

  const nextWorkout = workouts.find(w => 
    !w.progress || w.progress.status === "not_started"
  );

  // Scroll to next workout when workouts are loaded
  useEffect(() => {
    if (!isLoading && workouts.length > 0 && nextWorkout && nextWorkoutRef.current) {
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        nextWorkoutRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 100);
    }
  }, [isLoading, workouts.length, nextWorkout]);

  // Show loading only on initial load
  if (isLoading && workouts.length === 0) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workouts...</p>
        </div>
      </div>
    );
  }

  const handleWorkoutClick = (workout: WorkoutWithProgress) => {
    setLocation(`/workout/${workout.workout_number}`);
  };

  const handleNextWorkout = () => {
    if (nextWorkout) {
      setLocation(`/workout/${nextWorkout.workout_number}`);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white h-screen flex flex-col">
      {/* Modern Header with Gradient */}
      <header className="gradient-green text-white px-4 py-6 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-heading">Virtus</h1>
            <p className="text-green-100 text-sm mt-1 opacity-90">Powerbuilding</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg"
              onClick={() => setLocation('/exercises')}
            >
              <Dumbbell className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg"
              onClick={() => setLocation('/settings')}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Fixed Content Container */}
      <div className="flex-shrink-0">
        {/* Progress Section with Modern Design */}
        <div className="p-4">
          <Card className="bg-white shadow-lg border-0 overflow-hidden">
            <div className="gradient-green h-2"></div>
            <CardContent className="p-5">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Program Progress</h2>
              <p className="text-sm text-gray-500 mb-4">Track your powerbuilding journey</p>
              
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Workouts Completed</span>
                <span className="text-sm font-bold">
                  {completedWorkouts} of {totalWorkouts}
                </span>
              </div>
              
              <ProgressBar value={completedWorkouts} max={totalWorkouts} />
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={handleNextWorkout}
              className="gradient-green text-white p-6 h-auto flex-col space-y-3 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
              disabled={!nextWorkout}
            >
              <Play className="h-10 w-10" />
              <span className="text-sm font-semibold">Next Workout</span>
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation('/exercise-history')}
              className="p-6 h-auto flex-col space-y-3 rounded-xl border-2 hover:border-primary hover:shadow-lg transform hover:-translate-y-1 transition-all duration-200 bg-white"
            >
              <Activity className="h-10 w-10 text-primary" />
              <span className="text-sm font-semibold text-gray-700">Exercise History</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Workout List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 pb-2">
          <h3 className="text-xl font-bold text-gray-900">All Workouts</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-3">
            {workouts.map((workout) => (
              <div
                key={workout.workout_number}
                ref={workout.workout_number === nextWorkout?.workout_number ? nextWorkoutRef : null}
              >
                <WorkoutCard
                  workout={workout}
                  onClick={() => handleWorkoutClick(workout)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
