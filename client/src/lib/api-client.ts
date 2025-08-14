// API client for backend communication
import { OneRM, WorkoutProgress, ExerciseHistoryEntry } from "@shared/schema";

// Generate a unique device ID for this browser/device
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('device-id', deviceId);
  }
  return deviceId;
}

// Helper function to make API requests with device ID
async function apiRequest(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
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
  
  async saveExerciseHistory(history: ExerciseHistoryEntry): Promise<void> {
    await apiRequest('/api/exercise-history', {
      method: 'POST',
      body: JSON.stringify(history),
    });
  },
};