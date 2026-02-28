"use client";

import { motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";

interface PlayerResult {
  name: string;
  score: number;
  distanceScore: number;
  timingScore: number;
  eloChange: number;
  elo: number;
  isAI: boolean;
  isYou: boolean;
  placement: number;
}

interface BattleResultProps {
  results: PlayerResult[];
  onPlayAgain: () => void;
}

const PLACEMENT_COLORS = ["#ffd700", "#c0c0c0", "#cd7f32"];
const PLACEMENT_LABELS = ["1st", "2nd", "3rd"];

export function BattleResult({ results, onPlayAgain }: BattleResultProps) {
  const sorted = [...results].sort((a, b) => a.placement - b.placement);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25 }}
        className="w-full max-w-lg mx-4 p-8 rounded-2xl bg-card border border-border"
      >
        <h2 className="text-2xl font-bold text-center mb-6 bg-gradient-to-r from-accent-teal to-accent-orange bg-clip-text text-transparent">
          Battle Results
        </h2>

        <div className="space-y-3 mb-8">
          {sorted.map((player, i) => (
            <motion.div
              key={i}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.15 }}
              className={`flex items-center gap-4 p-4 rounded-xl border ${
                player.isYou
                  ? "border-accent-teal bg-accent-teal/5"
                  : "border-border bg-background"
              }`}
            >
              {/* Placement */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                style={{
                  backgroundColor: PLACEMENT_COLORS[player.placement] ?? "#6b6b80",
                  color: player.placement === 0 ? "#000" : "#fff",
                }}
              >
                {PLACEMENT_LABELS[player.placement] ?? `${player.placement + 1}th`}
              </div>

              {/* Player info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {player.name}
                  </span>
                  {player.isAI && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-accent-purple/20 text-accent-purple">
                      AI
                    </span>
                  )}
                  {player.isYou && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-accent-teal/20 text-accent-teal">
                      You
                    </span>
                  )}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-muted">
                  <span>Score: {player.score}</span>
                  <span>Dist: {player.distanceScore}</span>
                  <span>Time: {player.timingScore}</span>
                </div>
              </div>

              {/* ELO change */}
              <div className="text-right">
                <div className="text-sm text-muted">ELO {player.elo}</div>
                <div
                  className={`text-sm font-bold ${
                    player.eloChange > 0
                      ? "text-success"
                      : player.eloChange < 0
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {player.eloChange > 0 ? "+" : ""}
                  {player.eloChange}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <GlowButton
          variant="teal"
          size="lg"
          className="w-full"
          onClick={onPlayAgain}
        >
          Play Again
        </GlowButton>
      </motion.div>
    </motion.div>
  );
}
