"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { GeoGlobe, latLonToVec3 } from "./GeoGlobe";

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

type Phase = "spinning" | "locking" | "zooming" | "done";

function GlobeScene({ selectedCity, onComplete }: GlobeTransitionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const phaseRef = useRef<Phase>("spinning");
  const completedRef = useRef(false);
  const { camera } = useThree();

  const targetCity = useMemo(
    () => CITIES.find((c) => c.name === selectedCity) ?? CITIES[0],
    [selectedCity]
  );

  const targetRotation = useMemo(() => {
    const theta = (targetCity.lon + 180) * (Math.PI / 180);
    return new THREE.Euler(0, -theta + Math.PI, 0);
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

    if (t < 2) {
      phaseRef.current = "spinning";
      groupRef.current.rotation.y += delta * 0.8;
    } else if (t < 3.5) {
      phaseRef.current = "locking";
      const lockProgress = Math.min(1, (t - 2) / 1.5);
      const eased = 1 - Math.pow(1 - lockProgress, 3);
      const currentQ = new THREE.Quaternion().setFromEuler(
        groupRef.current.rotation
      );
      const targetQ = new THREE.Quaternion().setFromEuler(targetRotation);
      currentQ.slerp(targetQ, eased * 0.08);
      groupRef.current.quaternion.copy(currentQ);
    } else if (t < 4.5) {
      phaseRef.current = "zooming";
      const zoomProgress = Math.min(1, (t - 3.5) / 1.0);
      const eased = 1 - Math.pow(1 - zoomProgress, 2);
      camera.position.z = 5 - eased * 4.5;
      camera.position.y = eased * 0.5;
    } else {
      phaseRef.current = "done";
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
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
  const [showLabel, setShowLabel] = useState(false);

  const cityInfo = useMemo(
    () => CITIES.find((c) => c.name === selectedCity),
    [selectedCity]
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(true), 2000);
    return () => clearTimeout(timer);
  }, [selectedCity]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 bg-[#030308]"
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <GlobeScene selectedCity={selectedCity} onComplete={onComplete} />
      </Canvas>

      {/* City label overlay */}
      <AnimatePresence>
        {showLabel && cityInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute bottom-20 left-0 right-0 text-center pointer-events-none"
          >
            <p className="text-[10px] tracking-[0.5em] uppercase text-[#00e5c7]/50 font-mono mb-2">
              Target Location
            </p>
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
      </AnimatePresence>

      {/* Scanning text */}
      <div className="absolute top-8 left-0 right-0 text-center pointer-events-none">
        <p className="text-[10px] tracking-[0.5em] uppercase text-white/15 font-mono animate-pulse">
          Scanning Global Network
        </p>
      </div>
    </motion.div>
  );
}
