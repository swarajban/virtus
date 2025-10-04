import { useEffect, useRef, useState } from "react";
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

export function ExerciseHistoryModal({ 
  isOpen, 
  onClose, 
  exerciseName 
}: ExerciseHistoryModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  useEffect(() => {
    async function loadExerciseHistory() {
      if (isOpen) {
        setIsLoading(true);
        try {
          const history = await LocalStorage.getExerciseHistory();
          const filteredHistory = history
            .filter(entry => entry.exerciseName === exerciseName)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

  useEffect(() => {
    let chartInstance: any = null;
    
    if (isOpen && exerciseHistory.length > 0 && canvasRef.current) {
      // Import Chart.js dynamically
      import('chart.js/auto').then(({ default: Chart }) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        // Clear any existing chart
        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
          existingChart.destroy();
        }

        const dates = exerciseHistory.map(entry => formatDate(entry.date));
        const weights = exerciseHistory.map(entry => entry.weight);

        chartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [{
              label: 'Weight (lbs)',
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
  }, [isOpen, exerciseHistory]);

  const handleDeleteEntry = async (entryId: number) => {
    if (!entryId || !confirm('Are you sure you want to delete this exercise record?')) {
      return;
    }
    
    setDeletingEntryId(entryId);
    try {
      await LocalStorage.deleteExerciseHistoryEntry(entryId);
      // Reload the exercise history after deletion
      const history = await LocalStorage.getExerciseHistory();
      const filteredHistory = history
        .filter(entry => entry.exerciseName === exerciseName)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setExerciseHistory(filteredHistory);
    } catch (error) {
      console.error('Failed to delete exercise history entry:', error);
      alert('Failed to delete exercise record. Please try again.');
    } finally {
      setDeletingEntryId(null);
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
        ) : exerciseHistory.length > 0 ? (
          <div className="space-y-4">
            {/* Chart Container */}
            <div className="relative w-full h-48 border rounded-lg p-2">
              <canvas 
                ref={canvasRef} 
                className="w-full h-full"
              />
            </div>
            
            {/* History List */}
            <div className="overflow-y-auto max-h-64 space-y-3 pr-2">
              {exerciseHistory.map((entry, index) => (
                <div key={entry.id || index} className="bg-gray-50 p-3 rounded-lg relative">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium">{formatDate(entry.date)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{entry.weight} lbs</span>
                      {entry.id && (
                        <button
                          onClick={() => handleDeleteEntry(entry.id!)}
                          disabled={deletingEntryId === entry.id}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Delete this record"
                          data-testid={`button-delete-history-${entry.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span>{entry.sets} x {entry.reps}</span>
                    {entry.notes && (
                      <p className="mt-1 text-xs">{entry.notes}</p>
                    )}
                  </div>
                </div>
              ))}
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
