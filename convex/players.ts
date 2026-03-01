import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { INITIAL_ELO, INITIAL_RD, INITIAL_VOLATILITY } from "./lib/elo";

export const getOrCreatePlayer = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();

    if (existing) return existing;

    const id = await ctx.db.insert("players", {
      name,
      elo: INITIAL_ELO,
      rd: INITIAL_RD,
      volatility: INITIAL_VOLATILITY,
      matchCount: 0,
      wins: 0,
      losses: 0,
      lastMatchAt: Date.now(),
      createdAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

export const getPlayer = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("players")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});

export const getLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("players")
      .withIndex("by_elo")
      .order("desc")
      .take(20);
  },
});

export const getPlayerHistory = query({
  args: { playerName: v.string() },
  handler: async (ctx, { playerName }) => {
    return await ctx.db
      .query("ratingHistory")
      .withIndex("by_player", (q) => q.eq("playerName", playerName))
      .order("desc")
      .take(20);
  },
});

export const updatePlayerRating = internalMutation({
  args: {
    playerName: v.string(),
    cultureId: v.id("cultures"),
    won: v.boolean(),
    accuracyFactor: v.number(),
    newElo: v.number(),
    newRd: v.number(),
    newVolatility: v.number(),
    eloChange: v.number(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_name", (q) => q.eq("name", args.playerName))
      .first();

    if (!player) return;

    const now = Date.now();

    // Update player
    await ctx.db.patch(player._id, {
      elo: args.newElo,
      rd: args.newRd,
      volatility: args.newVolatility,
      matchCount: player.matchCount + 1,
      wins: player.wins + (args.won ? 1 : 0),
      losses: player.losses + (args.won ? 0 : 1),
      lastMatchAt: now,
    });

    // Record history
    await ctx.db.insert("ratingHistory", {
      playerName: args.playerName,
      cultureId: args.cultureId,
      eloBefore: player.elo,
      eloAfter: args.newElo,
      rdBefore: player.rd,
      rdAfter: args.newRd,
      won: args.won,
      accuracyFactor: args.accuracyFactor,
      eloChange: args.eloChange,
      createdAt: now,
    });
  },
});
