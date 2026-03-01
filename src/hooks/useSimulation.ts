"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
  const [interpolated, setInterpolated] = useState<VehicleFrame[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isComplete, setIsComplete] = useState(false);

  const animRef = useRef<number | null>(null);
  const startTsRef = useRef(0);
  const lastIdxRef = useRef(0);
  const onFrameRef = useRef(onFrame);
  const onCompleteRef = useRef(onComplete);
  const framesRef = useRef(frames);
  const speedRef = useRef(speed);

  onFrameRef.current = onFrame;
  onCompleteRef.current = onComplete;
  framesRef.current = frames;
  speedRef.current = speed;

  const totalFrames = frames?.length ?? 0;
  const currentTime = frames?.[currentFrameIndex]?.time ?? 0;

  const reset = useCallback(() => {
    setCurrentFrameIndex(0);
    setInterpolated(null);
    setIsPlaying(false);
    setIsComplete(false);
    lastIdxRef.current = 0;
  }, []);

  const play = useCallback(() => {
    if (isComplete) reset();
    setIsPlaying(true);
  }, [isComplete, reset]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const hasFrames = !!frames && frames.length >= 2;

  useEffect(() => {
    if (!isPlaying || !hasFrames) return;

    startTsRef.current = 0;
    lastIdxRef.current = 0;

    const tick = (ts: number) => {
      if (startTsRef.current === 0) startTsRef.current = ts;

      const f = framesRef.current;
      if (!f || f.length < 2) return;

      const elapsed = ((ts - startTsRef.current) / 1000) * speedRef.current;
      const simTime = f[0].time + elapsed;

      let idxA = 0;
      for (let i = 0; i < f.length - 1; i++) {
        if (f[i + 1].time > simTime) { idxA = i; break; }
        idxA = i;
      }

      if (idxA >= f.length - 1) {
        setCurrentFrameIndex(f.length - 1);
        setInterpolated(f[f.length - 1].vehicles);
        setIsPlaying(false);
        setIsComplete(true);
        onCompleteRef.current?.();
        return;
      }

      const fA = f[idxA];
      const fB = f[idxA + 1];
      const dur = fB.time - fA.time;
      const t = dur > 0 ? Math.min(1, (simTime - fA.time) / dur) : 0;

      setInterpolated(interpolateFrames(fA, fB, t));

      if (idxA !== lastIdxRef.current) {
        lastIdxRef.current = idxA;
        setCurrentFrameIndex(idxA);
        onFrameRef.current?.(idxA, f[idxA].time);
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, hasFrames]);

  return {
    currentFrame: interpolated ?? frames?.[0]?.vehicles ?? null,
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
