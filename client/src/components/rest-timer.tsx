import { useState, useEffect, useRef } from "react";

// Load initial state from localStorage
const loadTimerState = () => {
  if (typeof window === 'undefined') {
    return { isRunning: false, startTime: null, setCounter: 0 };
  }
  
  const saved = localStorage.getItem('restTimerState');
  if (saved) {
    const state = JSON.parse(saved);
    // Ensure setCounter exists for backward compatibility
    if (state.setCounter === undefined) {
      state.setCounter = 0;
    }
    return state;
  }
  
  return { isRunning: false, startTime: null, setCounter: 0 };
};

// Global timer state that persists across components
let globalTimerState = loadTimerState();

// Calculate elapsed seconds from start time
const getElapsedSeconds = () => {
  if (!globalTimerState.isRunning || !globalTimerState.startTime) {
    return 0;
  }
  return Math.floor((Date.now() - globalTimerState.startTime) / 1000);
};

// Save state to localStorage
const saveTimerState = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('restTimerState', JSON.stringify(globalTimerState));
  }
};

// Subscribers to timer state changes
const subscribers = new Set<() => void>();

const notifySubscribers = () => {
  subscribers.forEach(callback => callback());
  saveTimerState();
};

export function useRestTimer() {
  const [seconds, setSeconds] = useState(getElapsedSeconds());
  const [isRunning, setIsRunning] = useState(globalTimerState.isRunning);
  const [setCounter, setSetCounter] = useState(globalTimerState.setCounter || 0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to global state changes
  useEffect(() => {
    const updateState = () => {
      setSeconds(getElapsedSeconds());
      setIsRunning(globalTimerState.isRunning);
      setSetCounter(globalTimerState.setCounter || 0);
    };

    subscribers.add(updateState);
    return () => {
      subscribers.delete(updateState);
    };
  }, []);

  // Handle timer ticking
  useEffect(() => {
    if (isRunning) {
      // Update immediately to show current elapsed time
      setSeconds(getElapsedSeconds());
      
      intervalRef.current = setInterval(() => {
        // Always recalculate from start time for accuracy
        const elapsed = getElapsedSeconds();
        setSeconds(elapsed);
        notifySubscribers();
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  // Save state on window unload
  useEffect(() => {
    const handleUnload = () => {
      saveTimerState();
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Handle visibility changes to sync timer when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && globalTimerState.isRunning) {
        // Simply recalculate elapsed time from start time
        const elapsed = getElapsedSeconds();
        setSeconds(elapsed);
        notifySubscribers();
      }
    };

    // Also handle focus event for additional reliability
    const handleFocus = () => {
      if (globalTimerState.isRunning) {
        // Simply recalculate elapsed time from start time
        const elapsed = getElapsedSeconds();
        setSeconds(elapsed);
        notifySubscribers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const startTimer = () => {
    globalTimerState.isRunning = true;
    globalTimerState.startTime = Date.now();
    setIsRunning(true);
    setSeconds(0);
    notifySubscribers();
  };

  const stopTimer = () => {
    globalTimerState.isRunning = false;
    globalTimerState.startTime = null;
    setIsRunning(false);
    notifySubscribers();
  };

  const resetTimer = () => {
    globalTimerState.startTime = Date.now();
    setSeconds(0);
    notifySubscribers();
  };

  const incrementSetCounter = () => {
    globalTimerState.setCounter = (globalTimerState.setCounter || 0) + 1;
    setSetCounter(globalTimerState.setCounter);
    notifySubscribers();
  };

  const resetSetCounter = () => {
    globalTimerState.setCounter = 0;
    setSetCounter(0);
    notifySubscribers();
  };

  const handleClick = () => {
    if (!isRunning) {
      // Start timer if not running
      startTimer();
    } else {
      // Reset and restart if running
      resetTimer();
      startTimer();
    }
  };

  const handleMouseDown = () => {
    // Set up hold detection (500ms)
    holdTimeoutRef.current = setTimeout(() => {
      resetTimer();
      stopTimer();
      holdTimeoutRef.current = null;
    }, 500);
  };

  const handleMouseUp = () => {
    // If hold timeout is still active, it was a regular click
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
      handleClick();
    }
  };

  const handleMouseLeave = () => {
    // Cancel hold if mouse leaves
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    seconds,
    isRunning,
    setCounter,
    formattedTime: formatTime(seconds),
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleClick,
    startTimer,
    stopTimer,
    resetTimer,
    incrementSetCounter,
    resetSetCounter
  };
}

export function RestTimer() {
  const { 
    formattedTime, 
    isRunning,
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave
  } = useRestTimer();

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onTouchCancel={handleMouseLeave}
      className={`text-white font-mono text-sm ${!isRunning ? 'underline' : ''} hover:opacity-80 transition-opacity select-none`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {formattedTime}
    </button>
  );
}

export function RestTimerBar() {
  const { 
    formattedTime, 
    isRunning,
    setCounter,
    startTimer,
    stopTimer,
    resetTimer,
    incrementSetCounter,
    resetSetCounter
  } = useRestTimer();

  const handleStartStop = () => {
    if (isRunning) {
      // Restart: reset and immediately start again
      resetTimer();
      incrementSetCounter();
      setTimeout(() => startTimer(), 50);
    } else {
      startTimer();
    }
  };

  const handleReset = () => {
    resetTimer();
    stopTimer();
    resetSetCounter();
  };

  return (
    <div className="my-4 bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-2xl p-5 shadow-xl border border-gray-700">
      {/* Timer and Set Counter Display */}
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Rest Timer</span>
          <span className="font-mono text-4xl font-bold text-white tabular-nums">{formattedTime}</span>
        </div>
        <div className="w-px h-16 bg-gray-600"></div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1">Sets</span>
          <span className="font-mono text-4xl font-bold text-white tabular-nums">{setCounter}</span>
        </div>
      </div>
      
      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleReset}
          className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-95 min-w-[100px]"
          type="button"
        >
          Reset
        </button>
        <button
          onClick={handleStartStop}
          className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 active:scale-95 min-w-[120px] ${
            isRunning 
              ? 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-lg' 
              : 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white shadow-lg'
          }`}
          type="button"
        >
          {isRunning ? 'Restart' : 'Start'}
        </button>
      </div>
    </div>
  );
}