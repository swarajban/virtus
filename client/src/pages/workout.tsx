import { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Check, CheckCircle, ArrowRight, Circle, RotateCcw, Repeat, Copy } from "lucide-react";
import { LocalStorage } from "@/lib/storage";
import { api } from "@/lib/api-client";
import { getWorkoutStatusBadge, formatDate, enhanceExerciseWithCalculations, getRirSets } from "@/lib/workout-utils";
import type { WorkoutWithProgress, ExerciseWithCalculatedWeight } from "@/types/workout";
import type { User, OneRM, WorkoutProgress } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { usePowerbuildingData, resolveProgramWorkouts } from "@/hooks/use-powerbuilding-data";
import { usePageResume } from "@/hooks/use-page-resume";
import { useAllExercises, useAllOneRMs } from "@/hooks/use-exercises-data";
import { PageMotion } from "@/components/page-motion";
import { ProgramDataError } from "@/components/program-data-error";
import { setNavDirection } from "@/lib/motion";

// Import types
import { Workout } from "@shared/schema";

export default function WorkoutPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/workout/:workoutNumber");
  const { toast } = useToast();
  const [showReset, setShowReset] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [oneRM, setOneRM] = useState<OneRM | null>(null);
  // Seed SYNCHRONOUSLY from the warm in-memory cache so the correct action button
  // paints on the FIRST render when navigating back — no network-blocked flicker.
  const [workoutProgressMap, setWorkoutProgressMap] = useState<Record<number, WorkoutProgress>>(
    () => LocalStorage.getCachedWorkoutProgress()
  );
  // Whether the per-workout progress is known yet. The status-dependent action
  // buttons stay hidden behind a disabled "Loading…" placeholder until it is —
  // otherwise a render with no progress would briefly show "Start Workout" for an
  // already-in-progress workout, and tapping it would overwrite saved exercise
  // progress with {} (data loss). A WARM cache already knows every workout's
  // status (no entry = not_started), so it counts as loaded and the real button
  // paints immediately; only a genuinely COLD cache (never fetched) shows the
  // placeholder and blocks the start guard.
  const [progressLoaded, setProgressLoaded] = useState<boolean>(
    () => LocalStorage.hasCachedWorkoutProgress()
  );

  const workoutNumber = params ? parseInt(params.workoutNumber) : 0;
  // Bumped when the page comes back to life (iOS Safari freeze/resume, bfcache
  // restore, tab switch) so the data effect below refetches. A resumed page
  // otherwise keeps rendering — and writing from — a snapshot that may predate
  // a program/cycle switch made elsewhere. progressLoaded drops to false FIRST
  // so the status-dependent action buttons are hidden until the refetch lands:
  // a tap in that window would write the stale snapshot's status into the
  // CURRENT cycle. (The buttons come back via the effect's finally either way.)
  const [resumeTick, setResumeTick] = useState(0);
  usePageResume(() => {
    setProgressLoaded(false);
    setResumeTick((t) => t + 1);
  });

  // Program structure (646KB JSON) — cached app-wide, staleTime Infinity.
  const { data: programJson, isError: programError, refetch: refetchProgram } = usePowerbuildingData();
  // Exercise library + every-exercise 1RM map — shared TanStack cache (keys
  // ["/api/exercises"], ["/api/one-rm/all"]). On a warm session these resolve
  // from cache instantly, so navigating back here never blocks on a cold fetch
  // (this is the gym-wifi hang fix). They revalidate in the background.
  const { data: allExercises = [] } = useAllExercises();
  const { data: allOneRMs = [] } = useAllOneRMs();

  // Per-user, frequently-mutated data still flows through LocalStorage (which
  // wraps the API with its own fallback). Loaded WITHOUT blocking the render so
  // the page paints its structure from cached data and fills these in as they
  // arrive — never a dead blank on slow wifi.
  useEffect(() => {
    let active = true;
    // Re-seed synchronously from the cache (the page may have remounted, or the
    // workoutNumber switched, and the cache may have warmed since mount). A warm
    // cache is authoritative → progress is "loaded" and the real button stays
    // visible; only a cold cache leaves the placeholder until the fetch resolves.
    // Crucially we do NOT reset progressLoaded to false when warm — that reset was
    // the "Start Workout button gone for a bit" flicker. EXCEPTION: a resume
    // (resumeTick > 0 run) keeps the buttons hidden until the refetch settles,
    // because a warm cache from before a freeze may belong to a previous
    // program/cycle — see usePageResume above.
    setWorkoutProgressMap(LocalStorage.getCachedWorkoutProgress());
    if (resumeTick === 0) {
      setProgressLoaded(LocalStorage.hasCachedWorkoutProgress());
    }
    LocalStorage.getOneRM().then((v) => { if (active) setOneRM(v); }).catch(() => {});
    // Background revalidation (stale-while-revalidate): corrects a stale cache when
    // it returns, and flips progressLoaded → true on a cold start. Never hides the
    // button while in flight on a warm cache.
    LocalStorage.getWorkoutProgress()
      .then((v) => { if (active) setWorkoutProgressMap(v || {}); })
      .catch(() => {})
      // Only count as "loaded" once a fetch has actually succeeded. getWorkoutProgress
      // swallows network errors and resolves with {} WITHOUT warming the cache, so a
      // failed COLD fetch must NOT flip progressLoaded→true — that would un-block the
      // start guard and let a tap overwrite real server progress with {}. The fetched
      // flag (set only on a successful GET) is the authoritative signal here.
      .finally(() => { if (active) setProgressLoaded(LocalStorage.hasCachedWorkoutProgress()); });
    api.getCurrentUser().then((u) => { if (active) setCurrentUser(u); }).catch(() => {});
    return () => { active = false; };
  }, [workoutNumber, resumeTick]);

  // Prefer the authoritative user program once loaded; before that, fall back to
  // the locally-remembered program (not a hardcoded default) so users on a
  // non-default program don't flash the wrong workout/exercises on first paint.
  const selectedProgramName =
    currentUser?.selectedProgram || localStorage.getItem('selected-program') || 'Powerbuilding 4x';

  const foundWorkout = useMemo(() => {
    if (!programJson) return null;
    const workoutData = resolveProgramWorkouts(programJson, selectedProgramName);
    return workoutData.find((w: any) => w.workout_number === workoutNumber) || null;
  }, [programJson, selectedProgramName, workoutNumber]);

  const exerciseOneRMs = useMemo(() => {
    const map = new Map<number, number>();
    (allOneRMs as any[]).forEach((orm: any) => map.set(orm.exerciseId, orm.weight));
    return map;
  }, [allOneRMs]);

  const workout: WorkoutWithProgress | null = useMemo(() => {
    if (!foundWorkout) return null;
    return { ...foundWorkout, progress: workoutProgressMap[workoutNumber] };
  }, [foundWorkout, workoutProgressMap, workoutNumber]);

  // Enhance exercises with calculated weights + swapped-exercise handling.
  // Preserves ORIGINAL array index (progress is keyed by index) — the render
  // filters to working sets but keeps each exercise's originalIndex.
  const exercises: ExerciseWithCalculatedWeight[] = useMemo(() => {
    if (!foundWorkout) return [];
    return foundWorkout.exercises.map((exercise: any, index: number) => {
      const exerciseKey = `${index}`;
      const swapInfo = workoutProgressMap[workoutNumber]?.exerciseProgress?.[exerciseKey]?.swappedExercise;

      let exerciseToEnhance = exercise;
      if (swapInfo) {
        const swappedExercise = (allExercises as any[]).find((e: any) => e.id === swapInfo.exerciseId);
        if (swappedExercise) {
          exerciseToEnhance = {
            ...exercise,
            name: swappedExercise.name,
            notes: swappedExercise.notes || exercise.notes,
            id: swappedExercise.id,
            onermExerciseId: swappedExercise.onermExerciseId,
            swappedFrom: swapInfo.originalName,
          };
        }
      }

      return enhanceExerciseWithCalculations(exerciseToEnhance, oneRM ?? undefined, exerciseOneRMs, allExercises as any[]);
    });
  }, [foundWorkout, workoutProgressMap, workoutNumber, allExercises, oneRM, exerciseOneRMs]);

  if (programError && !programJson) {
    return <ProgramDataError onRetry={() => refetchProgram()} />;
  }

  // The program data is loaded but this workout number isn't in the selected
  // program's list (e.g. a stale link or a restored URL from a program with
  // more workouts). Show a way out instead of spinning forever — and never
  // let a Start/Complete write happen against an off-list number.
  if (programJson && currentUser && !foundWorkout) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-gray-900 font-semibold mb-2">Workout not found</p>
          <p className="text-gray-600 text-sm mb-4">
            Workout #{workoutNumber} isn't part of {selectedProgramName}.
          </p>
          <Button onClick={() => { setNavDirection("back"); setLocation('/'); }}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Block ONLY on a true cold load with no cached program structure yet. On a
  // warm session programJson is cached (staleTime Infinity) so `workout` is
  // ready on the first render and this loader never shows — instant from cache,
  // even while /api/exercises and /api/one-rm/all are slow/revalidating.
  if (!workout) {
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
    if (!progressLoaded) return; // don't overwrite unloaded progress with {}
    const progress = {
      programName: localStorage.getItem('selected-program') || 'Powerbuilding 4x',
      workoutNumber,
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
      exerciseProgress: workout.progress?.exerciseProgress || {}, // PRESERVE existing exercise progress
    };
    await LocalStorage.saveWorkoutProgress(workoutNumber, progress);
    // Render what was actually persisted: the accumulator may have merged in a
    // racing exercise-completion that this snapshot lacks.
    setWorkoutProgressMap((prev) => ({
      ...prev,
      [workoutNumber]: LocalStorage.getCachedWorkoutProgress()[workoutNumber] ?? progress,
    }));
  };

  const handleCompleteWorkout = async () => {
    if (!progressLoaded) return; // don't overwrite unloaded progress
    const progress = {
      programName: localStorage.getItem('selected-program') || 'Powerbuilding 4x',
      workoutNumber,
      status: "completed" as const,
      startedAt: workout.progress?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      exerciseProgress: workout.progress?.exerciseProgress || {}, // PRESERVE existing exercise progress
    };
    await LocalStorage.saveWorkoutProgress(workoutNumber, progress);
    // Render what was actually persisted (see handleStartWorkout).
    setWorkoutProgressMap((prev) => ({
      ...prev,
      [workoutNumber]: LocalStorage.getCachedWorkoutProgress()[workoutNumber] ?? progress,
    }));
  };

  const handleResetWorkout = async () => {
    try {
      // IMPORTANT: Clear exercise history FIRST (while we still have the session ID)
      // Then clear workout progress
      await LocalStorage.clearExerciseHistoryForWorkout(workoutNumber);
      await LocalStorage.clearWorkoutProgress(workoutNumber);

      // Drop this workout's progress from local state (recomputes `workout`)
      setWorkoutProgressMap((prev) => {
        const next = { ...prev };
        delete next[workoutNumber];
        return next;
      });
      console.log(`Reset workout ${workoutNumber} - cleared progress and session-specific exercise history`);
    } catch (error) {
      console.error("Error resetting workout:", error);
    }
  };

  const handleExerciseClick = (exerciseIndex: number) => {
    setNavDirection("forward");
    setLocation(`/workout/${workoutNumber}/exercise/${exerciseIndex}`);
  };

  const getExerciseStatus = (exercise: ExerciseWithCalculatedWeight, index: number) => {
    // Check if this exercise has been completed
    const exerciseKey = `${index}`;
    const isCompleted = workout?.progress?.exerciseProgress?.[exerciseKey]?.completed || false;

    if (isCompleted) return "completed";
    if (status === "in_progress") {
      // Find the first uncompleted working set (skip warm-ups) to mark as current
      const firstIncompleteIndex = exercises
        .map((ex, i) => ({ ex, originalIndex: i }))
        .filter(({ ex }) => ex.type_of_set === "working")
        .find(({ originalIndex }) => {
          const key = `${originalIndex}`;
          return !workout?.progress?.exerciseProgress?.[key]?.completed;
        })?.originalIndex;

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

  const handleExportSummary = async () => {
    if (!workout) return;

    const exerciseProgress = workout.progress?.exerciseProgress || {};
    const completedDate = workout.progress?.completedAt
      ? formatDate(workout.progress.completedAt)
      : formatDate(new Date().toISOString());

    const lines: string[] = [
      `${workout.workout_name}`,
      `Week ${workout.week_number} • Day ${workout.day_number}`,
      completedDate,
      "",
    ];

    exercises.forEach((exercise, index) => {
      const key = `${index}`;
      const progress = exerciseProgress[key];
      if (!progress?.completed) return;
      if (exercise.type_of_set !== "working") return;

      const weight = progress.weight != null ? progress.weight : exercise.calculatedWeight;
      lines.push(
        `${exercise.name}: ${progress.sets} x ${progress.reps} @ ${weight} lbs`
      );
    });

    const summaryText = lines.join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = summaryText;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast({
        title: "Copied to clipboard",
        description: "Workout summary copied!",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard. Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <PageMotion>
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {/* Modern Header — relative (not sticky): the page sits inside a
          transformed motion.div for transitions, which would break position:
          sticky. Matches the exercise page header. */}
      <header className="gradient-green text-white px-4 py-6 relative z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setNavDirection("back"); setLocation('/'); }}
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
          {!progressLoaded && (
            <Button disabled className="bg-secondary/60 text-white h-12">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Loading…
            </Button>
          )}
          {progressLoaded && status === "not_started" && (
            <Button
              onClick={handleStartWorkout}
              className="bg-secondary text-white hover:bg-green-700 h-12"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Workout
            </Button>
          )}
          {progressLoaded && status === "in_progress" && (
            <Button
              onClick={handleCompleteWorkout}
              className="bg-secondary text-white hover:bg-green-700 h-12"
            >
              <Check className="h-4 w-4 mr-2" />
              Complete Workout
            </Button>
          )}
          {progressLoaded && status === "completed" && (
            <Button
              onClick={handleExportSummary}
              className="bg-secondary text-white hover:bg-green-700 h-12"
            >
              <Copy className="h-4 w-4 mr-2" />
              Export Summary
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => { setNavDirection("back"); setLocation('/'); }}
            className="h-12"
          >
            Back to Home
          </Button>
        </div>
        {progressLoaded && (status === "in_progress" || status === "completed") && (
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

      {/* Exercise List - Show only working sets, preserve original index for progress/routing */}
      <div className="px-4 py-6">
        <h3 className="text-lg font-semibold mb-4">Exercises</h3>

        <div className="space-y-3">
          {exercises
            .map((exercise, index) => ({ exercise, originalIndex: index }))
            .filter(({ exercise }) => exercise.type_of_set === "working")
            .map(({ exercise, originalIndex }) => {
              const exerciseStatus = getExerciseStatus(exercise, originalIndex);

              return (
                <Card
                  key={originalIndex}
                  className={`press-card cursor-pointer hover:shadow-md border-l-4 ${
                    exerciseStatus === "completed" ? "border-secondary" :
                    exerciseStatus === "current" ? "border-warning" : "border-gray-200"
                  }`}
                  onClick={() => handleExerciseClick(originalIndex)}
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
                      <Badge variant="default">
                      {exercise.type_of_set}
                    </Badge>
                    <span>
                      {exercise.number_of_sets} x{" "}
                      {exercise.number_of_reps ||
                        (exercise.is_amrap ? "AMRAP" : "Hold")}
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
                    {getRirSets(exercise).map(({ setNumber, rir }) => (
                      <span key={setNumber} className="whitespace-nowrap">
                        S{setNumber}: {rir} RIR
                      </span>
                    ))}
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
    </PageMotion>
  );
}
