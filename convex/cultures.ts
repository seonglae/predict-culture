import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const createCulture = mutation({
  args: { topic: v.optional(v.string()) },
  handler: async (ctx, { topic }) => {
    const cultureId = await ctx.db.insert("cultures", {
      status: "loading",
      cityName: "",
      topic: topic ?? "random",
      playerCount: 1,
      maxPlayers: 5,
      predictionCount: 0,
      createdAt: Date.now(),
    });

    // Schedule scene generation
    await ctx.scheduler.runAfter(0, internal.actions.generateCultureScene.generate, {
      cultureId,
    });

    return cultureId;
  },
});

export const joinOrCreateRoom = mutation({
  args: { topic: v.optional(v.string()) },
  handler: async (ctx, { topic }) => {
    const t = topic ?? "random";
    const now = Date.now();

    // Look for a recent room that's still accepting players (created within last 10s, not yet running)
    const recentCultures = await ctx.db
      .query("cultures")
      .withIndex("by_status", (q) => q.eq("status", "loading"))
      .collect();

    const joinable = recentCultures.find(
      (c) =>
        c.topic === t &&
        now - c.createdAt < 10000 &&
        (c.playerCount ?? 1) < (c.maxPlayers ?? 5)
    );

    if (joinable) {
      await ctx.db.patch(joinable._id, {
        playerCount: (joinable.playerCount ?? 1) + 1,
      });
      return joinable._id;
    }

    // Also check pick_belief rooms (scene loaded but game not started yet)
    const pickCultures = await ctx.db
      .query("cultures")
      .withIndex("by_status", (q) => q.eq("status", "pick_belief"))
      .collect();

    const joinablePick = pickCultures.find(
      (c) =>
        c.topic === t &&
        now - c.createdAt < 15000 &&
        (c.playerCount ?? 1) < (c.maxPlayers ?? 5)
    );

    if (joinablePick) {
      await ctx.db.patch(joinablePick._id, {
        playerCount: (joinablePick.playerCount ?? 1) + 1,
      });
      return joinablePick._id;
    }

    // No joinable room found — create new
    const cultureId = await ctx.db.insert("cultures", {
      status: "loading",
      cityName: "",
      topic: t,
      playerCount: 1,
      maxPlayers: 5,
      predictionCount: 0,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.actions.generateCultureScene.generate, {
      cultureId,
    });

    return cultureId;
  },
});

export const getCulture = query({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    return await ctx.db.get(cultureId);
  },
});

export const getBots = query({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    return await ctx.db
      .query("bots")
      .withIndex("by_culture", (q) => q.eq("cultureId", cultureId))
      .collect();
  },
});

export const getMessages = query({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    const msgs = await ctx.db
      .query("cultureMessages")
      .withIndex("by_culture_time", (q) => q.eq("cultureId", cultureId))
      .order("desc")
      .take(100);
    return msgs.reverse();
  },
});

// Internal query versions for use by actions (ctx.runQuery)
export const internalGetCulture = internalQuery({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    return await ctx.db.get(cultureId);
  },
});

export const internalGetBots = internalQuery({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    return await ctx.db
      .query("bots")
      .withIndex("by_culture", (q) => q.eq("cultureId", cultureId))
      .collect();
  },
});

export const internalGetMessages = internalQuery({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    const msgs = await ctx.db
      .query("cultureMessages")
      .withIndex("by_culture_time", (q) => q.eq("cultureId", cultureId))
      .order("desc")
      .take(100);
    return msgs.reverse();
  },
});

export const submitPrediction = mutation({
  args: {
    cultureId: v.id("cultures"),
    prediction: v.string(),
  },
  handler: async (ctx, { cultureId, prediction }) => {
    const culture = await ctx.db.get(cultureId);
    if (!culture || culture.status !== "pick_belief") return;
    if (culture.userPrediction) return; // already predicted

    const now = Date.now();

    const newPredCount = (culture.predictionCount ?? 0) + 1;

    await ctx.db.patch(cultureId, {
      userPrediction: prediction,
      predictionCount: newPredCount,
      status: "running",
      gameStartedAt: now,
      gameDuration: 90000, // 1.5 minutes
    });

    // Schedule bot agent loop
    await ctx.scheduler.runAfter(0, internal.actions.cultureAgent.runAgentLoop, {
      cultureId,
    });

    // Add system message (don't reveal the prediction to bots)
    await ctx.db.insert("cultureMessages", {
      cultureId,
      senderId: "system",
      senderName: "System",
      content: `A prediction has been locked in. The debate begins!`,
      type: "system",
      posX: 0,
      posZ: 0,
      createdAt: Date.now(),
    });
  },
});

// Public mutation for user chat messages
export const addUserMessage = mutation({
  args: {
    cultureId: v.id("cultures"),
    content: v.string(),
    posX: v.number(),
    posZ: v.number(),
  },
  handler: async (ctx, { cultureId, content, posX, posZ }) => {
    const culture = await ctx.db.get(cultureId);
    if (!culture || culture.status !== "running") return;

    await ctx.db.insert("cultureMessages", {
      cultureId,
      senderId: "user",
      senderName: "You",
      content,
      type: "speech",
      posX,
      posZ,
      createdAt: Date.now(),
    });
  },
});

// Internal mutations called by actions

export const setCultureScene = internalMutation({
  args: {
    cultureId: v.id("cultures"),
    cityName: v.string(),
    cityLabel: v.optional(v.string()),
    lat: v.optional(v.number()),
    lon: v.optional(v.number()),
    sceneConfig: v.any(),
    beliefs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cultureId, {
      cityName: args.cityName,
      cityLabel: args.cityLabel,
      lat: args.lat,
      lon: args.lon,
      sceneConfig: args.sceneConfig,
      beliefs: args.beliefs,
      status: "pick_belief",
      gameStartedAt: Date.now(),
    });
  },
});

export const spawnBot = internalMutation({
  args: {
    cultureId: v.id("cultures"),
    name: v.string(),
    color: v.string(),
    belief: v.string(),
    posX: v.number(),
    posZ: v.number(),
    heading: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("bots", {
      cultureId: args.cultureId,
      name: args.name,
      color: args.color,
      belief: args.belief,
      originalBelief: args.belief,
      posX: args.posX,
      posZ: args.posZ,
      heading: args.heading,
      state: "idle",
    });
  },
});

export const updateBotPosition = internalMutation({
  args: {
    botId: v.id("bots"),
    posX: v.number(),
    posZ: v.number(),
    heading: v.number(),
    state: v.string(),
  },
  handler: async (ctx, { botId, posX, posZ, heading, state }) => {
    await ctx.db.patch(botId, { posX, posZ, heading, state });
  },
});

export const setBotTarget = internalMutation({
  args: {
    botId: v.id("bots"),
    targetX: v.number(),
    targetZ: v.number(),
    heading: v.number(),
  },
  handler: async (ctx, { botId, targetX, targetZ, heading }) => {
    await ctx.db.patch(botId, {
      targetX,
      targetZ,
      heading,
      moveStartedAt: Date.now(),
      state: "walking",
    });
  },
});

export const snapBotToTarget = internalMutation({
  args: {
    botId: v.id("bots"),
    posX: v.number(),
    posZ: v.number(),
    heading: v.number(),
  },
  handler: async (ctx, { botId, posX, posZ, heading }) => {
    await ctx.db.patch(botId, {
      posX,
      posZ,
      heading,
      targetX: undefined,
      targetZ: undefined,
      moveStartedAt: undefined,
      state: "idle",
    });
  },
});

export const updateBotState = internalMutation({
  args: {
    botId: v.id("bots"),
    state: v.string(),
  },
  handler: async (ctx, { botId, state }) => {
    await ctx.db.patch(botId, { state });
  },
});

export const updateBotBelief = internalMutation({
  args: {
    botId: v.id("bots"),
    newBelief: v.string(),
  },
  handler: async (ctx, { botId, newBelief }) => {
    const bot = await ctx.db.get(botId);
    if (!bot) return;
    await ctx.db.patch(botId, { belief: newBelief });

    // Add belief change message
    await ctx.db.insert("cultureMessages", {
      cultureId: bot.cultureId,
      senderId: botId,
      senderName: bot.name,
      content: `${bot.name} now believes: "${newBelief}" (was: "${bot.belief}")`,
      type: "belief_change",
      posX: bot.posX,
      posZ: bot.posZ,
      createdAt: Date.now(),
    });
  },
});

export const addMessage = internalMutation({
  args: {
    cultureId: v.id("cultures"),
    senderId: v.string(),
    senderName: v.string(),
    content: v.string(),
    type: v.string(),
    posX: v.number(),
    posZ: v.number(),
    targetId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cultureMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const endGame = internalMutation({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    const culture = await ctx.db.get(cultureId);
    if (!culture || culture.status !== "running") return;

    const bots = await ctx.db
      .query("bots")
      .withIndex("by_culture", (q) => q.eq("cultureId", cultureId))
      .collect();

    // Count beliefs to find the dominant one
    const beliefCounts: Record<string, number> = {};
    for (const bot of bots) {
      beliefCounts[bot.belief] = (beliefCounts[bot.belief] ?? 0) + 1;
    }

    let dominantBelief = "";
    let dominantCount = 0;
    for (const [belief, count] of Object.entries(beliefCounts)) {
      if (count > dominantCount) {
        dominantBelief = belief;
        dominantCount = count;
      }
    }

    const total = bots.length;
    const userPrediction = culture.userPrediction ?? "";

    // Score = number of bots whose belief matches user's prediction * 100
    const matchCount = bots.filter((b) => b.belief === userPrediction).length;
    const finalScore = matchCount * 100;

    const resultSummary = `Dominant belief: '${dominantBelief}' held by ${dominantCount}/${total} bots`;

    const userCorrect = userPrediction === dominantBelief;

    await ctx.db.patch(cultureId, {
      status: "ended",
      finalScore,
      resultSummary,
      dominantBelief,
      dominantCount,
    });

    // Add system message
    const verdict = userCorrect
      ? `You predicted correctly! Score: ${finalScore}`
      : `Your prediction didn't win. The dominant belief was: "${dominantBelief}"`;
    await ctx.db.insert("cultureMessages", {
      cultureId,
      senderId: "system",
      senderName: "System",
      content: `Game over! ${verdict}`,
      type: "system",
      posX: 0,
      posZ: 0,
      createdAt: Date.now(),
    });
  },
});

export const setCultureStatus = internalMutation({
  args: {
    cultureId: v.id("cultures"),
    status: v.string(),
  },
  handler: async (ctx, { cultureId, status }) => {
    await ctx.db.patch(cultureId, { status });
  },
});

// OSM cache (moved from battles.ts)
export const saveOSMCache = internalMutation({
  args: { cityName: v.string(), lat: v.number(), lon: v.number(), ways: v.any() },
  handler: async (ctx, { cityName, lat, lon, ways }) => {
    const existing = await ctx.db
      .query("osmCache")
      .withIndex("by_city", (q) => q.eq("cityName", cityName))
      .first();
    if (existing) {
      await ctx.db.replace(existing._id, { cityName, lat, lon, ways, createdAt: Date.now() });
    } else {
      await ctx.db.insert("osmCache", { cityName, lat, lon, ways, createdAt: Date.now() });
    }
  },
});

export const getOSMCache = internalMutation({
  args: { cityName: v.string() },
  handler: async (ctx, { cityName }) => {
    return await ctx.db
      .query("osmCache")
      .withIndex("by_city", (q) => q.eq("cityName", cityName))
      .first();
  },
});
