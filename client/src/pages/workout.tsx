import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Check, CheckCircle, ArrowRight, Circle, RotateCcw } from "lucide-react";
import { LocalStorage } from "@/lib/storage";
import { getWorkoutStatusBadge, formatDate, enhanceExerciseWithCalculations } from "@/lib/workout-utils";
import type { WorkoutWithProgress, ExerciseWithCalculatedWeight } from "@/types/workout";

// Import types
import { Workout } from "@shared/schema";

export default function WorkoutPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/workout/:workoutNumber");
  const [workout, setWorkout] = useState<WorkoutWithProgress | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithCalculatedWeight[]>([]);

  const workoutNumber = params ? parseInt(params.workoutNumber) : 0;

  useEffect(() => {
    async function loadWorkoutData() {
      if (workoutNumber) {
        try {
          const [response, workoutProgress, oneRM] = await Promise.all([
            fetch('/powerbuilding_data.json'),
            LocalStorage.getWorkoutProgress(),
            LocalStorage.getOneRM()
          ]);
          
          const workoutData = await response.json();
          const foundWorkout = workoutData.find((w: any) => w.workout_number === workoutNumber);
          
          if (foundWorkout) {
            const workoutWithProgress: WorkoutWithProgress = {
              ...foundWorkout,
              progress: workoutProgress[workoutNumber],
            };
            setWorkout(workoutWithProgress);

            // Enhance exercises with calculated weights
            const enhancedExercises = foundWorkout.exercises.map((exercise: any) => 
              enhanceExerciseWithCalculations(exercise, oneRM)
            );
            setExercises(enhancedExercises);
          }
        } catch (error) {
          console.error('Error loading workout data:', error);
        }
      }
    }
    
    loadWorkoutData();
  }, [workoutNumber]);

  if (!workout) {
    return <div>Loading...</div>;
  }

  const status = workout.progress?.status || "not_started";
  const statusBadge = getWorkoutStatusBadge(status);

  const handleStartWorkout = async () => {
    const progress = {
      workoutNumber,
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
    };
    await LocalStorage.saveWorkoutProgress(workoutNumber, progress);
    setWorkout({ ...workout, progress });
  };

  const handleCompleteWorkout = async () => {
    const progress = {
      workoutNumber,
      status: "completed" as const,
      startedAt: workout.progress?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    await LocalStorage.saveWorkoutProgress(workoutNumber, progress);
    setWorkout({ ...workout, progress });
  };

  const handleResetWorkout = async () => {
    // Clear the workout progress from database
    await LocalStorage.clearWorkoutProgress(workoutNumber);
    // Update the workout state
    const resetWorkout = { ...workout, progress: undefined };
    setWorkout(resetWorkout);
  };

  const handleExerciseClick = (exerciseIndex: number) => {
    setLocation(`/workout/${workoutNumber}/exercise/${exerciseIndex}`);
  };

  const getExerciseStatus = (exercise: ExerciseWithCalculatedWeight, index: number) => {
    // Check if this exercise has been completed
    const exerciseKey = `${index}`;
    const isCompleted = workout?.progress?.exerciseProgress?.[exerciseKey]?.completed || false;
    
    if (isCompleted) return "completed";
    if (status === "in_progress") {
      // Find the first uncompleted exercise to mark as current
      const firstIncompleteIndex = exercises.findIndex((_, i) => {
        const key = `${i}`;
        return !workout?.progress?.exerciseProgress?.[key]?.completed;
      });
      if (index === firstIncompleteIndex) return "current";
    }
    return "upcoming";
  };

  const getStatusText = () => {
    if (status === "completed" && workout.progress?.completedAt) {
      return `Completed on ${formatDate(workout.progress.completedAt)}`;
    }
    if (status === "in_progress" && workout.progress?.startedAt) {
      const startTime = new Date(workout.progress.startedAt);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `Started ${diffMins} minutes ago`;
    }
    return "Ready to start";
  };

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-blue-700 p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Workout</h1>
          </div>
        </div>
      </header>

      {/* Workout Header */}
      <div className="bg-gradient-to-r from-primary to-blue-600 text-white p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm opacity-90">
            Week {workout.week_number}, Day {workout.day_number}
          </span>
          <Badge className={statusBadge.className}>
            {statusBadge.icon && <i className={`${statusBadge.icon} mr-1`} />}
            {statusBadge.label}
          </Badge>
        </div>
        <h2 className="text-xl font-bold mb-1">{workout.workout_name}</h2>
        <p className="text-sm opacity-90">{getStatusText()}</p>
      </div>

      {/* Workout Actions */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="grid grid-cols-2 gap-3 mb-3">
          {status === "not_started" && (
            <Button 
              onClick={handleStartWorkout}
              className="bg-secondary text-white hover:bg-green-700 h-12"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Workout
            </Button>
          )}
          {status === "in_progress" && (
            <Button 
              onClick={handleCompleteWorkout}
              className="bg-secondary text-white hover:bg-green-700 h-12"
            >
              <Check className="h-4 w-4 mr-2" />
              Complete Workout
            </Button>
          )}
          {status === "completed" && (
            <Button 
              disabled
              className="bg-gray-200 text-gray-700 h-12"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Completed
            </Button>
          )}
          <Button 
            variant="outline"
            onClick={() => setLocation('/')}
            className="h-12"
          >
            Back to Home
          </Button>
        </div>
        {(status === "in_progress" || status === "completed") && (
          <Button 
            variant="destructive"
            onClick={handleResetWorkout}
            className="w-full h-10 text-sm"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Workout
          </Button>
        )}
      </div>

      {/* Exercise List */}
      <div className="px-4 py-6">
        <h3 className="text-lg font-semibold mb-4">Exercises</h3>
        
        <div className="space-y-3">
          {exercises.map((exercise, index) => {
            const exerciseStatus = getExerciseStatus(exercise, index);
            
            return (
              <Card 
                key={index}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md active:scale-98 border-l-4 ${
                  exerciseStatus === "completed" ? "border-secondary" :
                  exerciseStatus === "current" ? "border-warning" : "border-gray-200"
                }`}
                onClick={() => handleExerciseClick(index)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{exercise.name}</h4>
                    {exerciseStatus === "completed" && (
                      <CheckCircle className="h-5 w-5 text-secondary" />
                    )}
                    {exerciseStatus === "current" && (
                      <ArrowRight className="h-5 w-5 text-warning" />
                    )}
                    {exerciseStatus === "upcoming" && (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <Badge variant={exercise.type_of_set === "working" ? "default" : "secondary"}>
                      {exercise.type_of_set}
                    </Badge>
                    <span>
                      {exercise.number_of_sets} x {exercise.number_of_reps || "AMRAP"}
                    </span>
                    {exercise.calculatedWeight && (
                      <span>{exercise.calculatedWeight} lbs</span>
                    )}
                    {exercise.load_percentage && (
                      <span>{exercise.load_percentage}% 1RM</span>
                    )}
                    {exercise.rpe && (
                      <span>RPE {exercise.rpe}</span>
                    )}
                  </div>
                  
                  {exercise.notes && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700">
                        <i className="fas fa-info-circle mr-1" />
                        {exercise.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
