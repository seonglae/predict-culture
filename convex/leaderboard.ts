import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const getLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const entries = await ctx.db
      .query("leaderboard")
      .withIndex("by_rank")
      .take(limit ?? 100);

    return entries;
  },
});

/** Get match history for a specific player */
export const getMatchHistory = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    // Get rating history entries for this player (most recent first)
    const history = await ctx.db
      .query("ratingHistory")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .order("desc")
      .take(20);

    // Enrich with battle data
    const matches = [];
    for (const h of history) {
      const battle = await ctx.db.get(h.battleId);
      if (!battle) continue;

      // Find opponent(s) in this battle
      const opponents: { name: string; isAI: boolean }[] = [];
      for (const pid of battle.playerIds) {
        if (pid === playerId) continue;
        const player = await ctx.db.get(pid);
        if (player) {
          opponents.push({ name: player.name, isAI: player.isAI });
        }
      }

      // Get this player's prediction score
      const prediction = await ctx.db
        .query("predictions")
        .withIndex("by_battle_player", (q) =>
          q.eq("battleId", h.battleId).eq("playerId", playerId)
        )
        .first();

      matches.push({
        battleId: h.battleId,
        eloBefore: h.eloBefore,
        eloAfter: h.eloAfter,
        eloChange: h.eloAfter - h.eloBefore,
        placement: h.placement,
        totalPlayers: h.totalPlayers,
        score: prediction?.score ?? 0,
        distanceScore: prediction?.distanceScore ?? 0,
        timingScore: prediction?.timingScore ?? 0,
        opponents,
        cityName: battle.cityName ?? "Unknown",
        difficulty: battle.difficulty,
        createdAt: h.createdAt,
      });
    }

    return matches;
  },
});

/** ELO distribution stats for visualization */
export const getEloStats = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db
      .query("players")
      .collect();

    const eligible = players.filter((p) => !p.isAI && p.matchCount > 0);
    if (eligible.length === 0) {
      return { count: 0, min: 1500, max: 1500, avg: 1500, histogram: [] };
    }

    const elos = eligible.map((p) => Math.round(p.elo));
    const min = Math.min(...elos);
    const max = Math.max(...elos);
    const avg = Math.round(elos.reduce((s, e) => s + e, 0) / elos.length);

    // Build histogram with 25-point buckets
    const bucketSize = 25;
    const bucketMin = Math.floor(min / bucketSize) * bucketSize;
    const bucketMax = Math.ceil(max / bucketSize) * bucketSize;
    const histogram: { elo: number; count: number }[] = [];
    for (let e = bucketMin; e <= bucketMax; e += bucketSize) {
      histogram.push({
        elo: e,
        count: elos.filter((x) => x >= e && x < e + bucketSize).length,
      });
    }

    return { count: eligible.length, min, max, avg, histogram };
  },
});

export const rebuildLeaderboard = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear existing leaderboard
    const existing = await ctx.db.query("leaderboard").collect();
    for (const entry of existing) {
      await ctx.db.delete(entry._id);
    }

    // Get all non-AI players with at least 1 match
    const players = await ctx.db.query("players").collect();
    const eligiblePlayers = players
      .filter((p) => !p.isAI && p.matchCount > 0)
      .sort((a, b) => b.elo - a.elo);

    // Insert ranked entries
    for (let i = 0; i < eligiblePlayers.length; i++) {
      const p = eligiblePlayers[i];
      await ctx.db.insert("leaderboard", {
        playerId: p._id,
        elo: Math.round(p.elo),
        rank: i + 1,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        matchCount: p.matchCount,
        name: p.name,
      });
    }
  },
});
