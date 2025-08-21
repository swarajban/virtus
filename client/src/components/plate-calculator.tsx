import { useMemo } from "react";

interface PlateCalculatorProps {
  weight: number;
}

interface Plate {
  weight: number;
  color: string;
  textColor?: string;
}

const BARBELL_WEIGHT = 45;

const AVAILABLE_PLATES: Plate[] = [
  { weight: 45, color: "#2563eb", textColor: "white" }, // blue
  { weight: 35, color: "#facc15", textColor: "black" }, // yellow
  { weight: 25, color: "#16a34a", textColor: "white" }, // green
  { weight: 10, color: "#000000", textColor: "white" }, // black
  { weight: 5, color: "#ec4899", textColor: "white" }, // pink
  { weight: 2.5, color: "#f97316", textColor: "white" }, // orange
];

export function PlateCalculator({ weight }: PlateCalculatorProps) {
  const plateConfiguration = useMemo(() => {
    // If weight is less than barbell weight, error
    if (weight < BARBELL_WEIGHT) {
      return { plates: [], error: true };
    }

    // If weight equals barbell weight, no plates needed
    if (weight === BARBELL_WEIGHT) {
      return { plates: [], error: false };
    }

    const targetPlateWeight = weight - BARBELL_WEIGHT;
    
    // Must be divisible by 2.5 (smallest increment we can make with pairs)
    if (targetPlateWeight % 2.5 !== 0) {
      return { plates: [], error: true };
    }

    const perSideWeight = targetPlateWeight / 2;
    const platesOneSide: Plate[] = [];
    let remainingWeight = perSideWeight;

    // Greedy algorithm to find minimum number of plates
    for (const plate of AVAILABLE_PLATES) {
      while (remainingWeight >= plate.weight) {
        platesOneSide.push(plate);
        remainingWeight -= plate.weight;
      }
    }

    // If we couldn't match exactly, return error
    if (remainingWeight > 0.01) { // Small tolerance for floating point
      return { plates: [], error: true };
    }

    return { plates: platesOneSide, error: false };
  }, [weight]);

  if (plateConfiguration.error) {
    return (
      <div className="text-xs text-red-500 mt-1 text-center">
        Error calculating plates for entered weight
      </div>
    );
  }

  if (plateConfiguration.plates.length === 0 && weight === BARBELL_WEIGHT) {
    return (
      <div className="text-xs text-gray-600 mt-1 text-center">
        <span className="font-medium">Plates:</span> Empty barbell
      </div>
    );
  }

  // Sort plates from lightest to heaviest (outside to inside)
  const sortedPlates = [...plateConfiguration.plates].sort((a, b) => a.weight - b.weight);
  
  // Group plates by weight for display
  const plateGroups = sortedPlates.reduce((acc, plate) => {
    const existing = acc.find(g => g.weight === plate.weight);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ ...plate, count: 1 });
    }
    return acc;
  }, [] as Array<Plate & { count: number }>);

  // Create the display string (show each weight individually)
  const leftSide = plateGroups.map(g => {
    if (g.count > 1) {
      return Array(g.count).fill(g.weight).join(" + ");
    }
    return `${g.weight}`;
  }).join(" + ");

  const rightSide = [...plateGroups].reverse().map(g => {
    if (g.count > 1) {
      return Array(g.count).fill(g.weight).join(" + ");
    }
    return `${g.weight}`;
  }).join(" + ");

  // Create the ASCII art with colored bars
  const leftBars = sortedPlates.map((plate, i) => (
    <span 
      key={`left-${i}`}
      style={{ 
        color: plate.color,
        fontWeight: 'bold',
        fontSize: '1.2em'
      }}
    >
      |
    </span>
  ));

  const rightBars = [...sortedPlates].reverse().map((plate, i) => (
    <span 
      key={`right-${i}`}
      style={{ 
        color: plate.color,
        fontWeight: 'bold',
        fontSize: '1.2em'
      }}
    >
      |
    </span>
  ));

  return (
    <div className="text-xs text-gray-700 mt-1 font-mono text-center">
      <div className="space-y-1">
        <div className="flex items-center justify-center">
          <span className="font-medium mr-2">Plates:</span>
          <span className="text-[11px]">{leftSide} | {rightSide}</span>
        </div>
        <div className="flex items-center justify-center">
          {leftBars}
          <span className="mx-1 text-gray-400">------</span>
          {rightBars}
        </div>
      </div>
    </div>
  );
}