import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { getWorkoutStatusBadge, formatDate } from "@/lib/workout-utils";
import type { WorkoutWithProgress } from "@/types/workout";

interface WorkoutCardProps {
  workout: WorkoutWithProgress;
  onClick: () => void;
}

export function WorkoutCard({ workout, onClick }: WorkoutCardProps) {
  const status = workout.progress?.status || "not_started";
  const statusBadge = getWorkoutStatusBadge(status);
  
  const getStatusText = () => {
    if (status === "completed" && workout.progress?.completedAt) {
      return `Completed on ${formatDate(workout.progress.completedAt)}`;
    }
    if (status === "in_progress" && workout.progress?.startedAt) {
      const startTime = new Date(workout.progress.startedAt);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `Started ${diffMins} min ago`;
    }
    if (status === "not_started") {
      return "Upcoming";
    }
    return "Ready to start";
  };

  return (
    <Card 
      className={`workout-card bg-white shadow-md hover:shadow-xl border-0 cursor-pointer transition-all duration-300 hover:-translate-y-1 active:scale-98 overflow-hidden`}
      onClick={onClick}
    >
      <div className={`h-1 ${status === 'completed' ? 'gradient-green' : status === 'in_progress' ? 'gradient-purple' : 'bg-gray-200'}`}></div>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <Badge className={`${statusBadge.className} px-3 py-1 rounded-full text-xs font-semibold`}>
                {statusBadge.icon && <i className={`${statusBadge.icon} mr-1`} />}
                {statusBadge.label}
              </Badge>
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                Week {workout.week_number} • Day {workout.day_number}
              </span>
            </div>
            <h4 className="font-bold text-lg text-gray-900 mb-1">
              {workout.workout_name}
            </h4>
            <p className="text-sm text-gray-500">
              {getStatusText()}
            </p>
          </div>
          <div className="p-2 bg-gray-100 rounded-lg">
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </div>
        </div>
      </div>
    </Card>
  );
}
