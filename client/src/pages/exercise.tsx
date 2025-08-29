import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { WeightInput } from "@/components/ui/weight-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ExerciseHistoryModal } from "@/components/exercise-history-modal";
import { PlateCalculator } from "@/components/plate-calculator";
import { RestTimerBar } from "@/components/rest-timer";
import { ArrowLeft, Check, CheckCircle, Info, ExternalLink, Repeat, Clock } from "lucide-react";
import { LocalStorage } from "@/lib/storage";
import { enhanceExerciseWithCalculations, getActualPercentage } from "@/lib/workout-utils";
import type { ExerciseWithCalculatedWeight } from "@/types/workout";
import type { OneRM } from "@shared/schema";

// Import types
import { Workout } from "@shared/schema";

export default function ExercisePage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/workout/:workoutNumber/exercise/:exerciseIndex");
  const [exercise, setExercise] = useState<ExerciseWithCalculatedWeight | null>(null);
  const [workoutName, setWorkoutName] = useState<string>("");
  const [userSets, setUserSets] = useState(1);
  const [userReps, setUserReps] = useState(1);
  const [userWeight, setUserWeight] = useState(0);
  const [userNotes, setUserNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [oneRM, setOneRM] = useState<OneRM | null>(null);
  const [totalExercises, setTotalExercises] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isExerciseCompleted, setIsExerciseCompleted] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [exerciseDbData, setExerciseDbData] = useState<any>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedSwapExercise, setSelectedSwapExercise] = useState<any>(null);
  const [allExercises, setAllExercises] = useState<any[]>([]);
  const [swappedFromOriginal, setSwappedFromOriginal] = useState<string | null>(null);

  const workoutNumber = params ? parseInt(params.workoutNumber) : 0;
  const exerciseIndex = params ? parseInt(params.exerciseIndex) : 0;

  // All auto-scrolling behavior removed for better mobile experience

  useEffect(() => {
    async function loadExerciseData() {
      if (workoutNumber && exerciseIndex >= 0) {
        try {
          // Keep transition state active while loading new data
          // Load all required data
          const [workoutResponse, oneRMData, workoutProgress] = await Promise.all([
            fetch('/powerbuilding_data.json'),
            LocalStorage.getOneRM(),
            LocalStorage.getWorkoutProgress()
          ]);
          
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
          setAllExercises(allExercises); // Store all exercises for swap modal
          
          // Create a map of exercise ID to 1RM weight
          const exerciseOneRMs = new Map<number, number>();
          allOneRMs.forEach((orm: any) => {
            exerciseOneRMs.set(orm.exerciseId, orm.weight);
          });
          
          const data = await workoutResponse.json();
          setOneRM(oneRMData);
          
          // Handle new JSON structure with programs
          const programData = data.programs ? data.programs[0] : { workouts: data };
          const workoutData = programData.workouts || [];
          const foundWorkout = workoutData.find((w: any) => w.workout_number === workoutNumber);
          
          if (foundWorkout && foundWorkout.exercises[exerciseIndex]) {
            let exerciseData = foundWorkout.exercises[exerciseIndex];
            const originalExerciseName = exerciseData.name;
            
            // Check if this exercise has been swapped
            const currentProgress = workoutProgress[workoutNumber];
            const exerciseKey = `${exerciseIndex}`;
            const swapInfo = currentProgress?.exerciseProgress?.[exerciseKey]?.swappedExercise;
            
            if (swapInfo) {
              // Use swapped exercise data
              const swappedExercise = allExercises.find((e: any) => e.id === swapInfo.exerciseId);
              if (swappedExercise) {
                // Preserve original exercise structure but use swapped exercise details
                exerciseData = {
                  ...exerciseData,
                  name: swappedExercise.name,
                  notes: swappedExercise.notes || exerciseData.notes,
                  id: swappedExercise.id,
                  onermExerciseId: swappedExercise.onermExerciseId
                };
                setExerciseDbData(swappedExercise);
                setSwappedFromOriginal(originalExerciseName);
              }
            } else {
              // Find the database exercise record for original exercise
              const dbExercise = allExercises.find((e: any) => e.name === exerciseData.name);
              if (dbExercise) {
                setExerciseDbData(dbExercise);
                // Add the ID to exercise data for weight calculations
                exerciseData.id = dbExercise.id;
                exerciseData.onermExerciseId = dbExercise.onermExerciseId;
              }
            }
            
            const enhancedExercise = enhanceExerciseWithCalculations(
              exerciseData, 
              oneRMData, 
              exerciseOneRMs, 
              allExercises
            );
            setExercise(enhancedExercise);
            setWorkoutName(foundWorkout.workout_name);
            setTotalExercises(foundWorkout.exercises.length);
            
            // Set initial values
            setUserSets(enhancedExercise.number_of_sets);
            setUserReps(enhancedExercise.number_of_reps || 1);
            setUserWeight(enhancedExercise.calculatedWeight || 0);
            setUserNotes(""); // Clear notes for new exercises

            // Check if exercise is already completed
            const isCompleted = currentProgress?.exerciseProgress?.[exerciseKey]?.completed || false;
            setIsExerciseCompleted(isCompleted);

            // If completed, load the saved values
            if (isCompleted && currentProgress?.exerciseProgress?.[exerciseKey]) {
              const savedProgress = currentProgress.exerciseProgress[exerciseKey];
              setUserSets(savedProgress.sets);
              setUserReps(savedProgress.reps);
              setUserWeight(savedProgress.weight || 0);
              setUserNotes(savedProgress.notes || "");
            }
          }
        } catch (error) {
          console.error('Error loading exercise data:', error);
        } finally {
          setIsInitialLoading(false);
          // Add minimum transition duration to ensure loading animation is visible
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }
      }
    }
    
    loadExerciseData();
  }, [workoutNumber, exerciseIndex]);

  if (isInitialLoading) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exercise...</p>
        </div>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Exercise not found</p>
        </div>
      </div>
    );
  }

  const handleCompleteExercise = async () => {
    setIsCompleting(true);

    console.log("Completing exercise:", {
      exerciseName: exercise.name,
      typeOfSet: exercise.type_of_set,
      userWeight,
      userSets,
      userReps,
      shouldSaveHistory: userWeight > 0 && exercise.type_of_set === "working"
    });

    try {
      // Save exercise history only for working sets (not warm-ups)
      if (userWeight > 0 && exercise.type_of_set === "working") {
        const historyEntry = {
          programName: "Powerbuilding 4x", // Default program name
          date: new Date().toISOString(),
          exerciseName: exercise.name,
          sets: userSets,
          reps: userReps,
          weight: userWeight,
          notes: userNotes,
          typeOfSet: exercise.type_of_set as "warm-up" | "working",
        };
        console.log("Saving exercise history entry:", historyEntry);
        await LocalStorage.saveExerciseHistory(historyEntry, workoutNumber);
      } else {
        console.log("Not saving exercise history because:", {
          hasWeight: userWeight > 0,
          isWorkingSet: exercise.type_of_set === "working",
          typeOfSet: exercise.type_of_set
        });
      }

      // Save exercise completion to workout progress
      const workoutProgress = await LocalStorage.getWorkoutProgress();
      const currentProgress = workoutProgress[workoutNumber] || {
        workoutNumber,
        status: "in_progress" as const,
        startedAt: new Date().toISOString(),
        exerciseProgress: {},
      };

      const exerciseKey = `${exerciseIndex}`;
      // Preserve existing exercise data including swap information
      const existingExerciseData = currentProgress.exerciseProgress?.[exerciseKey] || {};
      currentProgress.exerciseProgress = {
        ...currentProgress.exerciseProgress,
        [exerciseKey]: {
          ...existingExerciseData, // Preserve swap data if it exists
          sets: userSets,
          reps: userReps,
          weight: userWeight,
          notes: userNotes,
          completed: true,
        },
      };

      await LocalStorage.saveWorkoutProgress(workoutNumber, currentProgress);

      // Show completion animation then navigate - reduced to 500ms
      setTimeout(() => {
        setIsCompleting(false);
        // Scroll to top only when user completes exercise
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Navigate to next exercise or back to workout
        if (exerciseIndex < totalExercises - 1) {
          setLocation(`/workout/${workoutNumber}/exercise/${exerciseIndex + 1}`);
        } else {
          setLocation(`/workout/${workoutNumber}`);
        }
      }, 500); // Reduced from 1000ms to 500ms
    } catch (error) {
      console.error("Error completing exercise:", error);
      setIsCompleting(false);
    }
  };

  const handlePreviousExercise = () => {
    // Set transitioning state before navigation
    setIsTransitioning(true);
    // Scroll to top only when user clicks Previous button
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (exerciseIndex > 0) {
      setLocation(`/workout/${workoutNumber}/exercise/${exerciseIndex - 1}`);
    } else {
      setLocation(`/workout/${workoutNumber}`);
    }
  };

  const handleNextExercise = () => {
    if (exerciseIndex < totalExercises - 1) {
      // Set transitioning state before navigation
      setIsTransitioning(true);
      // Scroll to top only when user clicks Next button
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setLocation(`/workout/${workoutNumber}/exercise/${exerciseIndex + 1}`);
    }
  };

  const handleSwapExercise = async () => {
    if (!selectedSwapExercise) return;
    
    try {
      // Get current workout progress
      const workoutProgress = await LocalStorage.getWorkoutProgress();
      const currentProgress = workoutProgress[workoutNumber] || {
        programName: localStorage.getItem('selected-program') || 'Powerbuilding 4x',
        workoutNumber: workoutNumber,
        status: "not_started" as const,
        exerciseProgress: {}
      };
      const exerciseKey = `${exerciseIndex}`;
      
      // Update the exercise progress with swap info
      const updatedExerciseProgress = {
        ...(currentProgress.exerciseProgress || {}),
        [exerciseKey]: {
          ...(currentProgress.exerciseProgress?.[exerciseKey] || {}),
          completed: currentProgress.exerciseProgress?.[exerciseKey]?.completed || false,
          sets: currentProgress.exerciseProgress?.[exerciseKey]?.sets || 1,
          reps: currentProgress.exerciseProgress?.[exerciseKey]?.reps || 1,
          swappedExercise: {
            name: selectedSwapExercise.name,
            originalName: swappedFromOriginal || exercise.name,
            exerciseId: selectedSwapExercise.id
          }
        }
      };
      
      // Save to workout progress with all required fields
      const progressToSave = {
        programName: currentProgress.programName || localStorage.getItem('selected-program') || 'Powerbuilding 4x',
        workoutNumber: workoutNumber,
        status: currentProgress.status || "not_started",
        startedAt: currentProgress.startedAt,
        completedAt: currentProgress.completedAt,
        exerciseProgress: updatedExerciseProgress
      };
      
      console.log("Saving workout progress with swap data:", progressToSave);
      console.log("Exercise progress with swap:", updatedExerciseProgress);
      
      await LocalStorage.saveWorkoutProgress(workoutNumber, progressToSave);
      
      // Close modal and reload the page
      setShowSwapModal(false);
      setSelectedSwapExercise(null);
      
      // Reload the exercise data
      window.location.reload();
    } catch (error) {
      console.error("Error swapping exercise:", error);
    }
  };

  const getOneRMForExercise = () => {
    if (!oneRM) return 0;
    switch (exercise.name) {
      case "Back squat": return oneRM.backSquat;
      case "Barbell bench press": return oneRM.benchPress;
      case "Deadlift": return oneRM.deadlift;
      case "Overhead press": return oneRM.overheadPress;
      default: return 0;
    }
  };

  const exerciseOneRM = getOneRMForExercise();

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative">
      {/* Transition Loading Animation */}
      {isTransitioning && (
        <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading exercise...</p>
          </div>
        </div>
      )}
      {/* Simplified Completion Animation - Faster and Cleaner */}
      {isCompleting && (
        <div className="fixed inset-0 bg-green-500 bg-opacity-90 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-2xl p-6 shadow-2xl transform scale-95 animate-scale-check">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
            <p className="text-lg font-semibold text-gray-800">Complete!</p>
          </div>
        </div>
      )}
      {/* Modern Header - Changed from sticky to relative on mobile */}
      <header className="gradient-purple text-white px-4 py-6 relative shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation(`/workout/${workoutNumber}`)}
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{workoutName || "Exercise"}</h1>
          </div>
        </div>
      </header>

      {/* Rest Timer Bar - conditionally render */}
      <RestTimerBar />

      {/* Exercise Header with Modern Design */}
      <div className="bg-gradient-to-b from-purple-50 to-white p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600 font-medium uppercase tracking-wide">
            Exercise {exerciseIndex + 1} of {totalExercises}
          </span>
          {isExerciseCompleted && (
            <Badge className="bg-green-500 hover:bg-green-500 text-white border-green-500 px-3 py-1 rounded-full text-xs font-semibold">
              <CheckCircle className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {exercise.name}
            {exerciseDbData && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLocation(`/exercise/${exerciseDbData.id}`)}
                  className="hover:bg-purple-100 p-1"
                  title="View exercise details"
                >
                  <ExternalLink className="h-4 w-4 text-purple-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSwapModal(true)}
                  className="hover:bg-purple-100 p-1"
                  title="Swap exercise"
                >
                  <Repeat className="h-4 w-4 text-purple-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(true)}
                  className="hover:bg-purple-100 p-1"
                  title="View exercise history"
                >
                  <Clock className="h-4 w-4 text-purple-600" />
                </Button>
              </>
            )}
          </h2>
          {exercise.superset_label && (
            <Badge className="bg-purple-500 text-white px-3 py-1 text-sm font-bold rounded-full shadow-md">
              Superset {exercise.superset_label}
            </Badge>
          )}
        </div>
        <p className="text-sm opacity-90">
          {exercise.number_of_sets} x {exercise.number_of_reps || "AMRAP"}
          {exercise.load_percentage && ` @ ${exercise.load_percentage}% 1RM`}
          {exercise.rpe && ` (RPE ${exercise.rpe})`}
        </p>
        {swappedFromOriginal && (
          <p className="text-xs text-purple-600 mt-1">
            <Repeat className="h-3 w-3 inline mr-1" />
            Swapped from: {swappedFromOriginal}
          </p>
        )}
      </div>

      {/* Set Type Banner with Modern Styling */}
      <div className={`w-full py-3 px-4 text-center font-semibold text-white shadow-md ${
        exercise.type_of_set === "working" 
          ? "gradient-green" 
          : "bg-gradient-to-r from-yellow-500 to-orange-500"
      }`}>
        <span className="uppercase tracking-wide text-sm">
          {exercise.type_of_set} set
          {exercise.superset_label && ` • Part of Superset ${exercise.superset_label}`}
        </span>
      </div>

      {/* Exercise Navigation - Moved to top for better accessibility */}
      <div className="p-4 bg-white border-b">
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Button
            variant="outline"
            onClick={() => setLocation(`/workout/${workoutNumber}`)}
            className="text-sm"
          >
            Workout
          </Button>
          <Button
            variant="outline"
            onClick={handlePreviousExercise}
            disabled={exerciseIndex === 0}
            className="text-sm"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={handleNextExercise}
            disabled={exerciseIndex >= totalExercises - 1}
            className="text-sm"
          >
            Next
          </Button>
        </div>
        <Button 
          onClick={handleCompleteExercise}
          disabled={isCompleting}
          className={`w-full h-12 transition-all duration-300 ${
            isCompleting 
              ? "bg-green-600 scale-105 shadow-lg" 
              : isExerciseCompleted 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-secondary hover:bg-green-700"
          } text-white`}
        >
          <Check className={`h-4 w-4 mr-2 transition-transform duration-300 ${
            isCompleting ? "scale-125" : ""
          }`} />
          {isCompleting 
            ? "Exercise Completed!" 
            : isExerciseCompleted 
              ? "Mark Complete Again" 
              : "Complete Exercise"}
        </Button>
      </div>

      {/* Weight Calculator */}
      {exercise.calculatedWeight && (
        <div className="p-4 bg-yellow-50 border-b">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">Recommended Weight</span>
                <span className="text-lg font-bold text-primary">
                  {exercise.calculatedWeight} lbs
                </span>
              </div>
              <div className="text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>1RM: {exerciseOneRM} lbs</span>
                  <span>Load: {exercise.load_percentage}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Exercise Input */}
      <div className="p-4 space-y-6">
        {/* Sets and Reps */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-4">Sets & Reps</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sets
                </label>
                <WeightInput
                  value={userSets}
                  onChange={setUserSets}
                  step={1}
                  min={1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reps
                </label>
                <WeightInput
                  value={userReps}
                  onChange={setUserReps}
                  step={1}
                  min={1}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weight */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-4">Weight (lbs)</h3>
            <WeightInput
              value={userWeight}
              onChange={setUserWeight}
              step={5}
              min={0}
              className="mb-2"
            />
            {exerciseOneRM > 0 && userWeight > 0 && (
              <div className="text-center">
                <span className="text-sm text-gray-600">
                  Actual: {getActualPercentage(userWeight, exerciseOneRM)} of 1RM
                </span>
              </div>
            )}
            {userWeight > 0 && exerciseDbData?.usesBarbell && <PlateCalculator weight={userWeight} />}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Exercise Notes</h3>
            {exercise.notes && (
              <div className="bg-blue-50 p-3 rounded-lg mb-3">
                <p className="text-sm text-blue-700">
                  <Info className="inline h-4 w-4 mr-1" />
                  {exercise.notes}
                </p>
              </div>
            )}
            <Textarea
              placeholder="Add your notes..."
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>
      </div>


      {/* Exercise History Modal */}
      <ExerciseHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        exerciseName={exercise.name}
      />

      {/* Exercise Swap Modal */}
      <Dialog open={showSwapModal} onOpenChange={setShowSwapModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swap Exercise</DialogTitle>
            <DialogDescription>
              Select an exercise to swap with "{exercise.name}"
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Search exercises..." />
            <CommandList>
              <CommandEmpty>No exercises found.</CommandEmpty>
              <CommandGroup>
                {allExercises
                  .filter((e: any) => e.id !== exerciseDbData?.id)
                  .map((ex: any) => (
                    <CommandItem
                      key={ex.id}
                      value={ex.name}
                      onSelect={() => setSelectedSwapExercise(ex)}
                      className={selectedSwapExercise?.id === ex.id ? "bg-purple-50" : ""}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          selectedSwapExercise?.id === ex.id ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      {ex.name}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowSwapModal(false);
                setSelectedSwapExercise(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSwapExercise}
              disabled={!selectedSwapExercise}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Swap
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
