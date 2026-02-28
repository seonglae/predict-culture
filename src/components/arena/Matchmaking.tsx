"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface MatchmakingProps {
  onTimeout?: () => void;
  opponentFound?: boolean;
  opponentName?: string;
}

export function Matchmaking({ onTimeout, opponentFound, opponentName }: MatchmakingProps) {
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
    >
      {/* Radar animation */}
      <div className="relative w-40 h-40 mb-8">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border-2 border-accent-teal"
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeOut",
            }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-accent-teal" />
        </div>
      </div>

      {opponentFound ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <p className="text-2xl font-bold text-accent-teal mb-2">
            Opponent Found!
          </p>
          <p className="text-lg text-foreground">{opponentName}</p>
        </motion.div>
      ) : (
        <div className="text-center">
          <p className="text-lg text-foreground mb-2">Finding opponent...</p>
          <p className="text-muted text-sm">
            {countdown > 0
              ? `Waiting ${countdown}s for human opponent`
              : "Starting with AI opponent..."}
          </p>
        </div>
      )}
    </motion.div>
  );
}
