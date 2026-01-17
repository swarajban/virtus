import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings as SettingsIcon, User, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { UserSelector } from "@/components/user-selector";
import { ProgramSelectionModal } from "@/components/program-selection-modal";

interface Program {
  name: string;
  workouts: any[];
}

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function loadSettings() {
      try {
        // Load available programs from JSON
        const response = await fetch('/powerbuilding_data.json');
        const data = await response.json();
        
        if (data.programs) {
          setPrograms(data.programs);
          // Get current user's selected program
          const username = localStorage.getItem('selected-username');
          if (username) {
            const users = await api.getUsers();
            const user = users.find(u => u.username === username);
            if (user && user.selectedProgram) {
              setSelectedProgram(user.selectedProgram);
            } else {
              setSelectedProgram(data.programs[0]?.name || "");
            }
          }
        }
      } catch (error) {
        console.error("Error loading settings:", error);
        toast({
          title: "Error",
          description: "Failed to load settings",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    loadSettings();
  }, [toast]);

  const handleProgramChange = async (programName: string) => {
    // Don't do anything if selecting the same program
    if (programName === selectedProgram) return;
    
    // Confirm before switching
    const confirmed = window.confirm(
      `Switch to "${programName}"?\n\nThis will start a fresh cycle and reset your workout progress.`
    );
    if (!confirmed) return;
    
    setIsSaving(true);
    
    try {
      const username = localStorage.getItem('selected-username');
      if (!username) {
        throw new Error('No user selected');
      }
      
      // Use start-new-program API to properly reset cycle and progress
      const response = await fetch('/api/start-new-program', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': username,
        },
        body: JSON.stringify({ programName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to switch program');
      }

      const result = await response.json();
      setSelectedProgram(programName);
      
      toast({
        title: "Success!",
        description: `Switched to ${programName} - Cycle ${result.cycle}`,
      });
      
      // Reload page to refresh all data
      window.location.reload();
    } catch (error) {
      console.error("Error switching program:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to switch program",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProgramCycleSuccess = () => {
    // Reload settings to show updated program/cycle
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {/* Header */}
      <header className="gradient-green text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          </div>
        </div>
      </header>

      {/* Settings Content */}
      <div className="p-4 space-y-4">
        {/* User Account Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UserSelector />
          </CardContent>
        </Card>

        {/* Program Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Program Selection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="program-select">Active Program</Label>
                <Select
                  value={selectedProgram}
                  onValueChange={handleProgramChange}
                  disabled={isSaving}
                >
                  <SelectTrigger id="program-select" className="mt-2">
                    <SelectValue placeholder="Select a program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.name} value={program.name}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedProgram && (
                <div className="text-sm text-gray-600">
                  <p className="font-medium mb-1">Program Details:</p>
                  <p>• {programs.find(p => p.name === selectedProgram)?.workouts.length || 0} workouts</p>
                </div>
              )}

              {/* Start New Program Button */}
              <div className="pt-2 border-t">
                <Button
                  onClick={() => setIsModalOpen(true)}
                  variant="default"
                  className="w-full"
                  data-testid="button-start-new-program"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start New Program
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  Start a fresh cycle of your current program or switch to a different one
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 1RM Settings Link */}
        <Card className="cursor-pointer hover:shadow-md transition-all duration-200"
              onClick={() => setLocation('/one-rm')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">1RM Settings</h3>
                <p className="text-sm text-gray-600 mt-1">Configure your one-rep max values</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </div>
          </CardContent>
        </Card>

        {/* Data Diagnostic Link */}
        <Card className="cursor-pointer hover:shadow-md transition-all duration-200 border-blue-200 bg-blue-50"
              onClick={() => setLocation('/data-diagnostic')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">Data Diagnostic Tool</h3>
                <p className="text-sm text-blue-700 mt-1">Check your workout and exercise data integrity</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-blue-600 rotate-180" />
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Program Selection Modal */}
      <ProgramSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleProgramCycleSuccess}
        currentProgram={selectedProgram}
      />
    </div>
  );
}