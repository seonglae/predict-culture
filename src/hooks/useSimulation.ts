"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

interface VehicleFrame {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: string;
  flying?: boolean;
  altitude?: number;
}

interface SimulationFrame {
  time: number;
  vehicles: VehicleFrame[];
}

interface UseSimulationOptions {
  frames: SimulationFrame[] | null;
  speed?: number;
  onFrame?: (frameIndex: number, time: number) => void;
  onComplete?: () => void;
  autoStart?: boolean;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function interpolateFrames(
  frameA: SimulationFrame,
  frameB: SimulationFrame,
  t: number
): VehicleFrame[] {
  return frameA.vehicles.map((va) => {
    const vb = frameB.vehicles.find((v) => v.id === va.id);
    if (!vb || va.state === "crashed") return va;
    return {
      id: va.id,
      x: va.x + (vb.x - va.x) * t,
      z: va.z + (vb.z - va.z) * t,
      heading: lerpAngle(va.heading, vb.heading, t),
      speed: va.speed + (vb.speed - va.speed) * t,
      state: vb.state === "crashed" && t > 0.8 ? "crashed" : va.state,
      flying: va.flying,
      altitude: va.altitude != null && vb.altitude != null
        ? va.altitude + (vb.altitude - va.altitude) * t
        : va.altitude,
    };
  });
}

export function useSimulation({
  frames,
  speed = 1,
  onFrame,
  onComplete,
  autoStart = false,
}: UseSimulationOptions) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [interpolatedVehicles, setInterpolatedVehicles] = useState<VehicleFrame[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isComplete, setIsComplete] = useState(false);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const simTimeRef = useRef<number>(0);
  const lastFrameIdxRef = useRef<number>(0);

  const totalFrames = frames?.length ?? 0;
  const currentTime = frames?.[currentFrameIndex]?.time ?? 0;

  const reset = useCallback(() => {
    setCurrentFrameIndex(0);
    setInterpolatedVehicles(null);
    setIsPlaying(false);
    setIsComplete(false);
    simTimeRef.current = 0;
    lastFrameIdxRef.current = 0;
  }, []);

  const play = useCallback(() => {
    if (isComplete) reset();
    setIsPlaying(true);
  }, [isComplete, reset]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!isPlaying || !frames || frames.length < 2) return;

    const tick = (timestamp: number) => {
      if (startTimeRef.current === 0) startTimeRef.current = timestamp;
      const elapsed = ((timestamp - startTimeRef.current) / 1000) * speed;
      simTimeRef.current = elapsed;

      const simStartTime = frames[0].time;
      const currentSimTime = simStartTime + elapsed;

      let idxA = 0;
      for (let i = 0; i < frames.length - 1; i++) {
        if (frames[i + 1].time > currentSimTime) { idxA = i; break; }
        idxA = i;
      }

      if (idxA >= frames.length - 1) {
        setCurrentFrameIndex(frames.length - 1);
        setInterpolatedVehicles(frames[frames.length - 1].vehicles);
        setIsPlaying(false);
        setIsComplete(true);
        onComplete?.();
        return;
      }

      const frameA = frames[idxA];
      const frameB = frames[idxA + 1];
      const frameDuration = frameB.time - frameA.time;
      const t = frameDuration > 0 ? Math.min(1, (currentSimTime - frameA.time) / frameDuration) : 0;

      setInterpolatedVehicles(interpolateFrames(frameA, frameB, t));

      if (idxA !== lastFrameIdxRef.current) {
        lastFrameIdxRef.current = idxA;
        setCurrentFrameIndex(idxA);
        onFrame?.(idxA, frames[idxA].time);
      }

      animRef.current = requestAnimationFrame(tick);
    };

    startTimeRef.current = 0;
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, frames, speed, onFrame, onComplete]);

  return {
    currentFrame: interpolatedVehicles ?? frames?.[0]?.vehicles ?? null,
    currentFrameIndex,
    currentTime,
    totalFrames,
    isPlaying,
    isComplete,
    play,
    pause,
    reset,
    progress: totalFrames > 0 ? currentFrameIndex / totalFrames : 0,
  };
}
