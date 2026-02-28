"use client";

import { motion } from "framer-motion";

interface BattleTimerProps {
  currentTime: number;
  hasPredicted: boolean;
  accidentOccurred: boolean;
}

export function BattleTimer({ currentTime, hasPredicted, accidentOccurred }: BattleTimerProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col items-center gap-1.5 px-6 py-3 rounded-2xl glass-strong"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black tabular-nums text-foreground tracking-tight">
            {currentTime.toFixed(1)}s
          </span>
          {accidentOccurred && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger"
            >
              CRASH
            </motion.span>
          )}
        </div>

        <p className="text-[11px] text-muted">
          {accidentOccurred
            ? "Crash occurred!"
            : hasPredicted
              ? "Prediction placed — waiting for crash..."
              : "Click to predict the crash location"}
        </p>
      </motion.div>
    </div>
  );
}
