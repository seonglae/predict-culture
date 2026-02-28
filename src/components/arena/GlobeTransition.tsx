"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

/** Ease in-out cubic */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Camera flies from start position to just above the city on the globe.
 * Globe stays completely still — only the camera moves (like Google Earth).
 * Uses spherical coordinate interpolation so the camera follows the globe curvature.
 */
function FlyToScene({ selectedCity, onComplete }: GlobeTransitionProps) {
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const { camera } = useThree();

  const GLOBE_RADIUS = 2;

  const targetCity = useMemo(
    () => CITIES.find((c) => c.name === selectedCity) ?? CITIES[0],
    [selectedCity]
  );

  // Start camera spherical: r=5, looking from front (lon=0, lat=0)
  const startSpherical = useMemo(() => ({
    r: 5,
    phi: Math.PI / 2,   // equator (colatitude: 90° = equator)
    theta: 0,            // lon=0 faces +z
  }), []);

  // End camera spherical: just above the city
  const endSpherical = useMemo(() => ({
    r: GLOBE_RADIUS + 0.4,  // close to surface
    phi: (90 - targetCity.lat) * (Math.PI / 180),  // colatitude
    theta: targetCity.lon * (Math.PI / 180),        // longitude
  }), [targetCity]);

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
    elapsedRef.current += delta;
    const t = elapsedRef.current;
    const duration = 3.0;

    if (t < duration) {
      const progress = easeInOut(Math.min(1, t / duration));

      // Interpolate spherical coordinates
      const r = startSpherical.r + (endSpherical.r - startSpherical.r) * progress;
      const phi = startSpherical.phi + (endSpherical.phi - startSpherical.phi) * progress;
      const theta = startSpherical.theta + (endSpherical.theta - startSpherical.theta) * progress;

      // Convert spherical to Cartesian (same convention as latLonToVec3)
      camera.position.set(
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.cos(theta)
      );

      // Always look at globe center
      camera.lookAt(0, 0, 0);
    }

    if (t > duration + 0.5 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  return (
    <GeoGlobe
      radius={GLOBE_RADIUS}
      spinSpeed={0}
    />
  );
}

export function GlobeTransition({ selectedCity, onComplete }: GlobeTransitionProps) {
  const cityInfo = useMemo(
    () => CITIES.find((c) => c.name === selectedCity),
    [selectedCity]
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#030308]">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <FlyToScene selectedCity={selectedCity} onComplete={onComplete} />
      </Canvas>

      {/* City name */}
      {cityInfo && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
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
    </div>
  );
}
