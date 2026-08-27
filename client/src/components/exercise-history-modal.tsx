import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LocalStorage } from "@/lib/storage";
import { formatDate } from "@/lib/workout-utils";
import { Trash2 } from "lucide-react";
import type { ExerciseHistoryEntry } from "@shared/schema";

interface ExerciseHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
}

// One workout session's worth of rows for this exercise, collapsed from the N
// set-group rows that share a session_id. Legacy rows with no session_id each
// become their own single-group session (keyed by row id).
interface HistorySession {
  key: string;
  date: string;
  ids: number[];
  groups: { sets: number; reps: number; weight: number }[];
  topWeight: number;
  notes?: string;
}

function groupBySession(entries: ExerciseHistoryEntry[]): HistorySession[] {
  const map = new Map<string, ExerciseHistoryEntry[]>();
  for (const entry of entries) {
    // A missing session_id (legacy data) can't be grouped — give each such row
    // its own bucket so nothing collapses together incorrectly.
    const key = entry.sessionId ? `s:${entry.sessionId}` : `r:${entry.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }

  const sessions: HistorySession[] = [];
  for (const [key, rows] of Array.from(map.entries())) {
    // Order groups by (exercise_index, set_group) so the display matches logging
    // order (e.g. 2×1 @ 315 then 3×3 @ 275). When the same lift was logged as two
    // working blocks in one session (same session_id, different exercise_index),
    // ordering by exercise_index first keeps each block's groups together instead
    // of interleaving them (both blocks start at set_group 0).
    const ordered = [...rows].sort(
      (a, b) => ((a.exerciseIndex ?? 0) - (b.exerciseIndex ?? 0)) || ((a.setGroup ?? 0) - (b.setGroup ?? 0))
    );
    const topWeight = Math.max(0, ...ordered.map((r) => r.weight || 0));
    sessions.push({
      key,
      date: ordered[0].date,
      ids: ordered.map((r) => r.id!).filter((id) => id != null),
      groups: ordered.map((r) => ({ sets: r.sets, reps: r.reps, weight: r.weight })),
      topWeight,
      notes: ordered.find((r) => r.notes)?.notes,
    });
  }
  return sessions;
}

export function ExerciseHistoryModal({
  isOpen,
  onClose,
  exerciseName,
}: ExerciseHistoryModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingSessionKey, setDeletingSessionKey] = useState<string | null>(null);

  useEffect(() => {
    async function loadExerciseHistory() {
      if (isOpen) {
        setIsLoading(true);
        try {
          const history = await LocalStorage.getExerciseHistory(true);
          const filteredHistory = history.filter((entry) => entry.exerciseName === exerciseName);
          setExerciseHistory(filteredHistory);
        } catch (error) {
          console.error("Error loading exercise history:", error);
          setExerciseHistory([]);
        }
        setIsLoading(false);
      }
    }

    loadExerciseHistory();
  }, [isOpen, exerciseName]);

  // Collapse rows into sessions, newest-first for the list.
  const sessions = useMemo(() => {
    return groupBySession(exerciseHistory).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [exerciseHistory]);

  useEffect(() => {
    let chartInstance: any = null;

    if (isOpen && sessions.length > 0 && canvasRef.current) {
      // Import Chart.js dynamically
      import('chart.js/auto').then(({ default: Chart }) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        // Clear any existing chart
        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
          existingChart.destroy();
        }

        // One point per SESSION, plotting the TOP-SET weight (oldest→newest).
        const chartData = [...sessions].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const dates = chartData.map((s) => formatDate(s.date));
        const weights = chartData.map((s) => s.topWeight);

        chartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [{
              label: 'Top set (lbs)',
              data: weights,
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 4,
              pointBackgroundColor: 'rgb(59, 130, 246)',
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value) {
                    return value + ' lbs';
                  }
                }
              },
              x: {
                ticks: {
                  maxRotation: 45,
                  minRotation: 45
                }
              }
            },
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return context.parsed.y + ' lbs';
                  }
                }
              }
            }
          }
        });
      }).catch(error => {
        console.error('Failed to load Chart.js:', error);
      });
    }

    // Cleanup function
    return () => {
      if (chartInstance) {
        chartInstance.destroy();
      }
    };
  }, [isOpen, sessions]);

  // Delete a WHOLE session's set-groups at once so multi-group logs can't be
  // half-removed (which would orphan groups and skew the top-set chart).
  const handleDeleteSession = async (session: HistorySession) => {
    if (session.ids.length === 0) return;
    const label =
      session.groups.length > 1
        ? `all ${session.groups.length} set groups from ${formatDate(session.date)}`
        : `this exercise record`;
    if (!confirm(`Are you sure you want to delete ${label}?`)) {
      return;
    }

    setDeletingSessionKey(session.key);
    try {
      if (session.ids.length === 1) {
        await LocalStorage.deleteExerciseHistoryEntry(session.ids[0]);
      } else {
        await LocalStorage.deleteExerciseHistoryEntries(session.ids);
      }
      // Reload after deletion
      const history = await LocalStorage.getExerciseHistory(true);
      setExerciseHistory(history.filter((entry) => entry.exerciseName === exerciseName));
    } catch (error) {
      console.error('Failed to delete exercise history session:', error);
      alert('Failed to delete exercise record. Please try again.');
    } finally {
      setDeletingSessionKey(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exercise History</DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            <p>Loading exercise history...</p>
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-4">
            {/* Chart Container */}
            <div className="relative w-full h-48 border rounded-lg p-2">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
              />
            </div>

            {/* History List — one entry per session, multiple group lines */}
            <div className="overflow-y-auto max-h-64 space-y-3 pr-2">
              {sessions.map((session) => {
                const multi = session.groups.length > 1;
                return (
                  <div key={session.key} className="bg-gray-50 p-3 rounded-lg relative">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium">{formatDate(session.date)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                          {multi ? `top ${session.topWeight}` : session.topWeight} lbs
                        </span>
                        {session.ids.length > 0 && (
                          <button
                            onClick={() => handleDeleteSession(session)}
                            disabled={deletingSessionKey === session.key}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title={multi ? "Delete all set groups from this session" : "Delete this record"}
                            data-testid={`button-delete-history-${session.key}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      {session.groups.map((g, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span>
                            {g.sets} x {g.reps}
                            {multi && <span className="text-gray-400"> @ {g.weight} lbs</span>}
                          </span>
                        </div>
                      ))}
                      {session.notes && (
                        <p className="mt-1 text-xs">{session.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No history available for this exercise</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
