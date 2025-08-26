import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Plus, Search, Dumbbell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Exercises() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Form state for new exercise
  const [newExercise, setNewExercise] = useState({
    name: "",
    notes: "",
    youtubeLink: "",
    usesBarbell: true,
  });
  
  // Fetch exercises
  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ["/api/exercises", searchQuery],
    queryFn: async () => {
      const url = searchQuery 
        ? `/api/exercises?search=${encodeURIComponent(searchQuery)}`
        : "/api/exercises";
      const response = await fetch(url, {
        headers: { 'x-username': localStorage.getItem('selected-username') || 'demo' }
      });
      if (!response.ok) throw new Error('Failed to fetch exercises');
      return response.json();
    }
  });
  
  // Create exercise mutation
  const createMutation = useMutation({
    mutationFn: async (exercise: any) => {
      const response = await fetch("/api/exercises", {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': localStorage.getItem('selected-username') || 'demo'
        },
        body: JSON.stringify(exercise),
      });
      if (!response.ok) throw new Error('Failed to create exercise');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exercises"] });
      toast({
        title: "Success",
        description: "Exercise created successfully",
      });
      setIsAddModalOpen(false);
      setNewExercise({
        name: "",
        notes: "",
        youtubeLink: "",
        usesBarbell: true,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create exercise",
        variant: "destructive",
      });
    },
  });
  
  const handleCreateExercise = () => {
    if (!newExercise.name.trim()) {
      toast({
        title: "Error",
        description: "Exercise name is required",
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate({
      name: newExercise.name.trim(),
      notes: newExercise.notes || null,
      youtubeLink: newExercise.youtubeLink || null,
      usesBarbell: newExercise.usesBarbell,
    });
  };
  
  const handleExerciseClick = (exerciseId: number) => {
    setLocation(`/exercise/${exerciseId}`);
  };
  
  return (
    <div className="max-w-4xl mx-auto bg-white min-h-screen">
      {/* Header */}
      <header className="gradient-purple text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Exercises</h1>
          </div>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-white text-purple-600 hover:bg-gray-100">
                <Plus className="h-4 w-4 mr-2" />
                Add Exercise
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Exercise</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="name">Exercise Name *</Label>
                  <Input
                    id="name"
                    value={newExercise.name}
                    onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
                    placeholder="e.g., Romanian Deadlift"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={newExercise.notes}
                    onChange={(e) => setNewExercise({ ...newExercise, notes: e.target.value })}
                    placeholder="Form tips, cues, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="youtube">YouTube Link</Label>
                  <Input
                    id="youtube"
                    value={newExercise.youtubeLink}
                    onChange={(e) => setNewExercise({ ...newExercise, youtubeLink: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="barbell"
                    checked={newExercise.usesBarbell}
                    onCheckedChange={(checked) => 
                      setNewExercise({ ...newExercise, usesBarbell: !!checked })
                    }
                  />
                  <Label htmlFor="barbell">Uses barbell</Label>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateExercise}
                    disabled={createMutation.isPending}
                  >
                    Add Exercise
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      
      <div className="p-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        {/* Exercise List */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading exercises...</p>
          </div>
        ) : exercises.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Dumbbell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchQuery ? "No exercises found matching your search" : "No exercises added yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {exercises.map((exercise: any) => (
              <Card
                key={exercise.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleExerciseClick(exercise.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{exercise.name}</h3>
                      {exercise.notes && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {exercise.notes}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {exercise.usesBarbell && (
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            Barbell
                          </span>
                        )}
                        {exercise.youtubeLink && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                            Has video
                          </span>
                        )}
                        {exercise.onerm && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                            1RM: {exercise.onerm} lbs
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-400">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}