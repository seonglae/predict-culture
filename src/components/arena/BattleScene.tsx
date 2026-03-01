"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { TrafficScene } from "@/components/scene/TrafficScene";
import { GlobeMini } from "./GlobeMini";
import { useSimulation } from "@/hooks/useSimulation";
import { playCrash, playBattleBGM, warmUpAudio } from "@/lib/sfx";

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

interface BuildingFootprint {
  polygon: { x: number; z: number }[];
  height: number;
  color: string;
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
  buildings?: BuildingFootprint[];
  waterPolygons?: { polygon: { x: number; z: number }[] }[];
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
  buildings,
  waterPolygons,
  flash,
  shake,
  lat,
  lon,
}: BattleSceneProps) {
  const [hasPredicted, setHasPredicted] = useState(false);
  const [accidentOccurred, setAccidentOccurred] = useState(false);

  // Start battle BGM on mount — dark ambient drone loop
  useEffect(() => {
    warmUpAudio();
    const bgm = playBattleBGM();
    return () => bgm.stop();
  }, []);

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
          playCrash();
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
      if (accidentOccurred) return;
      setHasPredicted(true);
      onPrediction(point, currentTime);
    },
    [accidentOccurred, onPrediction, currentTime]
  );

  return (
    <div className="relative w-full h-full">
      <GlobeMini cityName={cityName} cityLabel={cityLabel} lat={lat} lon={lon} roads={roads} tiles={tiles} gridSize={gridSize} tileSize={tileSize} />

      {/* Minimal prediction status */}
      {!accidentOccurred && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-4 py-2 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10">
            <p className="text-[12px] text-white/70 font-mono tracking-wide">
              {hasPredicted ? "click again to move prediction" : "click to predict crash location"}
            </p>
          </div>
        </div>
      )}

      <TrafficScene
        tiles={tiles}
        gridSize={gridSize}
        tileSize={tileSize}
        vehicles={vehicles}
        currentFrame={currentFrame ?? undefined}
        predictions={predictions}
        accidentPoint={showAccident || accidentOccurred ? accidentPoint : null}
        onGroundClick={handleGroundClick}
        interactive={!accidentOccurred}
        roads={roads}
        buildings={buildings}
        waterPolygons={waterPolygons}
      />
    </div>
  );
}
