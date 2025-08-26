import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings as SettingsIcon, User } from "lucide-react";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { UserSelector } from "@/components/user-selector";

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
    setSelectedProgram(programName);
    setIsSaving(true);
    
    try {
      // Save the selected program to the user's settings
      await api.updateUserProgram(programName);
      
      toast({
        title: "Success",
        description: `Switched to ${programName}`,
      });
      
      // Clear workout progress when switching programs
      const clearProgress = window.confirm("Would you like to clear your current workout progress for the new program?");
      if (clearProgress) {
        await api.clearAllProgress();
        toast({
          title: "Progress Cleared",
          description: "Starting fresh with the new program",
        });
      }
    } catch (error) {
      console.error("Error updating program:", error);
      toast({
        title: "Error",
        description: "Failed to update program selection",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
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
      <header className="gradient-purple text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
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
                  disabled={isSaving || programs.length <= 1}
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
                  <p className="mt-2 text-xs text-gray-500">
                    Note: Currently only one program is available. More programs coming soon!
                  </p>
                </div>
              )}
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

        {/* Database Fix (Temporary) */}
        <Card className="border-orange-200">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Fix Missing Exercises</h3>
            <p className="text-sm text-gray-600 mb-3">
              Use this to fix missing "Deadlift" exercise in production database.
            </p>
            <Button
              onClick={async () => {
                try {
                  const response = await fetch('/api/fix-missing-exercises', {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      'x-username': localStorage.getItem('selected-username') || 'demo'
                    }
                  });
                  const result = await response.json();
                  if (result.success) {
                    toast({
                      title: "Success",
                      description: result.added.length > 0 
                        ? `Added missing exercises: ${result.added.join(', ')}`
                        : "No missing exercises found",
                    });
                  } else {
                    throw new Error(result.error);
                  }
                } catch (error) {
                  console.error('Error fixing exercises:', error);
                  toast({
                    title: "Error",
                    description: "Failed to fix missing exercises",
                    variant: "destructive",
                  });
                }
              }}
              variant="outline"
              className="w-full"
            >
              Fix Missing Exercises
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}