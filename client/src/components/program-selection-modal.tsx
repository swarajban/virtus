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
  const [selectedProgramForStart, setSelectedProgramForStart] = useState<string | null>(null);
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

  const handleConfirmStart = async () => {
    if (!selectedProgramForStart) return;
    
    setIsStarting(true);
    
    try {
      const username = localStorage.getItem('selected-username');
      if (!username) {
        throw new Error('No user selected');
      }
      
      const response = await fetch('/api/start-new-program', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': username,
        },
        body: JSON.stringify({ programName: selectedProgramForStart }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to start new program');
      }

      const result = await response.json();
      
      toast({
        title: "Success!",
        description: `Started ${selectedProgramForStart} - Cycle ${result.cycle}`,
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
                  selectedProgramForStart === program.name 
                    ? 'border-primary bg-primary/10 ring-2 ring-primary' 
                    : program.name === currentProgram 
                    ? 'border-primary bg-primary/5' 
                    : ''
                }`}
                onClick={() => setSelectedProgramForStart(program.name)}
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
                    {selectedProgramForStart === program.name ? (
                      <CheckCircle2 className="h-6 w-6 text-primary fill-primary/20" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-gray-300" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isStarting}
            data-testid="button-cancel"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmStart}
            disabled={!selectedProgramForStart || isStarting}
            data-testid="button-confirm-start"
            className="flex-1"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Program'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
