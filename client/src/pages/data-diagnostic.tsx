import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalStorage } from "@/lib/storage";
import { api } from "@/lib/api-client";
import { ArrowLeft, Database, CheckCircle, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function DataDiagnostic() {
  const [, setLocation] = useLocation();
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get all data from API
      const [workoutProgress, exerciseHistory] = await Promise.all([
        api.getWorkoutProgress(),
        api.getExerciseHistory()
      ]);

      // Count stats
      const stats = {
        totalWorkouts: Object.keys(workoutProgress).length,
        workoutsWithExerciseData: 0,
        totalExercisesRecorded: 0,
        exerciseHistoryEntries: exerciseHistory.length,
        workoutDetails: [] as any[]
      };

      // Analyze each workout
      Object.entries(workoutProgress).forEach(([workoutNum, progress]) => {
        const exerciseCount = Object.keys(progress.exerciseProgress || {}).length;
        if (exerciseCount > 0) {
          stats.workoutsWithExerciseData++;
          stats.totalExercisesRecorded += exerciseCount;
        }
        
        stats.workoutDetails.push({
          workoutNumber: workoutNum,
          status: progress.status,
          exerciseCount,
          exerciseProgress: progress.exerciseProgress,
          startedAt: progress.startedAt,
          completedAt: progress.completedAt
        });
      });

      setDiagnosticData(stats);
    } catch (err) {
      console.error("Diagnostic error:", err);
      setError(err instanceof Error ? err.message : "Failed to run diagnostics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/settings")}
            className="rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Data Diagnostic</h1>
        </div>
        <Button onClick={runDiagnostics} disabled={isLoading}>
          {isLoading ? "Running..." : "Refresh"}
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      {diagnosticData && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>Database Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Total Workouts</div>
                  <div className="text-2xl font-bold">{diagnosticData.totalWorkouts}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Workouts with Exercise Data</div>
                  <div className="text-2xl font-bold">{diagnosticData.workoutsWithExerciseData}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Total Exercises Recorded</div>
                  <div className="text-2xl font-bold">{diagnosticData.totalExercisesRecorded}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Exercise History Entries</div>
                  <div className="text-2xl font-bold">{diagnosticData.exerciseHistoryEntries}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Workout Info */}
          <Card>
            <CardHeader>
              <CardTitle>Workout Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {diagnosticData.workoutDetails.map((workout: any) => (
                  <div
                    key={workout.workoutNumber}
                    className="border rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Workout #{workout.workoutNumber}</span>
                      <span className={`text-sm px-2 py-1 rounded-full ${
                        workout.status === 'completed' ? 'bg-green-100 text-green-700' :
                        workout.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {workout.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div>Exercises recorded: {workout.exerciseCount}</div>
                      {workout.exerciseCount > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                            View exercise data
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                            {JSON.stringify(workout.exerciseProgress, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Running diagnostics...</p>
        </div>
      )}
    </div>
  );
}