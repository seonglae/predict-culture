import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const submitPrediction = mutation({
  args: {
    battleId: v.id("battles"),
    playerId: v.id("players"),
    coordinates: v.object({ x: v.number(), z: v.number() }),
    predictionTime: v.number(),
  },
  handler: async (ctx, { battleId, playerId, coordinates, predictionTime }) => {
    // Check battle is active
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "active") return null;

    // Check player is in this battle
    if (!battle.playerIds.includes(playerId)) return null;

    // Upsert — allow changing prediction
    const existing = await ctx.db
      .query("predictions")
      .withIndex("by_battle_player", (q) =>
        q.eq("battleId", battleId).eq("playerId", playerId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { coordinates, predictionTime });
      return existing._id;
    }

    return await ctx.db.insert("predictions", {
      battleId,
      playerId,
      coordinates,
      predictionTime,
    });
  },
});

export const getPredictions = query({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    return await ctx.db
      .query("predictions")
      .withIndex("by_battle", (q) => q.eq("battleId", battleId))
      .collect();
  },
});

export const getMyPrediction = query({
  args: {
    battleId: v.id("battles"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { battleId, playerId }) => {
    return await ctx.db
      .query("predictions")
      .withIndex("by_battle_player", (q) =>
        q.eq("battleId", battleId).eq("playerId", playerId)
      )
      .first();
  },
});
