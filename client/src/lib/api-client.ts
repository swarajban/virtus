// API client for backend communication
import { OneRM, WorkoutProgress, ExerciseHistoryEntry, User } from "@shared/schema";

// Get the current selected username
function getCurrentUsername(): string | null {
  return localStorage.getItem('selected-username');
}

// Set the current username
export function setCurrentUsername(username: string): void {
  localStorage.setItem('selected-username', username);
}

// Helper function to make API requests with username
async function apiRequest(url: string, options: RequestInit = {}) {
  const username = getCurrentUsername();
  if (!username && !url.includes('/api/users') && !url.includes('/api/health')) {
    throw new Error('No user selected');
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(username ? { 'x-username': username } : {}),
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
}

// API methods
export const api = {
  // Users
  async getUsers(): Promise<User[]> {
    return apiRequest('/api/users');
  },
  
  // One Rep Max
  async getOneRM(): Promise<OneRM> {
    return apiRequest('/api/one-rm');
  },
  
  async saveOneRM(oneRM: OneRM): Promise<void> {
    await apiRequest('/api/one-rm', {
      method: 'POST',
      body: JSON.stringify(oneRM),
    });
  },
  
  // Workout Progress
  async getWorkoutProgress(): Promise<Record<number, WorkoutProgress>> {
    return apiRequest('/api/workout-progress');
  },
  
  async saveWorkoutProgress(workoutNumber: number, progress: WorkoutProgress): Promise<void> {
    await apiRequest(`/api/workout-progress/${workoutNumber}`, {
      method: 'POST',
      body: JSON.stringify(progress),
    });
  },
  
  // Exercise History
  async getExerciseHistory(exerciseName?: string): Promise<ExerciseHistoryEntry[]> {
    const query = exerciseName ? `?exerciseName=${encodeURIComponent(exerciseName)}` : '';
    return apiRequest(`/api/exercise-history${query}`);
  },
  
  async saveExerciseHistory(history: ExerciseHistoryEntry, workoutNumber?: number): Promise<void> {
    await apiRequest('/api/exercise-history', {
      method: 'POST',
      body: JSON.stringify({ historyEntry: history, workoutNumber }),
    });
  },

  async clearWorkoutProgress(workoutNumber: number): Promise<void> {
    await apiRequest(`/api/workout-progress/${workoutNumber}`, {
      method: 'DELETE',
    });
  },

  async clearExerciseHistoryForWorkout(workoutNumber: number): Promise<void> {
    await apiRequest(`/api/exercise-history/workout/${workoutNumber}`, {
      method: 'DELETE',
    });
  },

  async updateUserProgram(programName: string): Promise<void> {
    await apiRequest('/api/user/program', {
      method: 'POST',
      body: JSON.stringify({ programName }),
    });
  },

  async clearAllProgress(): Promise<void> {
    await apiRequest('/api/progress/clear', {
      method: 'POST',
    });
  },

  async recoverProgress(workoutNumbers: number[]): Promise<any> {
    return apiRequest('/api/progress/recover', {
      method: 'POST',
      body: JSON.stringify({ workoutNumbers }),
    });
  },
};