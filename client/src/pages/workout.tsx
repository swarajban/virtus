import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Check, CheckCircle, ArrowRight, Circle, RotateCcw, Repeat } from "lucide-react";
import { LocalStorage } from "@/lib/storage";
import { api } from "@/lib/api-client";
import { getWorkoutStatusBadge, formatDate, enhanceExerciseWithCalculations } from "@/lib/workout-utils";
import type { WorkoutWithProgress, ExerciseWithCalculatedWeight } from "@/types/workout";
import type { User } from "@shared/schema";

// Import types
import { Workout } from "@shared/schema";

export default function WorkoutPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/workout/:workoutNumber");
  const [workout, setWorkout] = useState<WorkoutWithProgress | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithCalculatedWeight[]>([]);
  const [showReset, setShowReset] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const workoutNumber = params ? parseInt(params.workoutNumber) : 0;

  useEffect(() => {
    async function loadWorkoutData() {
      if (workoutNumber) {
        try {
          setIsLoading(true);
          const [response, workoutProgress, oneRM, user] = await Promise.all([
            fetch('/powerbuilding_data.json'),
            LocalStorage.getWorkoutProgress(),
            LocalStorage.getOneRM(),
            api.getCurrentUser().catch(() => null)
          ]);
          
          if (user) {
            setCurrentUser(user);
          }
          
          // Fetch all exercises and their 1RMs
          const [allExercisesResponse, allOneRMsResponse] = await Promise.all([
            fetch('/api/exercises', {
              headers: { 'x-username': localStorage.getItem('selected-username') || 'demo' }
            }),
            fetch('/api/one-rm/all', {
              headers: { 'x-username': localStorage.getItem('selected-username') || 'demo' }
            })
          ]);
          
          const allExercises = await allExercisesResponse.json();
          const allOneRMs = await allOneRMsResponse.json();
          
          // Create a map of exercise ID to 1RM weight
          const exerciseOneRMs = new Map<number, number>();
          allOneRMs.forEach((orm: any) => {
            exerciseOneRMs.set(orm.exerciseId, orm.weight);
          });
          
          const data = await response.json();
          // Handle new JSON structure with programs
          const programData = data.programs ? data.programs[0] : { workouts: data };
          const workoutData = programData.workouts || [];
          const foundWorkout = workoutData.find((w: any) => w.workout_number === workoutNumber);
          
          if (foundWorkout) {
            const workoutWithProgress: WorkoutWithProgress = {
              ...foundWorkout,
              progress: workoutProgress[workoutNumber],
            };
            setWorkout(workoutWithProgress);

            // Enhance exercises with calculated weights using new 1RM system
            // Also handle swapped exercises
            const enhancedExercises = foundWorkout.exercises.map((exercise: any, index: number) => {
              const exerciseKey = `${index}`;
              const swapInfo = workoutProgress[workoutNumber]?.exerciseProgress?.[exerciseKey]?.swappedExercise;
              
              let exerciseToEnhance = exercise;
              if (swapInfo) {
                // Replace with swapped exercise details
                const swappedExercise = allExercises.find((e: any) => e.id === swapInfo.exerciseId);
                if (swappedExercise) {
                  exerciseToEnhance = {
                    ...exercise,
                    name: swappedExercise.name,
                    notes: swappedExercise.notes || exercise.notes,
                    id: swappedExercise.id,
                    onermExerciseId: swappedExercise.onermExerciseId,
                    swappedFrom: swapInfo.originalName
                  };
                }
              }
              
              return enhanceExerciseWithCalculations(exerciseToEnhance, oneRM, exerciseOneRMs, allExercises);
            });
            setExercises(enhancedExercises);
          }
        } catch (error) {
          console.error('Error loading workout data:', error);
        } finally {
          setIsLoading(false);
        }
      }
    }
    
    loadWorkoutData();
  }, [workoutNumber]);

  if (isLoading || !workout) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workout...</p>
        </div>
      </div>
    );
  }

  const status = workout.progress?.status || "not_started";
  const statusBadge = getWorkoutStatusBadge(status);

  const handleStartWorkout = async () => {
    const progress = {
      programName: localStorage.getItem('selected-program') || 'Powerbuilding 4x',
      workoutNumber,
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
      exerciseProgress: workout.progress?.exerciseProgress || {}, // PRESERVE existing exercise progress
    };
    await LocalStorage.saveWorkoutProgress(workoutNumber, progress);
    setWorkout({ ...workout, progress });
  };

  const handleCompleteWorkout = async () => {
    const progress = {
      programName: localStorage.getItem('selected-program') || 'Powerbuilding 4x',
      workoutNumber,
      status: "completed" as const,
      startedAt: workout.progress?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      exerciseProgress: workout.progress?.exerciseProgress || {}, // PRESERVE existing exercise progress
    };
    await LocalStorage.saveWorkoutProgress(workoutNumber, progress);
    setWorkout({ ...workout, progress });
  };

  const handleResetWorkout = async () => {
    try {
      // IMPORTANT: Clear exercise history FIRST (while we still have the session ID)
      // Then clear workout progress
      await LocalStorage.clearExerciseHistoryForWorkout(workoutNumber);
      await LocalStorage.clearWorkoutProgress(workoutNumber);
      
      // Update the workout state
      const resetWorkout = { ...workout, progress: undefined };
      setWorkout(resetWorkout);
      console.log(`Reset workout ${workoutNumber} - cleared progress and session-specific exercise history`);
    } catch (error) {
      console.error("Error resetting workout:", error);
    }
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
      {/* Modern Header */}
      <header className="gradient-green text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Workout</h1>
              {currentUser?.currentProgramCycle && currentUser.currentProgramCycle > 1 && (
                <p className="text-green-100 text-xs opacity-90">Cycle {currentUser.currentProgramCycle}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Workout Header */}
      <div className="bg-gradient-to-b from-purple-50 to-white p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600 font-medium uppercase tracking-wide">
            Week {workout.week_number} • Day {workout.day_number}
          </span>
          <Badge className={`${statusBadge.className} px-3 py-1 rounded-full text-xs font-semibold`}>
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
            onClick={() => setShowReset(true)}
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
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-1">
                        {exercise.name}
                        {(exercise as any).swappedFrom && (
                          <span title={`Swapped from: ${(exercise as any).swappedFrom}`}>
                            <Repeat className="h-3 w-3 text-purple-600" />
                          </span>
                        )}
                      </h4>
                      {exercise.superset_label && (
                        <Badge className="bg-purple-500 text-white px-2 py-0.5 text-xs font-bold rounded">
                          Superset {exercise.superset_label}
                        </Badge>
                      )}
                    </div>
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

      {/* Reset Confirmation Dialog */}
      {showReset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg mx-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-2">Reset Workout?</h3>
            <p className="text-gray-600 mb-4">
              This will clear all progress and exercise history for this workout. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowReset(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  handleResetWorkout();
                  setShowReset(false);
                }}
                className="flex-1"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
