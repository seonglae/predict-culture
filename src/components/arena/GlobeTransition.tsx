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

function ZoomGlobeScene({ selectedCity, onComplete }: GlobeTransitionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const { camera } = useThree();

  const targetCity = useMemo(
    () => CITIES.find((c) => c.name === selectedCity) ?? CITIES[0],
    [selectedCity]
  );

  // Target rotation so selected city faces camera (+z axis)
  // With new coords: lon=0 faces +z, so rotate by -lon to bring city to front
  const targetRotationY = useMemo(() => {
    return -targetCity.lon * (Math.PI / 180);
  }, [targetCity]);

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
    const t = elapsedRef.current;

    const rotateDuration = 1.5;
    const zoomStart = rotateDuration;
    const zoomDuration = 2.0;

    if (t < rotateDuration) {
      // Phase 1: smoothly rotate globe to face the city
      const progress = Math.min(1, t / rotateDuration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      groupRef.current.rotation.y = eased * targetRotationY;
    } else if (t < zoomStart + zoomDuration) {
      // Phase 2: lock rotation, zoom camera in
      groupRef.current.rotation.y = targetRotationY;
      const zoomProgress = (t - zoomStart) / zoomDuration;
      const eased = 1 - Math.pow(1 - zoomProgress, 3);
      camera.position.z = 5 - eased * 4.2;
      const latRad = targetCity.lat * (Math.PI / 180);
      camera.position.y = eased * Math.sin(latRad) * 0.8;
    }

    // Done
    if (t > zoomStart + zoomDuration + 0.3 && !completedRef.current) {
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
        <ZoomGlobeScene selectedCity={selectedCity} onComplete={onComplete} />
      </Canvas>

      {/* City name */}
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
