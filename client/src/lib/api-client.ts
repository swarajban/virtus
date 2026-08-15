// API client for backend communication
import { OneRM, WorkoutProgress, ExerciseHistoryEntry, User } from "@shared/schema";
import { fetchWithTimeout } from "./fetch-with-timeout";

// Get the current selected username
function getCurrentUsername(): string | null {
  return localStorage.getItem('selected-username');
}

// Set the current username
export function setCurrentUsername(username: string): void {
  localStorage.setItem('selected-username', username);
}

// Remember the selected program locally — workout/exercise pages seed their
// first paint from this key before the network user resolves. Swallows
// setItem failures (Safari private mode / quota) so callers can't crash.
export function rememberSelectedProgram(programName: string): void {
  try {
    localStorage.setItem('selected-program', programName);
  } catch {}
}

// Helper function to make API requests with username
async function apiRequest(url: string, options: RequestInit = {}) {
  const username = getCurrentUsername();
  if (!username && !url.includes('/api/users') && !url.includes('/api/health')) {
    throw new Error('No user selected');
  }
  
  const response = await fetchWithTimeout(url, {
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

  async getCurrentUser(): Promise<User> {
    return apiRequest('/api/user/current');
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

  async saveExerciseHistoryBatch(entries: ExerciseHistoryEntry[], workoutNumber?: number): Promise<void> {
    await apiRequest('/api/exercise-history/batch', {
      method: 'POST',
      body: JSON.stringify({ entries, workoutNumber }),
    });
  },

  async deleteExerciseHistoryEntry(entryId: number): Promise<void> {
    await apiRequest(`/api/exercise-history/${entryId}`, {
      method: 'DELETE',
    });
  },

  async deleteExerciseHistoryEntries(entryIds: number[]): Promise<void> {
    await apiRequest('/api/exercise-history/delete-batch', {
      method: 'POST',
      body: JSON.stringify({ entryIds }),
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
