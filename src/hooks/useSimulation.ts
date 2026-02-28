"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface VehicleFrame {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: string;
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

export function useSimulation({
  frames,
  speed = 1,
  onFrame,
  onComplete,
  autoStart = false,
}: UseSimulationOptions) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isComplete, setIsComplete] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameAccumRef = useRef<number>(0);

  const totalFrames = frames?.length ?? 0;
  const currentFrame = frames?.[currentFrameIndex]?.vehicles ?? null;
  const currentTime = frames?.[currentFrameIndex]?.time ?? 0;

  // Frame interval: simulation recorded at 20fps (60fps / 3), playback at speed
  const frameInterval = (1 / 20) / speed;

  const reset = useCallback(() => {
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setIsComplete(false);
    frameAccumRef.current = 0;
  }, []);

  const play = useCallback(() => {
    if (isComplete) reset();
    setIsPlaying(true);
  }, [isComplete, reset]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!isPlaying || !frames || frames.length === 0) return;

    const tick = (timestamp: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      frameAccumRef.current += delta;

      if (frameAccumRef.current >= frameInterval) {
        frameAccumRef.current -= frameInterval;

        setCurrentFrameIndex((prev) => {
          const next = prev + 1;
          if (next >= totalFrames) {
            setIsPlaying(false);
            setIsComplete(true);
            onComplete?.();
            return prev;
          }
          onFrame?.(next, frames[next].time);
          return next;
        });
      }

      animRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = 0;
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, frames, totalFrames, frameInterval, onFrame, onComplete]);

  return {
    currentFrame,
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
