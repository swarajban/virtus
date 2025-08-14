import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
}

export function ProgressBar({ value, max, className }: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  
  return (
    <div className={cn("w-full bg-gray-200 rounded-full h-4 shadow-inner", className)}>
      <div 
        className="progress-bar gradient-purple h-4 rounded-full transition-all duration-700 ease-out shadow-sm"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
