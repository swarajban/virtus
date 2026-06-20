import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setNavDirection } from "@/lib/motion";
import HomePage from "@/pages/home";
import WorkoutPage from "@/pages/workout";
import ExercisePage from "@/pages/exercise";
import OneRMPage from "@/pages/one-rm";
import ExerciseHistoryPage from "@/pages/exercise-history";
import SettingsPage from "@/pages/settings";
import DataDiagnostic from "@/pages/data-diagnostic";
import ExercisesPage from "@/pages/exercises";
import ExerciseInfoPage from "@/pages/exercise-info";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/workout/:workoutNumber" component={WorkoutPage} />
      <Route path="/workout/:workoutNumber/exercise/:exerciseIndex" component={ExercisePage} />
      <Route path="/one-rm" component={OneRMPage} />
      <Route path="/exercise-history" component={ExerciseHistoryPage} />
      <Route path="/exercises" component={ExercisesPage} />
      <Route path="/exercise/:id" component={ExerciseInfoPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/data-diagnostic" component={DataDiagnostic} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // A browser/hardware Back (or Forward) gesture navigates without going through
  // our nav handlers, so the entering page would inherit the last tap's
  // direction. Treat any history pop as a "back" so the transition reverses.
  useEffect(() => {
    const onPop = () => setNavDirection("back");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
