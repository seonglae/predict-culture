"use client";

import { motion } from "framer-motion";

interface GlobeMiniProps {
  cityName?: string;
  cityLabel?: string;
}

export function GlobeMini({ cityName, cityLabel }: GlobeMiniProps) {
  if (!cityName) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-4 left-4 z-30 flex items-center gap-3"
    >
      {/* Mini globe */}
      <div className="relative w-10 h-10 flex-shrink-0">
        <div
          className="absolute inset-0 rounded-full border border-white/10"
          style={{
            background: "radial-gradient(circle at 35% 35%, #1a2a3a, #0a0a1a)",
          }}
        />
        {/* Rotating grid overlay */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            animation: "globe-spin 8s linear infinite",
          }}
        >
          {/* Horizontal lines */}
          {[25, 50, 75].map((top) => (
            <div
              key={top}
              className="absolute left-0 right-0 h-px bg-white/10"
              style={{ top: `${top}%` }}
            />
          ))}
          {/* Vertical lines */}
          {[25, 50, 75].map((left) => (
            <div
              key={left}
              className="absolute top-0 bottom-0 w-px bg-white/10"
              style={{ left: `${left}%` }}
            />
          ))}
        </div>
        {/* City dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00e5c7] shadow-[0_0_6px_rgba(0,229,199,0.6)]" />
      </div>

      {/* City text */}
      <div className="flex flex-col">
        <span
          className="text-xs text-white/80 tracking-wide leading-tight"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          {cityName}
        </span>
        {cityLabel && (
          <span className="text-[9px] text-white/30 font-mono tracking-wider">
            {cityLabel}
          </span>
        )}
      </div>

      <style jsx>{`
        @keyframes globe-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
}
