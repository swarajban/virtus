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
  const handleIncrement = () => {
    onChange(value + step);
  };

  const handleDecrement = () => {
    onChange(Math.max(min, value - step));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value) || 0;
    onChange(Math.max(min, newValue));
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
        value={value}
        onChange={handleInputChange}
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
