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
import { ArrowLeft, Check, CheckCircle, Info, ExternalLink, Repeat, Clock, ChevronDown, X, Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { LocalStorage } from "@/lib/storage";
import { api } from "@/lib/api-client";
import { enhanceExerciseWithCalculations, getActualPercentage, getRirSets } from "@/lib/workout-utils";
import { usePowerbuildingData, resolveProgramWorkouts, skipWarmups } from "@/hooks/use-powerbuilding-data";
import { usePageResume } from "@/hooks/use-page-resume";
import { rememberSelectedProgram } from "@/lib/api-client";
import { useAllExercises, useAllOneRMs, exerciseHistoryQueryOptions } from "@/hooks/use-exercises-data";
import { useQueryClient } from "@tanstack/react-query";
import { ProgramDataError } from "@/components/program-data-error";
import { DURATION, RACK_EASE } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import type { ExerciseWithCalculatedWeight } from "@/types/workout";
import type { OneRM } from "@shared/schema";
import type { SetGroup } from "@shared/set-groups";
import { getSetGroups, getTopSetGroup } from "@shared/set-groups";
import { useToast } from "@/hooks/use-toast";

// Import types
import { Workout } from "@shared/schema";

type GroupSeedSource = "empty" | "calculated" | "history" | "saved";

export default function ExercisePage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/workout/:workoutNumber/exercise/:exerciseIndex");
  const { toast } = useToast();
  const [exercise, setExercise] = useState<ExerciseWithCalculatedWeight | null>(null);
  const [workoutName, setWorkoutName] = useState<string>("");
  // Seeded SYNCHRONOUSLY from the locally-remembered program (same key the
  // workout page uses) so the page renders the right program's exercise on the
  // first paint without waiting on the network user. The background
  // getCurrentUser below corrects this if the server's selectedProgram differs.
  const [selectedProgram, setSelectedProgram] = useState<string>(
    () => localStorage.getItem('selected-program') || 'Powerbuilding 4x'
  );
  // One or more logged set-groups (e.g. 2x1 @ 315, then 3x3 @ 275). Default is a
  // single group, seeded from the prescription + calculatedWeight, so the common
  // case is unchanged. Kept as the source of truth for the input list below.
  const [groups, setGroups] = useState<SetGroup[]>([{ sets: 1, reps: 1, weight: 0 }]);
  const [userNotes, setUserNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [oneRM, setOneRM] = useState<OneRM | null>(() => LocalStorage.getCachedOneRM());
  // "Exercise N of M" counts WORKING exercises only (warm-ups are skipped during
  // nav and must not inflate the count). totalExercises = M (working total);
  // currentWorkingNumber = N (1-based rank of the current exercise among working).
  const [totalExercises, setTotalExercises] = useState(0);
  const [currentWorkingNumber, setCurrentWorkingNumber] = useState(0);
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
  const [showRirHint, setShowRirHint] = useState(false);
  const [workoutProgressData, setWorkoutProgressData] = useState<Record<number, any>>({});

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
  const inputSeedKeyRef = useRef<string | null>(null);
  const groupsDirtyRef = useRef(false);
  const notesDirtyRef = useRef(false);
  const groupSeedSourceRef = useRef<GroupSeedSource>("empty");
  const reducedMotion = useReducedMotion() ?? false;

  const workoutNumber = parseInt(params?.workoutNumber ?? '0', 10);
  const exerciseIndex = parseInt(params?.exerciseIndex ?? '0', 10);

  // Clear any pending completion-advance timer if the page unmounts mid-reward,
  // so it can't setState or navigate after the component is gone.
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  // All auto-scrolling behavior removed for better mobile experience

  useEffect(() => {
    if (!programJson) return;

    const seedKey = `${selectedProgram}:${workoutNumber}:${exerciseIndex}`;
    const isNewExercise = inputSeedKeyRef.current !== seedKey;

    if (isNewExercise) {
      inputSeedKeyRef.current = seedKey;
      groupsDirtyRef.current = false;
      notesDirtyRef.current = false;
      groupSeedSourceRef.current = "empty";
      setShowRirHint(false);
      setIsWarmupExpanded(false);
    }

    if (!workoutNumber || exerciseIndex < 0) {
      setExercise(null);
      setIsInitialLoading(false);
      return;
    }

    try {
      const workoutData = resolveProgramWorkouts(programJson, selectedProgram);
      const foundWorkout = workoutData.find((w: any) => w.workout_number === workoutNumber);

      if (!foundWorkout || !foundWorkout.exercises[exerciseIndex]) {
        setExercise(null);
        setIsInitialLoading(false);
        return;
      }

      const exerciseKey = `${exerciseIndex}`;
      const cachedProgress = LocalStorage.getCachedWorkoutProgress();
      const progressMap =
        Object.keys(workoutProgressData).length > 0 ? workoutProgressData : cachedProgress;
      const currentProgress = progressMap[workoutNumber] ?? cachedProgress[workoutNumber];
      const savedProgress = currentProgress?.exerciseProgress?.[exerciseKey];
      const allExercises = Array.isArray(allExercisesData) ? (allExercisesData as any[]) : [];
      const allOneRMs = Array.isArray(allOneRMsData) ? (allOneRMsData as any[]) : [];

      setAllExercises(allExercises);

      const exerciseOneRMs = new Map<number, number>();
      allOneRMs.forEach((orm: any) => {
        exerciseOneRMs.set(orm.exerciseId, orm.weight);
      });

      let exerciseData = { ...foundWorkout.exercises[exerciseIndex] };
      const originalExerciseName = exerciseData.name;
      const swapInfo = savedProgress?.swappedExercise;
      let nextExerciseDbData: any = null;
      let nextSwappedFromOriginal: string | null = null;

      if (swapInfo) {
        const swappedExercise = allExercises.find((e: any) => e.id === swapInfo.exerciseId);
        exerciseData = {
          ...exerciseData,
          name: swappedExercise?.name ?? swapInfo.name ?? exerciseData.name,
          notes: swappedExercise?.notes || exerciseData.notes,
          id: swappedExercise?.id ?? swapInfo.exerciseId,
          onermExerciseId: swappedExercise?.onermExerciseId ?? exerciseData.onermExerciseId,
        };
        nextExerciseDbData =
          swappedExercise ??
          (swapInfo.exerciseId ? { id: swapInfo.exerciseId, name: exerciseData.name } : null);
        nextSwappedFromOriginal = swapInfo.originalName || originalExerciseName;
      } else {
        const dbExercise = allExercises.find((e: any) => e.name === exerciseData.name);
        if (dbExercise) {
          nextExerciseDbData = dbExercise;
          exerciseData = {
            ...exerciseData,
            id: dbExercise.id,
            onermExerciseId: dbExercise.onermExerciseId,
          };
        }
      }

      const enhancedExercise = enhanceExerciseWithCalculations(
        exerciseData,
        oneRM ?? undefined,
        exerciseOneRMs,
        allExercises
      );

      setExerciseDbData(nextExerciseDbData);
      setSwappedFromOriginal(nextSwappedFromOriginal);
      setExercise(enhancedExercise);
      setWorkoutName(foundWorkout.workout_name);

      const allEx = foundWorkout.exercises;
      const isWorking = (e: any) => e.type_of_set !== "warm-up";
      const workingTotal = allEx.filter(isWorking).length;
      const workingUpToHere = allEx.slice(0, exerciseIndex + 1).filter(isWorking).length;
      setTotalExercises(workingTotal);
      setCurrentWorkingNumber(
        isWorking(allEx[exerciseIndex])
          ? workingUpToHere
          : Math.min(workingUpToHere + 1, workingTotal)
      );
      navExercisesRef.current = foundWorkout.exercises;

      if (exerciseData.type_of_set === "working") {
        let warmup = null;
        for (let i = exerciseIndex - 1; i >= 0; i--) {
          const prevExercise = foundWorkout.exercises[i];
          if (prevExercise.name === exerciseData.name && prevExercise.type_of_set === "warm-up") {
            warmup = prevExercise;
            break;
          }
          if (prevExercise.name !== exerciseData.name) break;
        }
        setWarmupInfo(warmup);
      } else {
        setWarmupInfo(null);
      }

      const isCompleted = savedProgress?.completed || false;
      setIsExerciseCompleted(isCompleted);

      // Seed set-groups synchronously from the program/progress snapshot before
      // any network work. Secondary data may arrive later, but only untouched
      // auto-seeded inputs are updated.
      if (isNewExercise) {
        if (isCompleted && savedProgress) {
          groupSeedSourceRef.current = "saved";
          setGroups(getSetGroups(savedProgress));
          setUserNotes(savedProgress.notes || "");
        } else {
          groupSeedSourceRef.current = enhancedExercise.calculatedWeight ? "calculated" : "empty";
          setGroups([{
            sets: enhancedExercise.number_of_sets,
            reps: enhancedExercise.number_of_reps || 1,
            weight: enhancedExercise.calculatedWeight || 0,
          }]);
          setUserNotes("");
        }
      } else if (isCompleted && savedProgress) {
        if (!groupsDirtyRef.current) {
          groupSeedSourceRef.current = "saved";
          setGroups(getSetGroups(savedProgress));
        }
        if (!notesDirtyRef.current) {
          setUserNotes(savedProgress.notes || "");
        }
      } else if (
        enhancedExercise.calculatedWeight &&
        !groupsDirtyRef.current &&
        groupSeedSourceRef.current !== "saved"
      ) {
        setGroups((gs) => {
          if (gs.length !== 1) return gs;
          groupSeedSourceRef.current = "calculated";
          return [{
            ...gs[0],
            sets: enhancedExercise.number_of_sets,
            reps: enhancedExercise.number_of_reps || 1,
            weight: enhancedExercise.calculatedWeight || 0,
          }];
        });
      }

      setIsInitialLoading(false);
    } catch (error) {
      console.error('Error loading exercise data:', error);
      setIsInitialLoading(false);
    }
  }, [
    workoutNumber,
    exerciseIndex,
    programJson,
    allExercisesData,
    allOneRMsData,
    oneRM,
    selectedProgram,
    workoutProgressData,
  ]);

  useEffect(() => {
    if (!programJson || !workoutNumber) return;

    let active = true;
    const cachedProgress = LocalStorage.getCachedWorkoutProgress();
    if (Object.keys(cachedProgress).length > 0) {
      setWorkoutProgressData(cachedProgress);
    }

    LocalStorage.getOneRMPreferCache()
      .then(() => {
        if (!active) return;
        const cachedOneRM = LocalStorage.getCachedOneRM();
        if (cachedOneRM) setOneRM(cachedOneRM);
      })
      .catch(() => {});

    LocalStorage.getWorkoutProgressPreferCache()
      .then((workoutProgress) => {
        if (active) setWorkoutProgressData(workoutProgress);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [programJson, workoutNumber, exerciseIndex, selectedProgram]);

  useEffect(() => {
    if (!exercise || exercise.calculatedWeight || isExerciseCompleted) return;

    let active = true;
    const seedKey = inputSeedKeyRef.current;

    queryClient.fetchQuery({
      ...exerciseHistoryQueryOptions(exercise.name),
      retry: 1,
    }).then((history) => {
      if (!active || inputSeedKeyRef.current !== seedKey || !history?.length) return;
      const sortedHistory = [...history].sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const latest = sortedHistory[0];
      const latestSessionRows = sortedHistory.filter((h: any) =>
        latest.sessionId != null ? h.sessionId === latest.sessionId : h === latest
      );
      const historyWeight = Math.max(
        0,
        ...latestSessionRows.map((h: any) => h.weight || 0)
      );
      if (historyWeight <= 0) return;

      setGroups((gs) => {
        if (
          groupsDirtyRef.current ||
          groupSeedSourceRef.current === "saved" ||
          groupSeedSourceRef.current === "calculated" ||
          gs.length !== 1
        ) {
          return gs;
        }
        groupSeedSourceRef.current = "history";
        return [{ ...gs[0], weight: historyWeight }];
      });
    }).catch((error) => {
      console.error('Error fetching exercise history for default weight:', error);
    });

    return () => {
      active = false;
    };
  }, [
    queryClient,
    exercise?.name,
    exercise?.calculatedWeight,
    isExerciseCompleted,
    workoutNumber,
    exerciseIndex,
  ]);

  // Fetch the authoritative user program in the BACKGROUND — never on the render
  // path. If the server's selectedProgram differs from what we rendered with
  // (the local fallback), persist it and update state, which re-resolves the
  // exercise for the correct program. A hung or failed request changes nothing,
  // so it can never hold up the "Loading exercise..." spinner. The functional
  // update returns the same reference when unchanged, so an agreeing server
  // response triggers no re-render and no input-clobbering re-resolve.
  useEffect(() => {
    let active = true;
    api.getCurrentUser()
      .then((user) => {
        if (!active || !user?.selectedProgram) return;
        // Correct the program first; persist second. If setItem throws (Safari
        // private mode / quota), the in-memory correction still lands.
        setSelectedProgram((prev) => (prev === user.selectedProgram ? prev : user.selectedProgram));
        rememberSelectedProgram(user.selectedProgram);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Revalidate when the page comes back to life (iOS Safari freeze/resume,
  // bfcache restore). A frozen exercise page can outlive a program/cycle
  // switch made elsewhere; without this, completing an exercise would POST the
  // old snapshot and the server would file it under the CURRENT cycle (the
  // same stale-resume class as the workout-25 incident). Deliberately narrow:
  // - correct selectedProgram (triggers a data reload ONLY if it actually
  //   changed — a normal tab flip never clobbers half-entered sets/reps/weight);
  // - refresh the shared progress accumulator so a later completion merges
  //   against the current cycle's map, not the pre-freeze one (in-flight saves
  //   are protected by the pending-saves guard in storage.ts).
  usePageResume(() => {
    api.getCurrentUser()
      .then((user) => {
        if (!user?.selectedProgram) return;
        setSelectedProgram((prev) => (prev === user.selectedProgram ? prev : user.selectedProgram));
        rememberSelectedProgram(user.selectedProgram);
      })
      .catch(() => {});
    LocalStorage.getWorkoutProgress()
      .then((progress) => setWorkoutProgressData(progress))
      .catch(() => {});
  });

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

    // Synchronous re-entrancy guard: a completion+reward-beat is already running.
    // (disabled={isCompleting} relies on a React re-render, which doesn't stop a
    // rapid second tap in the same tick; the ref does.)
    if (completeTimerRef.current) return;

    haptic(12); // firm tick on the highest-value action

    // Force blur on any active element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setIsCompleting(true);

    // Snapshot the logged values at click time — the user advances immediately,
    // so the background writes below must not read state that may have changed.
    const wn = workoutNumber;
    const exerciseKey = `${exerciseIndex}`;
    const isWorkingSet = exercise.type_of_set === "working";
    // Normalize the group snapshot; the TOP SET (heaviest, tie-break first) is
    // mirrored into the top-level sets/reps/weight so any read site that misses
    // the groups array still degrades gracefully to the heaviest group.
    const cleanGroups: SetGroup[] = groups.map((g) => ({
      sets: g.sets,
      reps: g.reps,
      weight: g.weight,
    }));
    const topSet = getTopSetGroup(cleanGroups);
    const completion = {
      sets: topSet.sets,
      reps: topSet.reps,
      weight: topSet.weight ?? undefined,
      groups: cleanGroups,
      notes: userNotes,
      completed: true,
    };
    // One history row per group that has a weight — set_group preserves order.
    // The whole array is written in ONE atomic batch below.
    const historyEntries = isWorkingSet
      ? cleanGroups
          .map((g, idx) => ({ g, idx }))
          .filter(({ g }) => g.weight !== null && g.weight !== undefined)
          .map(({ g, idx }) => ({
            programName: selectedProgram,
            date: new Date().toISOString(),
            exerciseName: exercise.name,
            sets: g.sets,
            reps: g.reps,
            weight: g.weight as number,
            setGroup: idx,
            // Scopes re-complete dedup to THIS workout slot, so completing a
            // second block of the same lift can't wipe the first block's rows.
            exerciseIndex,
            notes: userNotes,
            typeOfSet: exercise.type_of_set as "warm-up" | "working",
          }))
      : [];

    // Working set with no weight on any group: still mark complete, but warn
    // that no history was logged (unchanged behavior).
    if (isWorkingSet && historyEntries.length === 0) {
      toast({
        title: "No weight entered",
        description: "Exercise marked complete, but history was not saved because no weight was entered.",
        variant: "default",
      });
    }

    // Run a write in the BACKGROUND with retry + backoff. On the first failure we
    // warn the user (non-blocking) so a logged set is never silently dropped; if a
    // retry recovers we confirm; if every attempt fails we say so. `toast` is a
    // module-level store, so these fire correctly even after we've navigated away.
    const persistWithRetry = async (fn: () => Promise<void>, label: string, attempts = 3) => {
      let warned = false;
      for (let i = 0; i <= attempts; i++) {
        try {
          await fn();
          if (warned) {
            toast({ title: "Saved", description: `Your ${label} was saved.`, variant: "default" });
          }
          return;
        } catch (err) {
          if (i === 0) {
            warned = true;
            toast({
              title: "Couldn't save — retrying…",
              description: `Your ${label} will be saved when the connection recovers.`,
              variant: "destructive",
            });
          }
          if (i === attempts) {
            console.error(`Failed to persist ${label} after ${attempts + 1} attempts:`, err);
            toast({
              title: "Save failed",
              description: `Couldn't save your ${label}. Check your connection and reopen this exercise.`,
              variant: "destructive",
            });
            return;
          }
          await new Promise((r) => setTimeout(r, 800 * 2 ** i)); // 0.8s → 1.6s → 3.2s
        }
      }
    };

    // Fire-and-forget the writes — navigation below NEVER awaits them. The whole
    // group array goes in ONE batch call wrapped in ONE persistWithRetry, so a
    // retry can never leave a partial subset of groups saved (all-or-nothing).
    if (historyEntries.length > 0) {
      void persistWithRetry(() => LocalStorage.saveExerciseHistoryBatch(historyEntries, wn), "set");
    }

    // Progress is a read-modify-write: the server overwrites exerciseProgress
    // wholesale, so we must send the FULL map. We read current progress from the
    // warm in-memory cache (synchronous — no network on the hot path). Only if the
    // cache is cold do we fetch authoritative state, and even that runs in the
    // background; a failed cold-cache GET throws and is caught by the retry loop,
    // so we NEVER POST a partial map that would wipe other completions.
    void persistWithRetry(async () => {
      let base = LocalStorage.getCachedWorkoutProgress()[wn];
      if (!base) {
        base = (await api.getWorkoutProgress())[wn];
      }
      const current = base || {
        workoutNumber: wn,
        status: "in_progress" as const,
        startedAt: new Date().toISOString(),
        exerciseProgress: {},
      };
      const existingExerciseData = current.exerciseProgress?.[exerciseKey] || {};
      // Auto-start the workout on completion: a "not_started" (or missing) status
      // flips to "in_progress" so the user never has to hit "Start Workout" first.
      // Never DOWNGRADE an already in_progress/completed workout, and never reset an
      // existing startedAt.
      const alreadyStarted = current.status === "in_progress" || current.status === "completed";
      const merged = {
        ...current,
        status: alreadyStarted ? current.status : ("in_progress" as const),
        startedAt: current.startedAt || new Date().toISOString(),
        exerciseProgress: {
          ...current.exerciseProgress,
          [exerciseKey]: { ...existingExerciseData, ...completion }, // preserve swap data
        },
      };
      await LocalStorage.saveWorkoutProgress(wn, merged);
    }, "progress");

    // Reward beat: the Complete button seats green + the check settles in, THEN
    // we advance to the next working set — independent of the background writes.
    // The exercise list is already in memory (navExercisesRef); advancing needs no
    // server round-trip, so a stalled write can't hang the button.
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
  };

  // --- Set-group editing ---------------------------------------------------
  const updateGroup = (index: number, patch: Partial<SetGroup>) => {
    groupsDirtyRef.current = true;
    setGroups((gs) => gs.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  };

  // "+ Add set group" copies the previous group's weight (and sets/reps as
  // sensible defaults) so logging a second group is one tap from a good start.
  const addGroup = () => {
    haptic(8);
    groupsDirtyRef.current = true;
    setGroups((gs) => {
      const prev = gs[gs.length - 1] ?? { sets: 1, reps: 1, weight: 0 };
      return [...gs, { sets: prev.sets, reps: prev.reps, weight: prev.weight }];
    });
  };

  const removeGroup = (index: number) => {
    haptic(8);
    groupsDirtyRef.current = true;
    setGroups((gs) => (gs.length > 1 ? gs.filter((_, i) => i !== index) : gs));
  };

  // Readouts (Actual %, plate calculator) reflect the TOP SET so the page stays
  // quiet regardless of how many groups are logged.
  const topSetWeight = getTopSetGroup(groups).weight ?? 0;

  const handlePreviousExercise = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isCompleting) return; // don't race the completion-advance
    haptic(8); // light tick on Previous
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
    haptic(8); // light tick on Next
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

  const rirSets = getRirSets(exercise);

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
          Renders instantly on Next/Prev — no slide cue (removed by request). */}
      <div className="bg-gradient-to-b from-green-50 to-white p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600 font-medium uppercase tracking-wide">
            Exercise {currentWorkingNumber} of {totalExercises}
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
          {exercise.number_of_sets} x{" "}
          {exercise.number_of_reps ||
            (exercise.is_amrap ? "AMRAP" : "Hold")}
          {exercise.load_percentage && ` @ ${exercise.load_percentage}% 1RM`}
          {exercise.rpe && ` (RPE ${exercise.rpe})`}
        </p>
        {rirSets.length > 0 && (
          <>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {rirSets.map(({ setNumber, rir }) => (
                <Badge
                  key={setNumber}
                  className="bg-green-100 text-green-800 hover:bg-green-100 border-transparent px-2.5 py-0.5 text-xs font-semibold rounded-full"
                >
                  Set {setNumber}: {rir} RIR
                </Badge>
              ))}
              <button
                type="button"
                onClick={() => setShowRirHint((v) => !v)}
                className="p-2 -my-1.5 text-green-700 rounded-full active:bg-green-200/70 transition-colors"
                aria-label="What is RIR?"
                aria-expanded={showRirHint}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            {showRirHint && (
              <p className="mt-1 text-xs text-gray-500">
                RIR = reps in reserve: stop that many reps shy of failure (0 = go
                to failure).
              </p>
            )}
          </>
        )}
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

      {/* Exercise Navigation - Moved to top for better accessibility */}
      <div className="p-4 bg-white border-b">
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={() => { if (isCompleting) return; setLocation(`/workout/${workoutNumber}`); }}
            disabled={isCompleting}
            className="press px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed nav-button-mobile"
            type="button"
          >
            Workout
          </button>
          <button
            onClick={handlePreviousExercise}
            onTouchEnd={(e) => e.currentTarget.blur()}
            onMouseUp={(e) => e.currentTarget.blur()}
            disabled={exerciseIndex === 0 || isCompleting}
            className="press px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed nav-button-mobile"
            type="button"
          >
            Previous
          </button>
          <button
            onClick={handleNextExercise}
            onTouchEnd={(e) => e.currentTarget.blur()}
            onMouseUp={(e) => e.currentTarget.blur()}
            // Disabled when there is no further WORKING exercise after this one.
            // Uses the same skipWarmups walk as nav (robust to trailing warm-ups);
            // a totalExercises-based check would be wrong since exerciseIndex is a
            // raw array index but totalExercises counts working sets only.
            disabled={skipWarmups(navExercisesRef.current, exerciseIndex + 1, 1) >= navExercisesRef.current.length || isCompleting}
            className="press px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed nav-button-mobile"
            type="button"
          >
            Next
          </button>
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
        {/* Set groups — one row per (sets × reps @ weight). A single group is
            the default and reads like the old Sets/Reps + Weight inputs; headers
            and the remove control only appear once there is more than one group. */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Sets, reps, &amp; weight</h3>
              {groups.length > 1 && (
                <span className="text-xs font-medium text-gray-400">
                  {groups.length} groups
                </span>
              )}
            </div>

            <div className="space-y-3">
              {groups.map((group, i) => {
                const multi = groups.length > 1;
                return (
                  <div
                    key={i}
                    className={multi ? "rounded-xl border border-gray-200 p-3" : ""}
                  >
                    {multi && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                            {i + 1}
                          </span>
                          Set group
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGroup(i)}
                          className="h-11 w-11 -my-1.5 -mr-2 flex items-center justify-center text-gray-400 rounded-full active:bg-red-50 active:text-red-600 transition-colors"
                          aria-label={`Remove set group ${i + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                          Sets
                        </label>
                        <WeightInput
                          value={group.sets}
                          onChange={(v) => updateGroup(i, { sets: v })}
                          step={1}
                          min={1}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                          Reps
                        </label>
                        <WeightInput
                          value={group.reps}
                          onChange={(v) => updateGroup(i, { reps: v })}
                          step={1}
                          min={1}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Weight (lbs)
                      </label>
                      <WeightInput
                        value={group.weight ?? 0}
                        onChange={(v) => updateGroup(i, { weight: v })}
                        step={5}
                        min={0}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addGroup}
              className="mt-3 w-full h-11 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-green-700 active:bg-green-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add set group
            </button>

            {/* Top-set readouts — kept once, quiet, regardless of group count. */}
            {exerciseOneRM > 0 && topSetWeight > 0 && (
              <div className="mt-3 text-center">
                <span className="text-sm text-gray-600">
                  Actual: {getActualPercentage(topSetWeight, exerciseOneRM)} of 1RM
                  {groups.length > 1 && " (top set)"}
                </span>
              </div>
            )}
            {topSetWeight > 0 && exerciseDbData?.usesBarbell && (
              <PlateCalculator weight={topSetWeight} />
            )}
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
              onChange={(e) => {
                notesDirtyRef.current = true;
                setUserNotes(e.target.value);
              }}
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
