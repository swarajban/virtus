import { useState, useEffect, useRef } from "react";

// Load initial state from localStorage
const loadTimerState = () => {
  if (typeof window === 'undefined') {
    return { seconds: 0, isRunning: false, lastUpdate: Date.now() };
  }
  
  const saved = localStorage.getItem('restTimerState');
  if (saved) {
    const state = JSON.parse(saved);
    // If timer was running, calculate elapsed time since last update
    if (state.isRunning) {
      const elapsed = Math.floor((Date.now() - state.lastUpdate) / 1000);
      state.seconds += elapsed;
    }
    state.lastUpdate = Date.now();
    return state;
  }
  
  return { seconds: 0, isRunning: false, lastUpdate: Date.now() };
};

// Global timer state that persists across components
let globalTimerState = loadTimerState();

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
  const [seconds, setSeconds] = useState(globalTimerState.seconds);
  const [isRunning, setIsRunning] = useState(globalTimerState.isRunning);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to global state changes
  useEffect(() => {
    const updateState = () => {
      setSeconds(globalTimerState.seconds);
      setIsRunning(globalTimerState.isRunning);
    };

    subscribers.add(updateState);
    return () => {
      subscribers.delete(updateState);
    };
  }, []);

  // Handle timer ticking
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        globalTimerState.seconds++;
        globalTimerState.lastUpdate = Date.now();
        setSeconds(globalTimerState.seconds);
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

  const startTimer = () => {
    globalTimerState.isRunning = true;
    setIsRunning(true);
    notifySubscribers();
  };

  const stopTimer = () => {
    globalTimerState.isRunning = false;
    setIsRunning(false);
    notifySubscribers();
  };

  const resetTimer = () => {
    globalTimerState.seconds = 0;
    globalTimerState.lastUpdate = Date.now();
    setSeconds(0);
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
    formattedTime: formatTime(seconds),
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleClick,
    startTimer,
    stopTimer,
    resetTimer
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
    startTimer,
    stopTimer,
    resetTimer
  } = useRestTimer();

  const handleStartStop = () => {
    if (isRunning) {
      // Restart: reset and immediately start again
      resetTimer();
      setTimeout(() => startTimer(), 50);
    } else {
      startTimer();
    }
  };

  const handleReset = () => {
    resetTimer();
    stopTimer();
  };

  return (
    <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between sticky top-[84px] z-40 shadow-lg border-t border-gray-700">
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-gray-400 font-medium">Rest Timer</span>
        <span className="font-mono text-xl font-bold text-white">{formattedTime}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleReset}
          className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-md text-sm font-medium transition-all duration-150 active:scale-95"
          type="button"
        >
          Reset
        </button>
        <button
          onClick={handleStartStop}
          className={`px-5 py-1.5 rounded-md text-sm font-bold transition-all duration-150 active:scale-95 ${
            isRunning 
              ? 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white' 
              : 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white'
          }`}
          type="button"
        >
          {isRunning ? 'Restart' : 'Start'}
        </button>
      </div>
    </div>
  );
}