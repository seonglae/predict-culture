"use client";

import { useState, useCallback, useMemo } from "react";
import { TrafficScene } from "@/components/scene/TrafficScene";
import { BattleTimer } from "./BattleTimer";
import { GlobeMini } from "./GlobeMini";
import { useSimulation } from "@/hooks/useSimulation";

interface Tile {
  row: number;
  col: number;
  type: string;
  height?: number;
  color?: string;
}

interface VehicleSpawn {
  id: string;
  type: string;
  color: string;
  x: number;
  z: number;
  heading: number;
}

interface SimulationFrame {
  time: number;
  vehicles: any[];
}

interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

interface BattleSceneProps {
  tiles: Tile[];
  gridSize: number;
  tileSize: number;
  vehicles: VehicleSpawn[];
  frames: SimulationFrame[];
  accidentTime: number;
  accidentFrame: number;
  accidentPoint: { x: number; z: number };
  onPrediction: (point: { x: number; z: number }, time: number) => void;
  onSimulationComplete: () => void;
  predictions?: { x: number; z: number; color: string; label: string }[];
  showAccident?: boolean;
  cityName?: string;
  cityLabel?: string;
  roads?: RoadSegment[];
  flash?: (duration?: number) => void;
  shake?: (intensity?: number, duration?: number) => void;
  lat?: number;
  lon?: number;
}

export function BattleScene({
  tiles,
  gridSize,
  tileSize,
  vehicles,
  frames,
  accidentTime,
  accidentFrame,
  accidentPoint,
  onPrediction,
  onSimulationComplete,
  predictions = [],
  showAccident = false,
  cityName,
  cityLabel,
  roads,
  flash,
  shake,
  lat,
  lon,
}: BattleSceneProps) {
  const [hasPredicted, setHasPredicted] = useState(false);
  const [accidentOccurred, setAccidentOccurred] = useState(false);

  const {
    currentFrame,
    currentFrameIndex,
    currentTime,
  } = useSimulation({
    frames,
    speed: 1,
    autoStart: true,
    onFrame: (frameIndex) => {
      // Check if accident frame reached — instant crash effect
      if (frameIndex >= accidentFrame && !accidentOccurred) {
        setAccidentOccurred(true);
        // Defer side effects to avoid setState during render
        queueMicrotask(() => {
          flash?.(150);
          shake?.(15, 500);
        });
        setTimeout(() => {
          onSimulationComplete();
        }, 800);
      }
    },
  });

  const handleGroundClick = useCallback(
    (point: { x: number; z: number }) => {
      if (hasPredicted || accidentOccurred) return;
      setHasPredicted(true);
      onPrediction(point, currentTime);
    },
    [hasPredicted, accidentOccurred, onPrediction, currentTime]
  );

  return (
    <div className="relative w-full h-full">
      <GlobeMini cityName={cityName} cityLabel={cityLabel} lat={lat} lon={lon} roads={roads} />

      <BattleTimer
        currentTime={currentTime}
        hasPredicted={hasPredicted}
        accidentOccurred={accidentOccurred}
      />

      <TrafficScene
        tiles={tiles}
        gridSize={gridSize}
        tileSize={tileSize}
        vehicles={vehicles}
        currentFrame={currentFrame ?? undefined}
        predictions={predictions}
        accidentPoint={showAccident || accidentOccurred ? accidentPoint : null}
        onGroundClick={handleGroundClick}
        interactive={!hasPredicted && !accidentOccurred}
        roads={roads}
      />
    </div>
  );
}
