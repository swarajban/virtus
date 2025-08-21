import { useState, useEffect, useRef } from "react";

// Global timer state that persists across components
let globalTimerState = {
  seconds: 0,
  isRunning: false,
  lastUpdate: Date.now()
};

// Subscribers to timer state changes
const subscribers = new Set<() => void>();

const notifySubscribers = () => {
  subscribers.forEach(callback => callback());
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