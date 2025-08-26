import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExerciseHistoryModal } from "@/components/exercise-history-modal";
import { ArrowLeft, Search, Activity, ExternalLink } from "lucide-react";
import { LocalStorage } from "@/lib/storage";
import type { ExerciseHistoryEntry } from "@shared/schema";

interface ExerciseGroup {
  name: string;
  count: number;
  entries: ExerciseHistoryEntry[];
  exerciseId?: number;
}

export default function ExerciseHistoryPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [exerciseMap, setExerciseMap] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadHistory() {
      try {
        const [history, exercisesResponse] = await Promise.all([
          LocalStorage.getExerciseHistory(),
          fetch('/api/exercises', {
            headers: { 'x-username': localStorage.getItem('selected-username') || 'demo' }
          })
        ]);
        
        setExerciseHistory(history || []);
        
        if (exercisesResponse.ok) {
          const exercises = await exercisesResponse.json();
          const map: Record<string, number> = {};
          exercises.forEach((ex: any) => {
            map[ex.name] = ex.id;
          });
          setExerciseMap(map);
        }
      } catch (error) {
        console.error("Error loading exercise history:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadHistory();
  }, []);

  // Group exercises by name and count occurrences
  const groupedExercises = useMemo(() => {
    const groups: Record<string, ExerciseGroup> = {};
    
    exerciseHistory.forEach((entry) => {
      if (!groups[entry.exerciseName]) {
        groups[entry.exerciseName] = {
          name: entry.exerciseName,
          count: 0,
          entries: []
        };
      }
      groups[entry.exerciseName].count++;
      groups[entry.exerciseName].entries.push(entry);
    });

    return Object.values(groups)
      .sort((a, b) => b.count - a.count); // Sort by most performed first
  }, [exerciseHistory]);

  // Filter exercises based on search query
  const filteredExercises = useMemo(() => {
    if (!searchQuery) return groupedExercises;
    
    const query = searchQuery.toLowerCase();
    return groupedExercises.filter(group => 
      group.name.toLowerCase().includes(query)
    );
  }, [groupedExercises, searchQuery]);

  const handleExerciseClick = (exerciseName: string) => {
    setSelectedExercise(exerciseName);
    setShowHistory(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exercise history...</p>
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
            <h1 className="text-2xl font-bold tracking-tight">Exercise History</h1>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="p-4 bg-gradient-to-b from-purple-50 to-white">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base border-gray-200 focus:border-primary"
          />
        </div>
      </div>

      {/* Exercise List */}
      <div className="px-4 py-2">
        {filteredExercises.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchQuery ? "No exercises found matching your search" : "No exercise history yet"}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Complete some working sets to see your history here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredExercises.map((group) => (
              <Card
                key={group.name}
                className="cursor-pointer hover:shadow-md transition-all duration-200 active:scale-98"
                onClick={() => handleExerciseClick(group.name)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                        {group.name}
                        {exerciseMap[group.name] && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 hover:bg-purple-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/exercise/${exerciseMap[group.name]}`);
                            }}
                            title="View exercise details"
                          >
                            <ExternalLink className="h-4 w-4 text-purple-600" />
                          </Button>
                        )}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {group.count} {group.count === 1 ? 'time' : 'times'} performed
                        </Badge>
                        {group.entries[0] && (
                          <span className="text-xs text-gray-500">
                            Last: {new Date(group.entries[0].date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Activity className="h-5 w-5 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && selectedExercise && (
        <ExerciseHistoryModal
          exerciseName={selectedExercise}
          isOpen={showHistory}
          onClose={() => {
            setShowHistory(false);
            setSelectedExercise(null);
          }}
        />
      )}
    </div>
  );
}