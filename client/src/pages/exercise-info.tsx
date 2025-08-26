import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Youtube, Save } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { LocalStorage } from "@/lib/storage";
import { ExerciseHistoryModal } from "@/components/exercise-history-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ExerciseInfo() {
  const [, params] = useRoute("/exercise/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const exerciseId = params?.id ? parseInt(params.id) : 0;
  
  // Form state
  const [notes, setNotes] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [onerm, setOnerm] = useState("");
  const [onermExerciseId, setOnermExerciseId] = useState<string>("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Fetch exercise data
  const { data: exercise, isLoading } = useQuery({
    queryKey: [`/api/exercises/${exerciseId}`],
    enabled: !!exerciseId,
  });
  
  // Fetch exercise history
  const { data: exerciseHistory = [] } = useQuery({
    queryKey: ["/api/exercise-history", { exerciseName: exercise?.name }],
    enabled: !!exercise?.name,
    queryFn: async () => {
      const response = await fetch(`/api/exercise-history?exerciseName=${exercise?.name}`, {
        headers: { 'x-username': localStorage.getItem('selected-username') || 'demo' }
      });
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    }
  });
  
  // Fetch all exercises for 1RM selector
  const { data: allExercises = [] } = useQuery({
    queryKey: ["/api/exercises"],
  });
  
  // Initialize form with exercise data
  useEffect(() => {
    if (exercise) {
      setNotes(exercise.notes || "");
      setYoutubeLink(exercise.youtubeLink || "");
      setOnerm(exercise.onerm?.toString() || "");
      setOnermExerciseId(exercise.onermExerciseId?.toString() || "");
    }
  }, [exercise]);
  
  // Update exercise mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await fetch(`/api/exercises/${exerciseId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': localStorage.getItem('selected-username') || 'demo'
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update exercise');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/exercises/${exerciseId}`] });
      toast({
        title: "Success",
        description: "Exercise updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update exercise",
        variant: "destructive",
      });
    },
  });
  
  const handleSave = () => {
    const updates = {
      notes,
      youtubeLink: youtubeLink || null,
      onerm: onerm ? parseFloat(onerm) : null,
      onermExerciseId: onermExerciseId ? parseInt(onermExerciseId) : null,
    };
    updateMutation.mutate(updates);
  };
  
  // Extract video ID from YouTube URL
  const getYouTubeVideoId = (url: string) => {
    if (!url) return null;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };
  
  const videoId = getYouTubeVideoId(youtubeLink);
  
  if (isLoading || !exercise) {
    return (
      <div className="max-w-4xl mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exercise...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto bg-white min-h-screen">
      {/* Header */}
      <header className="gradient-purple text-white px-4 py-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/exercises")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">{exercise.name}</h1>
          </div>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-white text-purple-600 hover:bg-gray-100"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </header>
      
      <div className="p-6 space-y-6">
        {/* Exercise History Card */}
        <Card>
          <CardHeader>
            <CardTitle>Exercise History</CardTitle>
          </CardHeader>
          <CardContent>
            {exerciseHistory.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Total sessions: {exerciseHistory.length}
                </p>
                <p className="text-sm text-gray-600">
                  Last performed: {new Date(exerciseHistory[0].date).toLocaleDateString()}
                </p>
                <Button 
                  onClick={() => setIsHistoryOpen(true)}
                  variant="outline"
                  className="w-full"
                >
                  View Full History
                </Button>
              </div>
            ) : (
              <p className="text-gray-500">No history recorded yet</p>
            )}
          </CardContent>
        </Card>
        
        {/* Notes Card */}
        <Card>
          <CardHeader>
            <CardTitle>Exercise Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about form, technique, or personal preferences..."
              rows={4}
              className="w-full"
            />
          </CardContent>
        </Card>
        
        {/* YouTube Video Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5" />
              Video Tutorial
            </CardTitle>
          </CardHeader>
          <CardContent>
            {videoId && (
              <div className="mb-4 aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="Exercise video"
                  className="w-full h-full rounded-lg"
                  allowFullScreen
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>YouTube Link</Label>
              <Input
                value={youtubeLink}
                onChange={(e) => setYoutubeLink(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                type="url"
              />
            </div>
          </CardContent>
        </Card>
        
        {/* 1RM Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>1RM Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Custom 1RM Value</Label>
              <Input
                type="number"
                value={onerm}
                onChange={(e) => setOnerm(e.target.value)}
                placeholder="Enter weight in lbs"
                step="5"
              />
              <p className="text-sm text-gray-500 mt-1">
                Override calculated weights with a custom 1RM value
              </p>
            </div>
            
            <div>
              <Label>Use 1RM from Exercise</Label>
              <Select
                value={onermExerciseId}
                onValueChange={setOnermExerciseId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select exercise for 1RM calculation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None (use default)</SelectItem>
                  {allExercises
                    .filter((ex: any) => ex.id !== exerciseId)
                    .map((ex: any) => (
                      <SelectItem key={ex.id} value={ex.id.toString()}>
                        {ex.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                Use another exercise's 1RM for weight calculations
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Exercise History Modal */}
      <ExerciseHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        exerciseName={exercise.name}
        history={exerciseHistory}
      />
    </div>
  );
}