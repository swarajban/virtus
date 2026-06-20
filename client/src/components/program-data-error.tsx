import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Shown when the shared program JSON fails to load. The query uses
 * staleTime/gcTime Infinity and won't auto-refetch, so we give the user an
 * explicit Retry rather than leaving them on an endless spinner.
 */
export function ProgramDataError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
        <div>
          <p className="font-semibold text-gray-900">Couldn't load your program</p>
          <p className="text-sm text-gray-600 mt-1">
            Check your connection and try again.
          </p>
        </div>
        <Button onClick={onRetry} className="gradient-green text-white">
          Retry
        </Button>
      </div>
    </div>
  );
}
