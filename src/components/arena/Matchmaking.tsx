"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GeoGlobe } from "./GeoGlobe";

const CITIES = [
  { name: "New York", label: "Times Square", lat: 40.758, lon: -73.9855 },
  { name: "London", label: "Trafalgar Square", lat: 51.5074, lon: -0.1278 },
  { name: "Paris", label: "Rue de Rivoli", lat: 48.8606, lon: 2.3376 },
  { name: "Tokyo", label: "Shibuya Crossing", lat: 35.6595, lon: 139.7004 },
  { name: "Singapore", label: "Marina Bay", lat: 1.2838, lon: 103.8591 },
  { name: "Los Angeles", label: "Downtown LA", lat: 34.0407, lon: -118.2468 },
  { name: "San Francisco", label: "Union Square", lat: 37.7879, lon: -122.4074 },
];

interface MatchmakingProps {
  onTimeout?: () => void;
  opponentFound?: boolean;
  selectedCity?: string;
  onFlyComplete?: () => void;
  playerCount?: number;
  maxPlayers?: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function GlobeScene({
  opponentFound,
  selectedCity,
  onFlyComplete,
}: {
  opponentFound: boolean;
  selectedCity: string;
  onFlyComplete?: () => void;
}) {
  const { camera } = useThree();
  const flyStartedRef = useRef(false);
  const flyElapsedRef = useRef(0);
  const completedRef = useRef(false);
  const startCoordsRef = useRef<{ r: number; phi: number; theta: number } | null>(null);
  // Lock the fly target so it never changes mid-flight
  const endCoordsRef = useRef<{ r: number; phi: number; theta: number } | null>(null);
  const spinAngleRef = useRef(0);

  const GLOBE_RADIUS = 1.2;

  useFrame((_, delta) => {
    // Once fly started, NEVER go back to spinning — even if props flicker
    if (!flyStartedRef.current && !opponentFound) {
      spinAngleRef.current += delta * 0.3;
      const angle = spinAngleRef.current;
      const r = 5;
      camera.position.set(
        r * Math.sin(angle),
        0,
        r * Math.cos(angle)
      );
      camera.lookAt(0, 0, 0);
      return;
    }

    // Lock start + end positions once — never changes
    if (!flyStartedRef.current) {
      flyStartedRef.current = true;
      const pos = camera.position;
      const r = pos.length();
      const phi = Math.acos(pos.y / r);
      const theta = Math.atan2(pos.x, pos.z);
      startCoordsRef.current = { r, phi, theta };

      const city = CITIES.find((c) => c.name === selectedCity) ?? CITIES[0];
      endCoordsRef.current = {
        r: GLOBE_RADIUS + 0.4,
        phi: (90 - city.lat) * (Math.PI / 180),
        theta: city.lon * (Math.PI / 180),
      };
    }

    const start = startCoordsRef.current!;
    const end = endCoordsRef.current!;
    flyElapsedRef.current += delta;
    const duration = 2.5;
    const progress = easeInOut(Math.min(1, flyElapsedRef.current / duration));

    let dTheta = end.theta - start.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;

    const r = start.r + (end.r - start.r) * progress;
    const phi = start.phi + (end.phi - start.phi) * progress;
    const theta = start.theta + dTheta * progress;

    camera.position.set(
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(0, 0, 0);

    if (flyElapsedRef.current > duration + 0.3 && !completedRef.current) {
      completedRef.current = true;
      onFlyComplete?.();
    }
  });

  return (
    <GeoGlobe
      radius={GLOBE_RADIUS}
      spinSpeed={0}
    />
  );
}

export function Matchmaking({
  onTimeout,
  opponentFound = false,
  selectedCity = "New York",
  onFlyComplete,
  playerCount = 1,
  maxPlayers = 5,
}: MatchmakingProps) {
  const [countdown, setCountdown] = useState(5);
  const droneRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => { droneRef.current?.stop(); };
  }, []);

  const cityInfo = useMemo(
    () => CITIES.find((c) => c.name === selectedCity),
    [selectedCity]
  );

  useEffect(() => {
    if (!opponentFound || !selectedCity) return;
  }, [opponentFound, selectedCity]);

  useEffect(() => {
    if (opponentFound) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeout?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onTimeout, opponentFound]);

  return (
    <div className="fixed inset-0 z-50 bg-[#030308]">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <GlobeScene
          opponentFound={opponentFound}
          selectedCity={selectedCity}
          onFlyComplete={onFlyComplete}
        />
      </Canvas>

      <div className="absolute inset-x-0 bottom-16 z-10 pointer-events-none">
        {opponentFound && cityInfo ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h2
              className="text-4xl md:text-6xl text-white/90 tracking-wider"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {selectedCity}
            </h2>
            <p className="text-xs text-white/30 font-mono mt-2 tracking-widest">
              {cityInfo.label}
            </p>
          </motion.div>
        ) : (
          <div className="text-center">
            <p className="text-lg text-white/60 mb-2 font-mono">Finding players...</p>
            <p className="text-white/40 text-sm font-mono mb-1">
              {playerCount}/{maxPlayers} joined
            </p>
            <p className="text-white/25 text-xs font-mono">
              {countdown > 0 ? `${countdown}s` : "Starting..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
