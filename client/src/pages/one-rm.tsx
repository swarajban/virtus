import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WeightInput } from "@/components/ui/weight-input";
import { ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function OneRMPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for the four main lifts
  const [backSquat, setBackSquat] = useState(135);
  const [benchPress, setBenchPress] = useState(95);
  const [deadlift, setDeadlift] = useState(185);
  const [overheadPress, setOverheadPress] = useState(65);
  
  // Exercise IDs for the four main lifts
  const [exerciseIds, setExerciseIds] = useState<{
    backSquat?: number;
    benchPress?: number;
    deadlift?: number;
    overheadPress?: number;
  }>({});
  
  // Fetch exercises to get IDs for the main lifts
  const { data: exercises = [] } = useQuery<any[]>({
    queryKey: ["/api/exercises"],
  });
  
  // Fetch all 1RMs for the user
  const { data: allOneRMs = [] } = useQuery<any[]>({
    queryKey: ["/api/one-rm/all"],
  });
  
  // Initialize exercise IDs and 1RM values
  useEffect(() => {
    if (exercises.length > 0) {
      const ids: typeof exerciseIds = {};
      const backSquatEx = exercises.find((e: any) => e.name === "Back squat");
      const benchEx = exercises.find((e: any) => e.name === "Barbell bench press");
      const deadliftEx = exercises.find((e: any) => e.name === "Deadlift");
      const ohpEx = exercises.find((e: any) => e.name === "Overhead press");
      
      if (backSquatEx) ids.backSquat = backSquatEx.id;
      if (benchEx) ids.benchPress = benchEx.id;
      if (deadliftEx) ids.deadlift = deadliftEx.id;
      if (ohpEx) ids.overheadPress = ohpEx.id;
      
      setExerciseIds(ids);
    }
  }, [exercises]);
  
  // Load existing 1RM values
  useEffect(() => {
    if (allOneRMs.length > 0 && Object.keys(exerciseIds).length > 0) {
      allOneRMs.forEach((orm: any) => {
        if (orm.exerciseId === exerciseIds.backSquat) {
          setBackSquat(orm.weight);
        } else if (orm.exerciseId === exerciseIds.benchPress) {
          setBenchPress(orm.weight);
        } else if (orm.exerciseId === exerciseIds.deadlift) {
          setDeadlift(orm.weight);
        } else if (orm.exerciseId === exerciseIds.overheadPress) {
          setOverheadPress(orm.weight);
        }
      });
    }
  }, [allOneRMs, exerciseIds]);
  
  // Mutation to save 1RM
  const save1RMMutation = useMutation({
    mutationFn: async ({ exerciseId, weight }: { exerciseId: number; weight: number }) => {
      const response = await fetch(`/api/one-rm/exercise/${exerciseId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': localStorage.getItem('selected-username') || 'demo'
        },
        body: JSON.stringify({ weight }),
      });
      if (!response.ok) throw new Error('Failed to update 1RM');
      return response.json();
    },
  });
  
  const handleSave = async () => {
    try {
      const promises = [];
      
      if (exerciseIds.backSquat) {
        promises.push(save1RMMutation.mutateAsync({ 
          exerciseId: exerciseIds.backSquat, 
          weight: backSquat 
        }));
      }
      if (exerciseIds.benchPress) {
        promises.push(save1RMMutation.mutateAsync({ 
          exerciseId: exerciseIds.benchPress, 
          weight: benchPress 
        }));
      }
      if (exerciseIds.deadlift) {
        promises.push(save1RMMutation.mutateAsync({ 
          exerciseId: exerciseIds.deadlift, 
          weight: deadlift 
        }));
      }
      if (exerciseIds.overheadPress) {
        promises.push(save1RMMutation.mutateAsync({ 
          exerciseId: exerciseIds.overheadPress, 
          weight: overheadPress 
        }));
      }
      
      await Promise.all(promises);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["/api/one-rm/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/one-rm"] });
      
      toast({
        title: "Success",
        description: "1RM values have been saved successfully.",
      });
      setLocation('/settings');
    } catch (error) {
      console.error("Error saving 1RM:", error);
      toast({
        title: "Error",
        description: "Failed to save 1RM values. Please try again.",
        variant: "destructive",
      });
    }
  };

  const lifts = [
    { key: 'backSquat', name: 'Back squat', value: backSquat, setValue: setBackSquat },
    { key: 'benchPress', name: 'Barbell bench press', value: benchPress, setValue: setBenchPress },
    { key: 'deadlift', name: 'Deadlift', value: deadlift, setValue: setDeadlift },
    { key: 'overheadPress', name: 'Overhead press', value: overheadPress, setValue: setOverheadPress },
  ];

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {/* Modern Header */}
      <header className="gradient-green text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation('/settings')}
              className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">1RM Settings</h1>
          </div>
        </div>
      </header>

      <div className="p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">One Rep Max (1RM)</h2>
          <p className="text-sm text-gray-500">Set your current maximum lifts for accurate weight calculations</p>
        </div>
        
        <div className="space-y-4">
          {lifts.map((lift) => (
            <Card key={lift.key} className="shadow-md border-0 hover:shadow-lg transition-all duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">{lift.name}</h3>
                  <span className="text-2xl font-bold text-primary">{lift.value} lbs</span>
                </div>
                <WeightInput
                  value={lift.value}
                  onChange={(value) => lift.setValue(value)}
                  step={5}
                  min={0}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <Button 
          onClick={handleSave}
          disabled={save1RMMutation.isPending}
          className="w-full gradient-green text-white mt-6 h-14 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 font-semibold text-base"
        >
          <Save className="h-5 w-5 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}