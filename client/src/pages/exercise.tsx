import { useState, useEffect, useRef } from "react";
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
import { ArrowLeft, Check, CheckCircle, Info, ExternalLink, Repeat, Clock, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { LocalStorage } from "@/lib/storage";
import { api } from "@/lib/api-client";
import { enhanceExerciseWithCalculations, getActualPercentage } from "@/lib/workout-utils";
import { usePowerbuildingData, resolveProgramWorkouts, skipWarmups } from "@/hooks/use-powerbuilding-data";
import { useAllExercises, useAllOneRMs, exerciseHistoryQueryOptions } from "@/hooks/use-exercises-data";
import { useQueryClient } from "@tanstack/react-query";
import { ProgramDataError } from "@/components/program-data-error";
import { tapProps, DURATION, RACK_EASE } from "@/lib/motion";
import type { ExerciseWithCalculatedWeight } from "@/types/workout";
import type { OneRM } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Import types
import { Workout } from "@shared/schema";

export default function ExercisePage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/workout/:workoutNumber/exercise/:exerciseIndex");
  const { toast } = useToast();
  const [exercise, setExercise] = useState<ExerciseWithCalculatedWeight | null>(null);
  const [workoutName, setWorkoutName] = useState<string>("");
  const [selectedProgram, setSelectedProgram] = useState<string>("Powerbuilding 4x");
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
  const [exerciseDbData, setExerciseDbData] = useState<any>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedSwapExercise, setSelectedSwapExercise] = useState<any>(null);
  const [swapSearchQuery, setSwapSearchQuery] = useState("");
  const [allExercises, setAllExercises] = useState<any[]>([]);
  const [swappedFromOriginal, setSwappedFromOriginal] = useState<string | null>(null);
  const [warmupInfo, setWarmupInfo] = useState<any>(null);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);

  // Cached program JSON — fetched once per session, served from memory after.
  // Navigation reads the workout's exercise list from this ref synchronously,
  // so Next/Previous/Complete never block on a network fetch.
  const { data: programJson, isError: programError, refetch: refetchProgram } = usePowerbuildingData();
  // Exercise library + every-exercise 1RM map from the shared TanStack cache
  // (keys ["/api/exercises"], ["/api/one-rm/all"]). Shared with the workout page
  // so back/forward navigation serves from the warm cache instead of blocking on
  // a cold fetch. `data` is undefined until first load, then a (possibly empty
  // for one-RMs) array.
  const { data: allExercisesData } = useAllExercises();
  const { data: allOneRMsData } = useAllOneRMs();
  const queryClient = useQueryClient();
  const navExercisesRef = useRef<any[]>([]);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  // Clear any pending completion-advance timer if the page unmounts mid-reward,
  // so it can't setState or navigate after the component is gone.
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  const workoutNumber = parseInt(params?.workoutNumber ?? '0', 10);
  const exerciseIndex = parseInt(params?.exerciseIndex ?? '0', 10);

  // Directional nav cue. The page stays mounted across exercise nav (only the
  // :exerciseIndex route param changes), so an enter-only animation would no-op;
  // we re-trigger it by remounting a SMALL keyed wrapper. Two subtleties this
  // handles:
  //  - CONTENT, not route, drives the cue. `exerciseIndex` updates synchronously
  //    with the URL, but the displayed `exercise` is set later by the async data
  //    effect. Keying to the route param would animate the OLD exercise (then
  //    pop) on slow wifi. So we bump `slideCue` from inside that effect, AFTER
  //    the new content is committed — the slide always shows the right exercise.
  //  - Direction is DERIVED from the index delta (new vs. last displayed), so
  //    every nav path is correct by construction — including browser/iOS
  //    back-forward gestures that change the route without our handlers running.
  const lastShownIndexRef = useRef(exerciseIndex);
  const [slideCue, setSlideCue] = useState<{ key: number; dir: "fwd" | "back" }>(
    { key: exerciseIndex, dir: "fwd" }
  );

  // All auto-scrolling behavior removed for better mobile experience

  useEffect(() => {
    let isMounted = true; // Track mount state for cleanup

    async function loadExerciseData() {
      // Wait for the cached program JSON AND the shared exercise/1RM queries
      // before building the view. All three are TanStack-cached (program JSON at
      // staleTime Infinity; exercises/1RMs shared with the workout page), so on a
      // warm session they resolve instantly from cache — navigation never blocks
      // on a cold network fetch. `data` is undefined until first load.
      if (!programJson || !allExercisesData || !allOneRMsData) return;
      if (workoutNumber && exerciseIndex >= 0) {
        try {
          // Local + per-user data; the heavy reads above come from cache.
          const [oneRMData, workoutProgress, user] = await Promise.all([
            LocalStorage.getOneRM(),
            LocalStorage.getWorkoutProgress(),
            api.getCurrentUser().catch(() => null)
          ]);

          // Exercise library + 1RM map served from the shared TanStack cache.
          const allExercises = allExercisesData as any[];
          const allOneRMs = allOneRMsData as any[];

          // Check if component is still mounted before setState
          if (!isMounted) return;

          setAllExercises(allExercises); // Store all exercises for swap modal
          
          // Create a map of exercise ID to 1RM weight
          const exerciseOneRMs = new Map<number, number>();
          allOneRMs.forEach((orm: any) => {
            exerciseOneRMs.set(orm.exerciseId, orm.weight);
          });
          
          const data = programJson;
          setOneRM(oneRMData);

          // Handle new JSON structure with programs - use user's selected program
          const selectedProgramName = user?.selectedProgram || 'Powerbuilding 4x';
          setSelectedProgram(selectedProgramName);
          const workoutData = resolveProgramWorkouts(data, selectedProgramName);
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
              // Reset swap indicator for non-swapped exercises
              setSwappedFromOriginal(null);
            }
            
            const enhancedExercise = enhanceExerciseWithCalculations(
              exerciseData,
              oneRMData,
              exerciseOneRMs,
              allExercises
            );

            // Check if component is still mounted before setState
            if (!isMounted) return;

            setExercise(enhancedExercise);
            setWorkoutName(foundWorkout.workout_name);
            setTotalExercises(foundWorkout.exercises.length);
            // Cache the exercise list for synchronous, fetch-free navigation.
            navExercisesRef.current = foundWorkout.exercises;

            // Trigger the directional slide now that the NEW content is ready
            // (batched with the setState above → one render, fresh exercise +
            // new key → remount → CSS animation replays on the correct exercise).
            // Direction = sign of the index delta, so back/forward gestures and
            // Prev/Next/Complete are all correct without per-handler bookkeeping.
            // Only on an actual index change — a same-index re-run (background
            // data revalidation) must NOT replay the cue. The initial mount
            // already slides in from the default slideCue state.
            if (exerciseIndex !== lastShownIndexRef.current) {
              setSlideCue({
                key: exerciseIndex,
                dir: exerciseIndex < lastShownIndexRef.current ? "back" : "fwd",
              });
              lastShownIndexRef.current = exerciseIndex;
            }

            // Find warm-up info if this is a working set
            if (exerciseData.type_of_set === "working") {
              // Look for matching warm-up with same name immediately before this exercise
              let warmup = null;
              for (let i = exerciseIndex - 1; i >= 0; i--) {
                const prevExercise = foundWorkout.exercises[i];
                if (prevExercise.name === exerciseData.name && prevExercise.type_of_set === "warm-up") {
                  warmup = prevExercise;
                  break;
                }
                // Stop searching if we hit a different exercise name
                if (prevExercise.name !== exerciseData.name) {
                  break;
                }
              }
              setWarmupInfo(warmup);
            } else {
              setWarmupInfo(null);
            }

            // Check if exercise is already completed
            const isCompleted = currentProgress?.exerciseProgress?.[exerciseKey]?.completed || false;
            setIsExerciseCompleted(isCompleted);

            // Fetch exercise history to get most recent weight if no calculatedWeight
            let defaultWeight = enhancedExercise.calculatedWeight || 0;
            
            if (!enhancedExercise.calculatedWeight && !isCompleted) {
              try {
                // Cached via TanStack (shares the exercise-history cache key
                // with the detail view) instead of a raw fetch. retry:1 keeps
                // this non-critical default-weight lookup from holding the
                // exercise loader through the full retry:3 backoff on flaky wifi.
                const history = await queryClient.fetchQuery({
                  ...exerciseHistoryQueryOptions(enhancedExercise.name),
                  retry: 1,
                });
                if (history && history.length > 0) {
                  // Sort by date descending to get most recent
                  const sortedHistory = [...history].sort((a: any, b: any) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                  );
                  defaultWeight = sortedHistory[0].weight || 0;
                }
              } catch (error) {
                console.error('Error fetching exercise history for default weight:', error);
              }
            }
            
            // Set initial values
            setUserSets(enhancedExercise.number_of_sets);
            setUserReps(enhancedExercise.number_of_reps || 1);
            setUserWeight(defaultWeight);
            setUserNotes(""); // Clear notes for new exercises

            // If completed, load the saved values (overrides history-based default)
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
          if (isMounted) {
            setIsInitialLoading(false);
          }
        }
      }
    }

    loadExerciseData();

    // Cleanup: mark component as unmounted to prevent setState after unmount
    return () => {
      isMounted = false;
    };
  }, [workoutNumber, exerciseIndex, programJson, allExercisesData, allOneRMsData]);

  if (programError && !programJson) {
    return <ProgramDataError onRetry={() => refetchProgram()} />;
  }

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

  const handleCompleteExercise = async (e?: React.MouseEvent | React.TouchEvent) => {
    // Prevent default and stop propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Force blur on any active element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    setIsCompleting(true);

    console.log("Completing exercise:", {
      exerciseName: exercise.name,
      typeOfSet: exercise.type_of_set,
      userWeight,
      userSets,
      userReps,
      shouldSaveHistory: userWeight !== null && userWeight !== undefined && exercise.type_of_set === "working"
    });

    try {
      // Save exercise history only for working sets (not warm-ups)
      // Allow weight of 0 (for bodyweight exercises), but require a numeric value
      if (userWeight !== null && userWeight !== undefined && exercise.type_of_set === "working") {
        const historyEntry = {
          programName: selectedProgram,
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
          hasWeight: userWeight !== null && userWeight !== undefined,
          isWorkingSet: exercise.type_of_set === "working",
          typeOfSet: exercise.type_of_set
        });
        
        // Show warning if this is a working set without weight entered
        if (exercise.type_of_set === "working" && (userWeight === null || userWeight === undefined)) {
          toast({
            title: "No weight entered",
            description: "Exercise marked complete, but history was not saved because no weight was entered.",
            variant: "default",
          });
        }
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

      // Reward beat: the Complete button seats green + the check settles in,
      // then we advance to the next working set. No network fetch — the exercise
      // list is already in memory (navExercisesRef). No blocking overlay.
      const rewardMs = reducedMotion ? 0 : DURATION.reward * 1000;
      // Clear any existing timer before setting a new one (double-tap protection)
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      completeTimerRef.current = setTimeout(() => {
        completeTimerRef.current = null;
        window.scrollTo({ top: 0, behavior: 'auto' });

        // Find next working set (skip warm-ups) from the cached list.
        const allExercises = navExercisesRef.current;
        const nextIndex = skipWarmups(allExercises, exerciseIndex + 1, 1);

        setIsCompleting(false); // Clear before navigating (avoid setState on unmount)
        if (nextIndex < allExercises.length) {
          setLocation(`/workout/${workoutNumber}/exercise/${nextIndex}`);
        } else {
          setLocation(`/workout/${workoutNumber}`);
        }
      }, rewardMs);
    } catch (error) {
      console.error("Error completing exercise:", error);
      setIsCompleting(false);
    }
  };

  const handlePreviousExercise = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isCompleting) return; // don't race the completion-advance
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Find previous working set (skip warm-ups) — synchronous, from cache.
    const allExercises = navExercisesRef.current;
    const prevIndex = skipWarmups(allExercises, exerciseIndex - 1, -1);

    if (prevIndex >= 0) {
      setLocation(`/workout/${workoutNumber}/exercise/${prevIndex}`);
    } else {
      setLocation(`/workout/${workoutNumber}`);
    }
  };

  const handleNextExercise = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isCompleting) return; // don't race the completion-advance
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Find next working set (skip warm-ups) — synchronous, from cache.
    const allExercises = navExercisesRef.current;
    const nextIndex = skipWarmups(allExercises, exerciseIndex + 1, 1);

    if (nextIndex < allExercises.length) {
      setLocation(`/workout/${workoutNumber}/exercise/${nextIndex}`);
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
      {/* Modern Header - Changed from sticky to relative on mobile */}
      <header className="gradient-green text-white px-4 py-6 relative shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setLocation(`/workout/${workoutNumber}`); }}
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{workoutName || "Exercise"}</h1>
          </div>
        </div>
      </header>

      {/* Exercise identity (name / "N of M" / prescription / set-type / warm-up).
          Directional nav cue: this block slides in as a compositor-driven CSS
          transform (.exercise-slide-* in index.css) — pure translateX, run on
          WebKit's GPU compositor thread, NOT framer-motion's main-thread rAF
          (the old page-opacity fade quantized to a blink on real iOS). The outer
          div clips the horizontal slide offset with overflow-x:clip (NOT hidden —
          hidden would force overflow-y:auto, making a scroll container that clips
          the banner shadow). The keyed inner div remounts when the new content is
          ready (slideCue, bumped from the data effect) so the CSS animation
          replays on the CORRECT exercise, not the stale one. */}
      <div className="overflow-x-clip">
      <div
        key={slideCue.key}
        className={reducedMotion ? undefined : (slideCue.dir === "back" ? "exercise-slide-back" : "exercise-slide-fwd")}
      >
      {/* Exercise Header with Modern Design */}
      <div className="bg-gradient-to-b from-green-50 to-white p-6">
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
                  className="hover:bg-green-100 p-1"
                  title="View exercise details"
                >
                  <ExternalLink className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSwapModal(true)}
                  className="hover:bg-green-100 p-1"
                  title="Swap exercise"
                >
                  <Repeat className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(true)}
                  className="hover:bg-green-100 p-1"
                  title="View exercise history"
                >
                  <Clock className="h-4 w-4 text-green-600" />
                </Button>
              </>
            )}
          </h2>
          {exercise.superset_label && (
            <Badge className="bg-green-600 text-white px-3 py-1 text-sm font-bold rounded-full shadow-md">
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
          <p className="text-xs text-green-600 mt-1">
            <Repeat className="h-3 w-3 inline mr-1" />
            Swapped from: {swappedFromOriginal}
          </p>
        )}
      </div>

      {/* Set Type Banner with Modern Styling */}
      <div className={`w-full py-3 px-4 text-center font-semibold text-white shadow-md ${
        exercise.type_of_set === "working"
          ? "gradient-green-deep"
          : "bg-gradient-to-r from-amber-400 to-orange-400"
      }`}>
        <span className="uppercase tracking-wide text-sm">
          {exercise.type_of_set} set
          {exercise.superset_label && ` • Part of Superset ${exercise.superset_label}`}
        </span>
      </div>

      {/* Warm-up Reference - Collapsible, placed after exercise identity */}
      {warmupInfo && exercise?.type_of_set === "working" && (
        <div className="px-4 pt-3 pb-1">
          <button
            onClick={() => setIsWarmupExpanded(!isWarmupExpanded)}
            className="w-full flex items-center justify-between py-2 text-left group"
            type="button"
          >
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                Warm-up: {warmupInfo.number_of_sets} × {warmupInfo.number_of_reps || '—'}
                {warmupInfo.load_percentage && ` @ ${warmupInfo.load_percentage}%`}
                {warmupInfo.rpe && `, RPE ${warmupInfo.rpe}`}
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isWarmupExpanded ? 'rotate-180' : ''}`} />
          </button>
          {isWarmupExpanded && warmupInfo.notes && (
            <div className="pl-6 pb-2 pr-2">
              <p className="text-xs text-gray-500 leading-relaxed">{warmupInfo.notes}</p>
            </div>
          )}
          <div className="border-b border-gray-100 mt-1" />
        </div>
      )}
      </div>
      </div>

      {/* Exercise Navigation - Moved to top for better accessibility */}
      <div className="p-4 bg-white border-b">
        <div className="grid grid-cols-3 gap-2 mb-4">
          <motion.button
            onClick={() => { if (isCompleting) return; setLocation(`/workout/${workoutNumber}`); }}
            disabled={isCompleting}
            {...tapProps(reducedMotion)}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed nav-button-mobile"
            type="button"
          >
            Workout
          </motion.button>
          <motion.button
            onClick={handlePreviousExercise}
            onTouchEnd={(e) => e.currentTarget.blur()}
            onMouseUp={(e) => e.currentTarget.blur()}
            disabled={exerciseIndex === 0 || isCompleting}
            {...tapProps(reducedMotion)}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed nav-button-mobile"
            type="button"
          >
            Previous
          </motion.button>
          <motion.button
            onClick={handleNextExercise}
            onTouchEnd={(e) => e.currentTarget.blur()}
            onMouseUp={(e) => e.currentTarget.blur()}
            disabled={exerciseIndex >= totalExercises - 1 || isCompleting}
            {...tapProps(reducedMotion)}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed nav-button-mobile"
            type="button"
          >
            Next
          </motion.button>
        </div>

        {/* Rest Timer */}
        <RestTimerBar />

        {/* Complete — taps in firm, then "seats" green and advances */}
        <motion.button
          onClick={handleCompleteExercise}
          onTouchEnd={(e) => e.currentTarget.blur()}
          onMouseUp={(e) => e.currentTarget.blur()}
          disabled={isCompleting}
          whileTap={reducedMotion || isCompleting ? undefined : { scale: 0.97 }}
          animate={isCompleting && !reducedMotion ? { scale: [1, 1.03, 1] } : { scale: 1 }}
          transition={{ duration: DURATION.reward, ease: RACK_EASE }}
          className={`relative overflow-hidden w-full h-12 px-4 flex items-center justify-center font-medium rounded-md ${
            isCompleting || isExerciseCompleted
              ? "bg-green-600"
              : "bg-green-500 hover:bg-green-600"
          } text-white disabled:cursor-not-allowed nav-button-mobile`}
          type="button"
        >
          {/* Color sweep — a single highlight that crosses the button on commit */}
          {isCompleting && !reducedMotion && (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/2 bg-white/25 blur-md"
              initial={{ left: "-50%" }}
              animate={{ left: "120%" }}
              transition={{ duration: DURATION.reward, ease: RACK_EASE }}
            />
          )}
          <motion.span
            className="relative flex items-center justify-center"
            animate={isCompleting && !reducedMotion ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ duration: DURATION.reward, ease: RACK_EASE }}
          >
            <Check className="h-4 w-4 mr-2" />
            {isCompleting
              ? "Set logged"
              : isExerciseCompleted
                ? "Mark complete again"
                : "Complete exercise"}
          </motion.span>
        </motion.button>
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
      <Dialog
        open={showSwapModal}
        onOpenChange={(open) => {
          setShowSwapModal(open);
          if (!open) {
            setSwapSearchQuery("");
            setSelectedSwapExercise(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
          {/* Fixed header */}
          <div className="px-6 pt-6 pb-4 flex-none">
            <DialogHeader>
              <DialogTitle>Swap Exercise</DialogTitle>
              <DialogDescription>
                Select an exercise to swap with "{exercise.name}"
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable command list — custom substring filter instead of fuzzy */}
          <Command
            className="flex-1 min-h-0"
            shouldFilter={false}
          >
            <div className="flex-none">
              <CommandInput
                placeholder="Search exercises..."
                value={swapSearchQuery}
                onValueChange={setSwapSearchQuery}
              />
            </div>
            <CommandList className="overflow-y-auto px-2 flex-1">
              <CommandEmpty>No exercises found.</CommandEmpty>
              <CommandGroup>
                {(() => {
                  const query = swapSearchQuery.trim().toLowerCase();
                  // Combined filter: self-exclusion + query match in one pass
                  const filtered = allExercises.filter((e: any) => {
                    if (e.id === exerciseDbData?.id) return false;
                    if (!query) return true;
                    return e.name.toLowerCase().includes(query);
                  });

                  // Skip sort when query is empty
                  if (!query) return filtered.map((ex: any) => (
                    <CommandItem
                      key={ex.id}
                      value={ex.name}
                      onSelect={() => setSelectedSwapExercise(ex)}
                      className={selectedSwapExercise?.id === ex.id ? "bg-green-50" : ""}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          selectedSwapExercise?.id === ex.id ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      {ex.name}
                    </CommandItem>
                  ));

                  // Hoist regex creation outside sort (created once, reused ~n*log(n) times)
                  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const wordBoundaryRegex = new RegExp(`\\b${escapedQuery}`);

                  return filtered
                    .sort((a: any, b: any) => {
                      const aName = a.name.toLowerCase();
                      const bName = b.name.toLowerCase();
                      // Prefix match first
                      const aStarts = aName.startsWith(query);
                      const bStarts = bName.startsWith(query);
                      if (aStarts && !bStarts) return -1;
                      if (!aStarts && bStarts) return 1;
                      // Word-boundary match second (reuse hoisted regex)
                      const aWordStart = wordBoundaryRegex.test(aName);
                      const bWordStart = wordBoundaryRegex.test(bName);
                      if (aWordStart && !bWordStart) return -1;
                      if (!aWordStart && bWordStart) return 1;
                      return 0;
                    })
                    .map((ex: any) => (
                      <CommandItem
                        key={ex.id}
                        value={ex.name}
                        onSelect={() => setSelectedSwapExercise(ex)}
                        className={selectedSwapExercise?.id === ex.id ? "bg-green-50" : ""}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedSwapExercise?.id === ex.id ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        {ex.name}
                      </CommandItem>
                    ));
                })()}
              </CommandGroup>
            </CommandList>
          </Command>

          {/* Fixed footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t flex-none">
            <Button
              variant="outline"
              onClick={() => {
                setShowSwapModal(false);
                // Explicit cleanup: onOpenChange won't fire for external prop changes
                setSwapSearchQuery("");
                setSelectedSwapExercise(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSwapExercise}
              disabled={!selectedSwapExercise}
              className="bg-green-600 hover:bg-green-700"
            >
              Swap
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
