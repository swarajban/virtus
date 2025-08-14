import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LocalStorage } from "@/lib/storage";
import { formatDate } from "@/lib/workout-utils";
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

  useEffect(() => {
    async function loadExerciseHistory() {
      if (isOpen) {
        setIsLoading(true);
        try {
          const history = await LocalStorage.getExerciseHistory();
          const filteredHistory = history
            .filter(entry => entry.exerciseName === exerciseName)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
                beginAtZero: false,
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
                <div key={index} className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium">{formatDate(entry.date)}</span>
                    <span className="text-sm text-gray-600">{entry.weight} lbs</span>
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
