import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { INITIAL_ELO, INITIAL_RD, INITIAL_VOLATILITY } from "./lib/elo";

export const registerOrGet = mutation({
  args: {
    name: v.string(),
    browserId: v.string(),
  },
  handler: async (ctx, { name, browserId }) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", browserId))
      .first();

    if (existing) {
      // Update name if changed
      if (existing.name !== name) {
        await ctx.db.patch(existing._id, { name });
      }
      return existing._id;
    }

    return await ctx.db.insert("players", {
      name,
      browserId,
      elo: INITIAL_ELO,
      rd: INITIAL_RD,
      volatility: INITIAL_VOLATILITY,
      wins: 0,
      losses: 0,
      draws: 0,
      matchCount: 0,
      isAI: false,
      lastMatchAt: Date.now(),
    });
  },
});

export const getByBrowserId = query({
  args: { browserId: v.string() },
  handler: async (ctx, { browserId }) => {
    return await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", browserId))
      .first();
  },
});

export const getPlayer = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db.get(playerId);
  },
});

export const ensureAIAgent = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", "mistral-ai-agent"))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("players", {
      name: "Mistral AI",
      browserId: "mistral-ai-agent",
      elo: INITIAL_ELO,
      rd: INITIAL_RD,
      volatility: INITIAL_VOLATILITY,
      wins: 0,
      losses: 0,
      draws: 0,
      matchCount: 0,
      isAI: true,
      lastMatchAt: Date.now(),
    });
  },
});
