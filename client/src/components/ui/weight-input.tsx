import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

interface WeightInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  className?: string;
}

export function WeightInput({ 
  value, 
  onChange, 
  step = 5, 
  min = 0, 
  className 
}: WeightInputProps) {
  // Local state to allow temporary empty values
  const [localValue, setLocalValue] = useState<string>(value.toString());

  // Sync local state when prop value changes
  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleIncrement = () => {
    const numValue = parseInt(localValue) || 0;
    const newValue = numValue + step;
    setLocalValue(newValue.toString());
    onChange(newValue);
  };

  const handleDecrement = () => {
    const numValue = parseInt(localValue) || 0;
    const newValue = Math.max(min, numValue - step);
    setLocalValue(newValue.toString());
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow empty string for user to type
    setLocalValue(inputValue);
    
    // Only update parent with valid numbers, but don't force 0 on empty
    if (inputValue !== '') {
      const numValue = parseInt(inputValue);
      if (!isNaN(numValue)) {
        onChange(Math.max(min, numValue));
      }
    }
  };

  const handleBlur = () => {
    // On blur, ensure we have a valid number
    if (localValue === '' || isNaN(parseInt(localValue))) {
      setLocalValue('0');
      onChange(0);
    }
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <Button
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        className="w-10 h-10 rounded-lg"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        value={localValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="text-center font-medium"
        step={step}
        min={min}
      />
      <Button
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        className="w-10 h-10 rounded-lg"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
