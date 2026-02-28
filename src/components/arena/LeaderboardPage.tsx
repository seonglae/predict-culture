"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion } from "framer-motion";
import { NoiseOverlay } from "@/components/ui/NoiseOverlay";
import { Header } from "@/components/ui/Header";

export default function LeaderboardPage() {
  const leaderboard = useQuery(api.leaderboard.getLeaderboard, { limit: 50 });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NoiseOverlay />

      <main className="pt-24 pb-12 px-4 max-w-3xl mx-auto">
        <motion.h1
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-accent-teal to-accent-orange bg-clip-text text-transparent"
        >
          Leaderboard
        </motion.h1>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[60px_1fr_80px_100px_80px] gap-2 px-4 py-3 text-xs font-semibold text-muted border-b border-border">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">ELO</span>
            <span className="text-right">W/L/D</span>
            <span className="text-right">Matches</span>
          </div>

          {leaderboard?.map((entry: any, i: number) => (
            <motion.div
              key={entry._id}
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="grid grid-cols-[60px_1fr_80px_100px_80px] gap-2 px-4 py-3 text-sm items-center hover:bg-card-hover transition-colors border-b border-border/50 last:border-0"
            >
              <span
                className="font-bold"
                style={{
                  color:
                    entry.rank === 1
                      ? "#ffd700"
                      : entry.rank === 2
                        ? "#c0c0c0"
                        : entry.rank === 3
                          ? "#cd7f32"
                          : "inherit",
                }}
              >
                #{entry.rank}
              </span>
              <span className="font-medium text-foreground truncate">
                {entry.name}
              </span>
              <span className="text-right font-mono text-accent-teal">
                {entry.elo}
              </span>
              <span className="text-right text-muted">
                {entry.wins}/{entry.losses}/{entry.draws}
              </span>
              <span className="text-right text-muted">{entry.matchCount}</span>
            </motion.div>
          ))}

          {(!leaderboard || leaderboard.length === 0) && (
            <div className="py-12 text-center text-muted">
              No battles fought yet. Be the first!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
