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
      className={`workout-card p-4 shadow-sm border-l-4 ${statusBadge.borderClass} cursor-pointer transition-all duration-200 hover:shadow-md active:scale-98`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <Badge className={statusBadge.className}>
              {statusBadge.icon && <i className={`${statusBadge.icon} mr-1`} />}
              {statusBadge.label}
            </Badge>
            <span className="text-xs text-gray-500">
              Week {workout.week_number}, Day {workout.day_number}
            </span>
          </div>
          <h4 className="font-semibold text-gray-900 mb-1">
            {workout.workout_name}
          </h4>
          <p className="text-sm text-gray-600">
            {getStatusText()}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-300" />
      </div>
    </Card>
  );
}
