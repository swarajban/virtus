import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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
      <DialogContent className="max-w-md max-h-96 overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Exercise History</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-600">{exerciseName}</p>
        </DialogHeader>
        
        {exerciseHistory.length > 0 ? (
          <>
            {/* Chart */}
            <div className="border-b pb-4">
              <canvas 
                ref={canvasRef} 
                width="400" 
                height="200"
                className="w-full h-48"
              />
            </div>
            
            {/* History List */}
            <div className="overflow-y-auto max-h-48 space-y-3">
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
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No history available for this exercise</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
