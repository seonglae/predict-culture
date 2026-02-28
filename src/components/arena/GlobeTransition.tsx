"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "framer-motion";
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

interface GlobeTransitionProps {
  selectedCity: string;
  onComplete: () => void;
}

/** Just spins, then calls onComplete after a short duration */
function SpinningGlobeScene({ selectedCity, onComplete }: GlobeTransitionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);

  const cityMarkers = useMemo(
    () =>
      CITIES.map((c) => ({
        lat: c.lat,
        lon: c.lon,
        selected: c.name === selectedCity,
      })),
    [selectedCity]
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    elapsedRef.current += delta;

    // Just spin continuously
    groupRef.current.rotation.y += delta * 0.5;

    // After 3 seconds, transition out
    if (elapsedRef.current > 3 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  return (
    <GeoGlobe
      radius={2}
      spinSpeed={0}
      cities={cityMarkers}
      groupRef={groupRef}
    />
  );
}

export function GlobeTransition({ selectedCity, onComplete }: GlobeTransitionProps) {
  const cityInfo = useMemo(
    () => CITIES.find((c) => c.name === selectedCity),
    [selectedCity]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 bg-[#030308]"
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <SpinningGlobeScene selectedCity={selectedCity} onComplete={onComplete} />
      </Canvas>

      {/* City name — shown immediately */}
      {cityInfo && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="absolute bottom-20 left-0 right-0 text-center pointer-events-none z-10"
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
      )}
    </motion.div>
  );
}
