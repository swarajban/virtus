import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WeightInput } from "@/components/ui/weight-input";

import { ArrowLeft, Save } from "lucide-react";
import { LocalStorage } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import type { OneRM } from "@shared/schema";

export default function OneRMPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [oneRM, setOneRM] = useState<OneRM>({
    backSquat: 275,
    benchPress: 210,
    deadlift: 315,
    overheadPress: 135,
  });

  useEffect(() => {
    async function loadOneRM() {
      try {
        const savedOneRM = await LocalStorage.getOneRM();
        setOneRM(savedOneRM);
      } catch (error) {
        console.error("Error loading OneRM:", error);
      }
    }
    loadOneRM();
  }, []);

  const handleSave = async () => {
    try {
      await LocalStorage.saveOneRM(oneRM);
      toast({
        title: "Success",
        description: "1RM values have been saved successfully.",
      });
      setLocation('/');
    } catch (error) {
      console.error("Error saving OneRM:", error);
      toast({
        title: "Error",
        description: "Failed to save 1RM values. Please try again.",
        variant: "destructive",
      });
    }
  };

  const updateOneRM = (lift: keyof OneRM, value: number) => {
    setOneRM(prev => ({
      ...prev,
      [lift]: value,
    }));
  };

  const lifts = [
    { key: 'backSquat' as const, name: 'Back squat', value: oneRM.backSquat },
    { key: 'benchPress' as const, name: 'Barbell bench press', value: oneRM.benchPress },
    { key: 'deadlift' as const, name: 'Deadlift', value: oneRM.deadlift },
    { key: 'overheadPress' as const, name: 'Overhead press', value: oneRM.overheadPress },
  ];

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {/* Modern Header */}
      <header className="gradient-purple text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
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
                  onChange={(value) => updateOneRM(lift.key, value)}
                  step={5}
                  min={0}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <Button 
          onClick={handleSave}
          className="w-full gradient-purple text-white mt-6 h-14 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 font-semibold text-base"
        >
          <Save className="h-5 w-5 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
