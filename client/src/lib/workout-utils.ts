import type { OneRM, Exercise } from "@shared/schema";
import type { ExerciseWithCalculatedWeight } from "@/types/workout";

const MAIN_LIFTS: Record<string, keyof OneRM> = {
  "Back squat": "backSquat",
  "Barbell bench press": "benchPress",
  "Deadlift": "deadlift",
  "Overhead press": "overheadPress",
};

export function calculateWeight(exercise: Exercise, oneRM: OneRM): number | undefined {
  const liftKey = MAIN_LIFTS[exercise.name];
  if (!liftKey || !exercise.load_percentage) return undefined;
  
  const calculatedWeight = (oneRM[liftKey] * exercise.load_percentage) / 100;
  // Round up to nearest 5 lbs
  return Math.ceil(calculatedWeight / 5) * 5;
}

export function enhanceExerciseWithCalculations(
  exercise: Exercise, 
  oneRM: OneRM
): ExerciseWithCalculatedWeight {
  return {
    ...exercise,
    calculatedWeight: calculateWeight(exercise, oneRM),
  };
}

export function getWorkoutStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        icon: "fas fa-check",
        className: "bg-secondary text-white",
        borderClass: "border-secondary",
      };
    case "in_progress":
      return {
        label: "In Progress",
        icon: "fas fa-clock",
        className: "bg-warning text-white",
        borderClass: "border-warning",
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
