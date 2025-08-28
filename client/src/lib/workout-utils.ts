import type { OneRM, Exercise } from "@shared/schema";
import type { ExerciseWithCalculatedWeight } from "@/types/workout";

// Map for fallback exercises (what 1RM to use if exercise has no direct 1RM)
const FALLBACK_EXERCISES: Record<string, string> = {
  "Back squat": "Back squat",
  "Barbell bench press": "Barbell bench press",
  "Deadlift": "Deadlift",
  "Overhead press": "Overhead press",
  // Add common variations that should use main lift 1RMs
  "Front squat": "Back squat",
  "Box squat": "Back squat",
  "Pause squat": "Back squat",
  "Close grip bench press": "Barbell bench press",
  "Incline bench press": "Barbell bench press",
  "Romanian deadlift": "Deadlift",
  "Sumo deadlift": "Deadlift",
  "Push press": "Overhead press",
  "Strict press": "Overhead press",
};

// Legacy support for old OneRM format
const MAIN_LIFTS: Record<string, keyof OneRM> = {
  "Back squat": "backSquat",
  "Barbell bench press": "benchPress",
  "Deadlift": "deadlift",
  "Overhead press": "overheadPress",
};

export function calculateWeight(
  exercise: Exercise, 
  oneRM?: OneRM,
  exerciseOneRMs?: Map<number, number>,
  allExercises?: any[]
): number | undefined {
  if (!exercise.load_percentage) return undefined;
  
  let oneRMValue: number | undefined = undefined;
  
  // Priority 1: Check for direct 1RM for this exercise
  if (exerciseOneRMs && exercise.id && exerciseOneRMs.has(exercise.id)) {
    oneRMValue = exerciseOneRMs.get(exercise.id);
  }
  
  // Priority 2: Check if this exercise references another exercise's 1RM
  if (!oneRMValue && exercise.onermExerciseId && exerciseOneRMs) {
    oneRMValue = exerciseOneRMs.get(exercise.onermExerciseId);
  }
  
  // Priority 3: Check for fallback exercise 1RM (e.g., Front squat uses Back squat 1RM)
  if (!oneRMValue && FALLBACK_EXERCISES[exercise.name] && allExercises && exerciseOneRMs) {
    const fallbackExercise = allExercises.find(e => e.name === FALLBACK_EXERCISES[exercise.name]);
    if (fallbackExercise) {
      oneRMValue = exerciseOneRMs.get(fallbackExercise.id);
    }
  }
  
  // Priority 4: Fall back to old OneRM format for legacy support
  if (!oneRMValue && oneRM) {
    const liftKey = MAIN_LIFTS[exercise.name];
    if (liftKey) {
      oneRMValue = oneRM[liftKey];
    }
  }
  
  if (!oneRMValue) return undefined;
  
  const calculatedWeight = (oneRMValue * exercise.load_percentage) / 100;
  // Round up to nearest 5 lbs
  return Math.ceil(calculatedWeight / 5) * 5;
}

export function enhanceExerciseWithCalculations(
  exercise: Exercise, 
  oneRM?: OneRM,
  exerciseOneRMs?: Map<number, number>,
  allExercises?: any[]
): ExerciseWithCalculatedWeight {
  return {
    ...exercise,
    calculatedWeight: calculateWeight(exercise, oneRM, exerciseOneRMs, allExercises),
  };
}

export function getWorkoutStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        icon: "fas fa-check",
        className: "bg-green-500 text-white",
        borderClass: "border-green-500",
      };
    case "in_progress":
      return {
        label: "In Progress",
        icon: "fas fa-clock",
        className: "bg-yellow-500 text-white",
        borderClass: "border-yellow-500",
      };
    case "not_started":
      return {
        label: "Not Started",
        icon: "",
        className: "bg-gray-200 text-gray-600",
        borderClass: "border-gray-200",
      };
    default:
      return {
        label: "Next Up",
        icon: "fas fa-star",
        className: "bg-primary text-white",
        borderClass: "border-primary",
      };
  }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

export function getActualPercentage(weight: number, oneRM: number): string {
  const percentage = (weight / oneRM) * 100;
  return `${percentage.toFixed(1)}%`;
}