import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { WorkoutCard } from "@/components/workout-card";
import { LocalStorage } from "@/lib/storage";
import { Play, BarChart3, Settings } from "lucide-react";
import type { WorkoutWithProgress } from "@/types/workout";

// Import the workout data
import workoutData from "@assets/powerbuilding_data_1755148171236.json";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [workouts, setWorkouts] = useState<WorkoutWithProgress[]>([]);

  useEffect(() => {
    const workoutProgress = LocalStorage.getWorkoutProgress();
    const workoutsWithProgress = workoutData.map(workout => ({
      ...workout,
      progress: workoutProgress[workout.workout_number],
    }));
    setWorkouts(workoutsWithProgress);
  }, []);

  const completedWorkouts = workouts.filter(w => w.progress?.status === "completed").length;
  const totalWorkouts = workouts.length;
  const progressPercentage = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0;

  const nextWorkout = workouts.find(w => 
    !w.progress || w.progress.status === "not_started"
  );

  const handleWorkoutClick = (workout: WorkoutWithProgress) => {
    setLocation(`/workout/${workout.workout_number}`);
  };

  const handleNextWorkout = () => {
    if (nextWorkout) {
      setLocation(`/workout/${nextWorkout.workout_number}`);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Virtus</h1>
          <Button 
            variant="ghost" 
            size="icon"
            className="text-white hover:bg-blue-700"
            onClick={() => setLocation('/one-rm')}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Progress Section */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-2">Program Progress</h2>
            <p className="text-sm text-gray-600 mb-3">Powerbuilding Program</p>
            
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
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button 
            onClick={handleNextWorkout}
            className="bg-primary text-white p-4 h-auto flex-col space-y-2 hover:bg-blue-700"
            disabled={!nextWorkout}
          >
            <Play className="h-5 w-5" />
            <span>Next Workout</span>
          </Button>
          <Button 
            variant="outline"
            onClick={() => setLocation('/one-rm')}
            className="p-4 h-auto flex-col space-y-2"
          >
            <BarChart3 className="h-5 w-5" />
            <span>1RM Settings</span>
          </Button>
        </div>
      </div>

      {/* Workout List */}
      <div className="px-4 pb-6">
        <h3 className="text-lg font-semibold mb-4">All Workouts</h3>
        
        <div className="space-y-3">
          {workouts.map((workout) => (
            <WorkoutCard
              key={workout.workout_number}
              workout={workout}
              onClick={() => handleWorkoutClick(workout)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
