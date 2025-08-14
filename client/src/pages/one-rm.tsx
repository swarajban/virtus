import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WeightInput } from "@/components/ui/weight-input";
import { UserSelector } from "@/components/user-selector";
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
    const savedOneRM = LocalStorage.getOneRM();
    setOneRM(savedOneRM);
  }, []);

  const handleSave = () => {
    LocalStorage.saveOneRM(oneRM);
    toast({
      title: "Success",
      description: "1RM values have been saved successfully.",
    });
    setLocation('/');
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
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-blue-700 p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <div className="p-4">
        <h2 className="text-2xl font-bold mb-6">Settings</h2>
        
        {/* User Selector */}
        <div className="mb-6">
          <UserSelector />
        </div>
        
        <h3 className="text-lg font-semibold mb-4">One Rep Max (1RM)</h3>
        
        <div className="space-y-4">
          {lifts.map((lift) => (
            <Card key={lift.key}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{lift.name}</h3>
                  <span className="text-lg font-bold">{lift.value} lbs</span>
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
          className="w-full bg-primary text-white hover:bg-blue-700 mt-6 h-12"
        >
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
