"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/ui/Header";
import { WaveField } from "@/components/ui/WaveField";
import { getTier, getTierColor } from "@/lib/tiers";

function MatchHistoryModal({
  playerName,
  playerElo,
  onClose,
}: {
  playerName: string;
  playerElo: number;
  onClose: () => void;
}) {
  const matches = useQuery(api.players.getPlayerHistory, { playerName });
  const tier = getTier(playerElo);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto rounded-2xl bg-[#0a0a12] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-[#0a0a12]/95 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{playerName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-mono ${tier.tw}`}>
                  {tier.icon} {tier.name} - {Math.round(playerElo)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors text-2xl leading-none cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {!matches && (
            <div className="py-8 text-center text-white/30 text-sm font-mono">Loading...</div>
          )}
          {matches && matches.length === 0 && (
            <div className="py-8 text-center text-white/30 text-sm font-mono">No matches yet</div>
          )}
          {matches?.map((m, i) => {
            const isWin = m.won === true;
            const resultLabel = isWin ? "W" : "L";
            const resultColor = isWin
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/20 text-red-400 border-red-500/30";
            const eloChange = (m.eloAfter ?? 0) - (m.eloBefore ?? 0);
            const changeColor = eloChange > 0 ? "text-emerald-400" : eloChange < 0 ? "text-red-400" : "text-white/30";

            return (
              <div
                key={`${m._id}-${i}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5"
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${resultColor}`}>
                  {resultLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/30 font-mono">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono font-bold ${changeColor}`}>
                    {eloChange > 0 ? "+" : ""}{Math.round(eloChange)}
                  </div>
                  <div className="text-[10px] text-white/30 font-mono">
                    {Math.round(m.eloAfter ?? 0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.04,
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

export default function LeaderboardPage() {
  const leaderboard = useQuery(api.players.getLeaderboard);

  const [selectedPlayer, setSelectedPlayer] = useState<{
    name: string;
    elo: number;
  } | null>(null);

  const handleRowClick = useCallback((entry: any) => {
    setSelectedPlayer({ name: entry.name, elo: entry.elo });
  }, []);

  return (
    <div className="min-h-screen bg-[#06060c]">
      <WaveField />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4 max-w-3xl mx-auto">
        <motion.div
          initial={{ y: -15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h1
            className="text-4xl md:text-5xl font-bold tracking-wide text-white"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Leaderboard
          </h1>
          <p className="text-sm text-white/30 mt-2 font-mono tracking-wider">
            {leaderboard?.length ?? 0} ranked players
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-white/10 bg-[#0a0a12] overflow-hidden"
        >
          <div className="grid grid-cols-[48px_1fr_72px_90px_56px] md:grid-cols-[56px_1fr_100px_110px_72px] gap-2 px-4 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/10">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">MMR</span>
            <span className="text-right">W / L</span>
            <span className="text-right">Games</span>
          </div>

          {leaderboard?.map((entry, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const medalColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
            const tier = getTier(entry.elo);

            return (
              <motion.div
                key={entry._id}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={rowVariants}
                onClick={() => handleRowClick(entry)}
                className={`grid grid-cols-[48px_1fr_72px_90px_56px] md:grid-cols-[56px_1fr_100px_110px_72px] gap-2 px-4 py-3 text-sm items-center cursor-pointer transition-colors border-b border-white/5 last:border-0 ${
                  isTop3
                    ? "bg-gradient-to-r from-transparent via-white/[0.02] to-transparent hover:via-white/[0.04]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className="font-bold"
                  style={{ color: isTop3 ? medalColors[rank - 1] : undefined }}
                >
                  {isTop3 ? (
                    <span className="text-lg">
                      {rank === 1 ? "\u265B" : rank === 2 ? "\u265B" : "\u265B"}
                    </span>
                  ) : (
                    <span className="text-white/30">#{rank}</span>
                  )}
                </span>

                <div className="min-w-0">
                  <div className="font-medium text-white/80 truncate">{entry.name}</div>
                  <span className={`text-[10px] font-mono ${tier.tw}`}>
                    {tier.icon} {tier.name}
                  </span>
                </div>

                <span
                  className="text-right font-mono font-semibold"
                  style={{ color: getTierColor(entry.elo) }}
                >
                  {Math.round(entry.elo)}
                </span>

                <span className="text-right font-mono text-xs">
                  <span className="text-emerald-400">{entry.wins}</span>
                  <span className="text-white/20"> / </span>
                  <span className="text-red-400">{entry.losses}</span>
                </span>

                <span className="text-right text-white/30 font-mono text-xs">
                  {entry.matchCount}
                </span>
              </motion.div>
            );
          })}

          {(!leaderboard || leaderboard.length === 0) && (
            <div className="py-16 text-center">
              <p className="text-white/40 text-lg mb-2">No battles fought yet</p>
              <p className="text-white/20 text-sm font-mono">
                Play a match to appear on the leaderboard
              </p>
            </div>
          )}
        </motion.div>
      </main>

      <AnimatePresence>
        {selectedPlayer && (
          <MatchHistoryModal
            playerName={selectedPlayer.name}
            playerElo={selectedPlayer.elo}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
