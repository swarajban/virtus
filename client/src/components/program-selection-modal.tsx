import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Program {
  name: string;
  workouts: any[];
}

interface ProgramSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentProgram?: string;
}

export function ProgramSelectionModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  currentProgram 
}: ProgramSelectionModalProps) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function loadPrograms() {
      if (isOpen) {
        setIsLoading(true);
        try {
          const response = await fetch('/api/programs');
          if (!response.ok) {
            throw new Error('Failed to fetch programs');
          }
          const data = await response.json();
          setPrograms(data.programs || []);
        } catch (error) {
          console.error("Error loading programs:", error);
          toast({
            title: "Error",
            description: "Failed to load available programs",
            variant: "destructive"
          });
        } finally {
          setIsLoading(false);
        }
      }
    }
    
    loadPrograms();
  }, [isOpen, toast]);

  const handleStartNewProgram = async (programName: string) => {
    setSelectedProgram(programName);
    setIsStarting(true);
    
    try {
      const response = await fetch('/api/start-new-program', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ programName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to start new program');
      }

      const result = await response.json();
      
      toast({
        title: "Success!",
        description: `Started ${programName} - Cycle ${result.cycle}`,
      });
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error starting new program:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start new program",
        variant: "destructive"
      });
    } finally {
      setIsStarting(false);
      setSelectedProgram(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start New Program</DialogTitle>
          <DialogDescription>
            Select a program to start a new cycle. Your workout history will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : programs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No programs available
            </div>
          ) : (
            programs.map((program) => (
              <Card 
                key={program.name}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                  program.name === currentProgram ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => handleStartNewProgram(program.name)}
                data-testid={`card-program-${program.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        {program.name}
                        {program.name === currentProgram && (
                          <span className="text-xs bg-primary text-white px-2 py-1 rounded-full">
                            Current
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {program.workouts.length} workouts
                      </p>
                      {program.name === currentProgram && (
                        <p className="text-xs text-primary mt-2">
                          Selecting this will start the next cycle
                        </p>
                      )}
                    </div>
                    {isStarting && selectedProgram === program.name ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isStarting}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
