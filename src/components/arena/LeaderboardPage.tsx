"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/ui/Header";
import { WaveField } from "@/components/ui/WaveField";
import { Badge } from "@/components/ui/Badge";
import { getTier, getTierColor } from "@/lib/tiers";
import type { Id } from "@convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Match History Modal
// ---------------------------------------------------------------------------

function MatchHistoryModal({
  playerId,
  playerName,
  playerElo,
  onClose,
}: {
  playerId: Id<"players">;
  playerName: string;
  playerElo: number;
  onClose: () => void;
}) {
  const matches = useQuery(api.leaderboard.getMatchHistory, { playerId });

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
        className="w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">{playerName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge elo={playerElo} showElo />
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground transition-colors text-2xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Match list */}
        <div className="p-4 space-y-2">
          {!matches && (
            <div className="py-8 text-center text-muted text-sm">Loading...</div>
          )}
          {matches && matches.length === 0 && (
            <div className="py-8 text-center text-muted text-sm">No matches yet</div>
          )}
          {matches?.map((m: any, i: number) => {
            const isWin = m.placement === 0;
            const isLoss = m.placement === m.totalPlayers - 1;
            const resultLabel = isWin ? "W" : isLoss ? "L" : "D";
            const resultColor = isWin
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : isLoss
                ? "bg-red-500/20 text-red-400 border-red-500/30"
                : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";

            const changeColor =
              m.eloChange > 0
                ? "text-emerald-400"
                : m.eloChange < 0
                  ? "text-red-400"
                  : "text-muted";

            return (
              <div
                key={`${m.battleId}-${i}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background/50 border border-border/50"
              >
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${resultColor}`}
                >
                  {resultLabel}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {m.cityName}
                    </span>
                    <span className="text-[10px] text-muted font-mono uppercase">
                      {m.difficulty}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    vs {m.opponents?.map((o: any) => o.name).join(", ") || "?"}
                    {" \u00B7 "}
                    Score: {m.score}
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-sm font-mono font-bold ${changeColor}`}>
                    {m.eloChange > 0 ? "+" : ""}
                    {Math.round(m.eloChange)}
                  </div>
                  <div className="text-[10px] text-muted font-mono">
                    {Math.round(m.eloAfter)}
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

// ---------------------------------------------------------------------------
// ELO Distribution Bar
// ---------------------------------------------------------------------------

function EloDistributionBar({
  stats,
}: {
  stats: {
    count: number;
    min: number;
    max: number;
    avg: number;
    histogram: { elo: number; count: number }[];
  };
}) {
  if (stats.count === 0 || stats.histogram.length === 0) return null;

  const maxCount = Math.max(...stats.histogram.map((b) => b.count));

  return (
    <div className="rounded-xl bg-card border border-border p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          MMR Distribution
        </span>
        <span className="text-xs text-muted font-mono">
          {stats.count} players &middot; avg {stats.avg}
        </span>
      </div>

      <div className="flex items-end gap-px h-16">
        {stats.histogram.map((bucket, i) => {
          const height = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all"
              style={{
                height: `${Math.max(height, 2)}%`,
                backgroundColor: getTierColor(bucket.elo),
                opacity: bucket.count > 0 ? 0.7 : 0.15,
              }}
              title={`${bucket.elo}: ${bucket.count} players`}
            />
          );
        })}
      </div>

      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted font-mono">{stats.min}</span>
        <span className="text-[10px] text-muted font-mono">{stats.max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row animation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const leaderboard = useQuery(api.leaderboard.getLeaderboard, { limit: 100 });
  const eloStats = useQuery(api.leaderboard.getEloStats, {});

  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: Id<"players">;
    name: string;
    elo: number;
  } | null>(null);

  const handleRowClick = useCallback((entry: any) => {
    setSelectedPlayer({
      id: entry.playerId,
      name: entry.name,
      elo: entry.elo,
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <WaveField />
      <Header />

      <main className="relative z-10 pt-24 pb-12 px-4 max-w-3xl mx-auto">
        {/* Title */}
        <motion.div
          initial={{ y: -15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h1
            className="text-4xl md:text-5xl font-bold tracking-wide"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Leaderboard
          </h1>
          <p className="text-sm text-muted mt-2 font-mono tracking-wider">
            {leaderboard?.length ?? 0} ranked players
          </p>
        </motion.div>

        {/* ELO Distribution */}
        {eloStats && eloStats.count > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <EloDistributionBar stats={eloStats} />
          </motion.div>
        )}

        {/* Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-border bg-card overflow-hidden"
        >
          {/* Header */}
          <div className="grid grid-cols-[48px_1fr_72px_90px_56px] md:grid-cols-[56px_1fr_100px_110px_72px] gap-2 px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">MMR</span>
            <span className="text-right">W / L / D</span>
            <span className="text-right">Games</span>
          </div>

          {/* Rows */}
          {leaderboard?.map((entry: any, i: number) => {
            const isTop3 = entry.rank <= 3;
            const medalColors = ["#ffd700", "#c0c0c0", "#cd7f32"];

            return (
              <motion.div
                key={entry._id}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={rowVariants}
                onClick={() => handleRowClick(entry)}
                className={`grid grid-cols-[48px_1fr_72px_90px_56px] md:grid-cols-[56px_1fr_100px_110px_72px] gap-2 px-4 py-3 text-sm items-center cursor-pointer transition-colors border-b border-border/30 last:border-0 ${
                  isTop3
                    ? "bg-gradient-to-r from-transparent via-white/[0.02] to-transparent hover:via-white/[0.04]"
                    : "hover:bg-card-hover"
                }`}
              >
                {/* Rank */}
                <span
                  className="font-bold"
                  style={{
                    color: isTop3 ? medalColors[entry.rank - 1] : undefined,
                  }}
                >
                  {isTop3 ? (
                    <span className="text-lg">
                      {entry.rank === 1 ? "\u2655" : entry.rank === 2 ? "\u2655" : "\u2655"}
                    </span>
                  ) : (
                    <span className="text-muted">#{entry.rank}</span>
                  )}
                </span>

                {/* Player */}
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {entry.name}
                  </div>
                  <Badge elo={entry.elo} size="sm" />
                </div>

                {/* MMR */}
                <span
                  className="text-right font-mono font-semibold"
                  style={{ color: getTierColor(entry.elo) }}
                >
                  {Math.round(entry.elo)}
                </span>

                {/* W/L/D */}
                <span className="text-right font-mono text-xs">
                  <span className="text-emerald-400">{entry.wins}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-red-400">{entry.losses}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-yellow-400">{entry.draws}</span>
                </span>

                {/* Games */}
                <span className="text-right text-muted font-mono text-xs">
                  {entry.matchCount}
                </span>
              </motion.div>
            );
          })}

          {/* Empty */}
          {(!leaderboard || leaderboard.length === 0) && (
            <div className="py-16 text-center">
              <p className="text-muted text-lg mb-2">No battles fought yet</p>
              <p className="text-muted/60 text-sm">
                Play a match to appear on the leaderboard
              </p>
            </div>
          )}
        </motion.div>
      </main>

      {/* Match History Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <MatchHistoryModal
            playerId={selectedPlayer.id}
            playerName={selectedPlayer.name}
            playerElo={selectedPlayer.elo}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes shimmer {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 200% 50%;
          }
        }
      `}</style>
    </div>
  );
}
