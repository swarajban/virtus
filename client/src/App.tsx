import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserSelector } from "@/components/user-selector";
import HomePage from "@/pages/home";
import WorkoutPage from "@/pages/workout";
import ExercisePage from "@/pages/exercise";
import OneRMPage from "@/pages/one-rm";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/workout/:workoutNumber" component={WorkoutPage} />
      <Route path="/workout/:workoutNumber/exercise/:exerciseIndex" component={ExercisePage} />
      <Route path="/one-rm" component={OneRMPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <UserSelector />
          <Router />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
