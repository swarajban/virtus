import { useEffect, useRef } from "react";
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

  // Get exercise history for this exercise (warm-ups are already excluded when saving)
  const exerciseHistory = LocalStorage.getExerciseHistory()
    .filter(entry => entry.exerciseName === exerciseName)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  useEffect(() => {
    if (isOpen && exerciseHistory.length > 0 && canvasRef.current) {
      // Import Chart.js dynamically
      import('chart.js/auto').then(({ default: Chart }) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        // Clear any existing chart
        Chart.getChart(ctx)?.destroy();

        const dates = exerciseHistory.map(entry => formatDate(entry.date));
        const weights = exerciseHistory.map(entry => entry.weight);

        new Chart(ctx, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [{
              label: 'Weight (lbs)',
              data: weights,
              borderColor: 'hsl(203.8863, 88.2845%, 53.1373%)',
              backgroundColor: 'hsla(203.8863, 88.2845%, 53.1373%, 0.1)',
              fill: true,
              tension: 0.4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true
              }
            },
            plugins: {
              legend: {
                display: false
              }
            }
          }
        });
      });
    }
  }, [isOpen, exerciseHistory]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exercise History</DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>
        
        {exerciseHistory.length > 0 ? (
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
