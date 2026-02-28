"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { GeoGlobe } from "./GeoGlobe";

interface MatchmakingProps {
  onTimeout?: () => void;
  opponentFound?: boolean;
  opponentName?: string;
  showGlobe?: boolean;
}

const CITY_COORDS = [
  { lat: 40.758, lon: -73.9855 },
  { lat: 51.5074, lon: -0.1278 },
  { lat: 48.8606, lon: 2.3376 },
  { lat: 35.6595, lon: 139.7004 },
  { lat: 1.2838, lon: 103.8591 },
  { lat: 34.0407, lon: -118.2468 },
  { lat: 37.7879, lon: -122.4074 },
];

export function Matchmaking({ onTimeout, opponentFound, opponentName, showGlobe }: MatchmakingProps) {
  const [countdown, setCountdown] = useState(5);

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#030308]"
    >
      {/* Globe — full screen canvas, globe centered */}
      {showGlobe && (
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <GeoGlobe radius={1.2} spinSpeed={0.3} cities={CITY_COORDS} />
        </Canvas>
      )}

      {/* Radar pulse fallback when no globe */}
      {!showGlobe && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-40 h-40">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border-2 border-[#00e5c7]"
                initial={{ scale: 0.3, opacity: 1 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-[#00e5c7]" />
            </div>
          </div>
        </div>
      )}

      {/* Text overlay — bottom center */}
      <div className="absolute inset-x-0 bottom-16 z-10 pointer-events-none">
        {opponentFound ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <p className="text-2xl font-bold text-[#00e5c7] mb-2">Opponent Found!</p>
            <p className="text-lg text-white/70">{opponentName}</p>
          </motion.div>
        ) : (
          <div className="text-center">
            <p className="text-lg text-white/60 mb-2 font-mono">Finding opponent...</p>
            <p className="text-white/25 text-xs font-mono">
              {countdown > 0 ? `${countdown}s` : "Starting with AI..."}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
