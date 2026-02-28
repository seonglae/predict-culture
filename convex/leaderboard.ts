import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

export const getLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const entries = await ctx.db
      .query("leaderboard")
      .withIndex("by_rank")
      .take(limit ?? 50);

    return entries;
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
        elo: p.elo,
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
