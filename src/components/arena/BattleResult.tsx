"use client";

import { motion } from "framer-motion";

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

export function BattleResult({ results, onPlayAgain }: BattleResultProps) {
  const sorted = [...results].sort((a, b) => a.placement - b.placement);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="w-full max-w-sm mx-4">
        <div className="entry-card relative rounded-3xl">
          <div className="relative z-10 p-7">
            <h2
              className="text-[10px] font-mono mb-5 text-foreground/30 uppercase tracking-[0.2em]"
            >
              Results
            </h2>

            <div className="space-y-2 mb-6">
              {sorted.map((player, i) => (
                <motion.div
                  key={i}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 py-3 px-3 rounded-xl"
                  style={{
                    background: player.isYou
                      ? "rgba(0, 229, 199, 0.04)"
                      : "transparent",
                  }}
                >
                  {/* Placement */}
                  <span
                    className="text-sm font-mono font-bold w-6 text-center"
                    style={{
                      color: player.placement === 0
                        ? "var(--accent-teal)"
                        : "var(--muted)",
                    }}
                  >
                    {player.placement + 1}
                  </span>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-foreground/80 truncate">
                        {player.name}
                      </span>
                      {player.isAI && (
                        <span className="text-[9px] font-mono text-foreground/25 uppercase">
                          ai
                        </span>
                      )}
                      {player.isYou && (
                        <span className="text-[9px] font-mono text-foreground/25 uppercase">
                          you
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[10px] font-mono text-foreground/20">
                      <span>{player.score} pts</span>
                      <span>d:{player.distanceScore}</span>
                      <span>t:{player.timingScore}</span>
                    </div>
                  </div>

                  {/* ELO */}
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-foreground/20">
                      {player.elo}
                    </div>
                    <div
                      className="text-xs font-mono font-bold"
                      style={{
                        color:
                          player.eloChange > 0
                            ? "var(--success)"
                            : player.eloChange < 0
                              ? "var(--danger)"
                              : "var(--muted)",
                      }}
                    >
                      {player.eloChange > 0 ? "+" : ""}
                      {player.eloChange}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={onPlayAgain}
              className="entry-submit w-full py-3 rounded-xl text-sm font-mono font-bold tracking-wider uppercase transition-all cursor-pointer text-foreground/70 hover:text-foreground/90"
            >
              Again
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
