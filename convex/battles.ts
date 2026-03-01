import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateMap } from "./lib/mapGenerator";
import { generateSimulation } from "./lib/simulation";
import type { SceneConfig } from "./lib/types";
import { calculateScore } from "./lib/scoring";
import { multiPlayerGlickoUpdate, type GlickoInput } from "./lib/elo";
import type { Difficulty } from "./lib/types";

export const createBattle = mutation({
  args: {
    playerId: v.id("players"),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("normal"),
      v.literal("hard"),
      v.literal("hell")
    ),
  },
  handler: async (ctx, { playerId, difficulty }) => {
    const mapSeed = Math.floor(Math.random() * 2147483647);

    const battleId = await ctx.db.insert("battles", {
      playerIds: [playerId],
      difficulty,
      mapSeed,
      status: "waiting",
      sceneConfig: null,
      simulationData: null,
      simulationSpeed: 1,
      createdAt: Date.now(),
    });

    // Schedule matchmaking timeout (2 seconds — short wait before adding AI)
    await ctx.scheduler.runAfter(2000, internal.battles.checkMatchmakingTimeout, {
      battleId,
    });

    return battleId;
  },
});

export const joinBattle = mutation({
  args: {
    battleId: v.id("battles"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { battleId, playerId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "waiting") return null;
    if (battle.playerIds.includes(playerId)) return null;

    // Add human player
    const playerIds = [...battle.playerIds, playerId];

    // Add AI agent
    const aiPlayer = await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", "mistral-ai-agent"))
      .first();

    if (aiPlayer && !playerIds.includes(aiPlayer._id)) {
      playerIds.push(aiPlayer._id);
    }

    await ctx.db.patch(battleId, {
      playerIds,
      status: "simulating",
    });

    // Start simulation generation
    await ctx.scheduler.runAfter(0, internal.battles.generateAndStartBattle, {
      battleId,
    });

    return battleId;
  },
});

export const checkMatchmakingTimeout = internalMutation({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "waiting") return;

    // No human opponent found — add AI agent only
    const aiPlayer = await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", "mistral-ai-agent"))
      .first();

    let aiId = aiPlayer?._id;
    if (!aiId) {
      aiId = await ctx.db.insert("players", {
        name: "Mistral AI",
        browserId: "mistral-ai-agent",
        elo: 1500,
        rd: 200,
        volatility: 0.06,
        wins: 0,
        losses: 0,
        draws: 0,
        matchCount: 0,
        isAI: true,
        lastMatchAt: Date.now(),
      });
    }

    const playerIds = [...battle.playerIds];
    if (!playerIds.includes(aiId)) {
      playerIds.push(aiId);
    }

    await ctx.db.patch(battleId, {
      playerIds,
      status: "simulating",
    });

    await ctx.scheduler.runAfter(0, internal.battles.generateAndStartBattle, {
      battleId,
    });
  },
});

export const generateAndStartBattle = internalMutation({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "simulating") return;

    // Schedule the async OSM fetch action — runs concurrently with globe animation on client
    await ctx.scheduler.runAfter(0, internal.actions.fetchOSM.generateMapFromOSM, {
      battleId,
      mapSeed: battle.mapSeed,
      difficulty: battle.difficulty,
    });
  },
});

/** Save OSM data to cache */
export const saveOSMCache = internalMutation({
  args: {
    cityName: v.string(),
    lat: v.number(),
    lon: v.number(),
    ways: v.any(),
  },
  handler: async (ctx, { cityName, lat, lon, ways }) => {
    // Upsert — remove old cache for this city
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

/** Load cached OSM data for a city */
export const getOSMCache = internalMutation({
  args: { cityName: v.string() },
  handler: async (ctx, { cityName }) => {
    return await ctx.db
      .query("osmCache")
      .withIndex("by_city", (q) => q.eq("cityName", cityName))
      .first();
  },
});

/** Set city name early so the client can start globe fly animation */
export const setCityName = internalMutation({
  args: {
    battleId: v.id("battles"),
    cityName: v.string(),
    cityLabel: v.optional(v.string()),
  },
  handler: async (ctx, { battleId, cityName, cityLabel }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle) return;
    const patch: Record<string, string> = { cityName };
    if (cityLabel) patch.cityLabel = cityLabel;
    await ctx.db.patch(battleId, patch);
  },
});

export const setGeneratedBattle = internalMutation({
  args: {
    battleId: v.id("battles"),
    status: v.union(v.literal("active"), v.literal("cancelled")),
    mapSeed: v.optional(v.number()),
    sceneConfig: v.optional(v.any()),
    simulationData: v.optional(v.any()),
    accidentPoint: v.optional(v.object({ x: v.number(), z: v.number() })),
    accidentTime: v.optional(v.number()),
    accidentFrame: v.optional(v.number()),
    totalFrames: v.optional(v.number()),
    cityName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const battle = await ctx.db.get(args.battleId);
    if (!battle) return;

    if (args.status === "cancelled") {
      await ctx.db.patch(args.battleId, { status: "cancelled" });
      return;
    }

    const patch: Record<string, any> = { status: "active" };
    if (args.mapSeed !== undefined) patch.mapSeed = args.mapSeed;
    if (args.sceneConfig !== undefined) patch.sceneConfig = args.sceneConfig;
    if (args.simulationData !== undefined) patch.simulationData = args.simulationData;
    if (args.accidentPoint !== undefined) patch.accidentPoint = args.accidentPoint;
    if (args.accidentTime !== undefined) patch.accidentTime = args.accidentTime;
    if (args.accidentFrame !== undefined) patch.accidentFrame = args.accidentFrame;
    if (args.totalFrames !== undefined) patch.totalFrames = args.totalFrames;
    if (args.cityName !== undefined) {
      patch.cityName = args.cityName;
    }

    // Extract cityLabel from sceneConfig if available
    if (args.sceneConfig?.cityLabel) {
      patch.cityLabel = args.sceneConfig.cityLabel;
    }

    await ctx.db.patch(args.battleId, patch);

    // Schedule AI prediction
    await ctx.scheduler.runAfter(0, internal.battles.scheduleAIPrediction, {
      battleId: args.battleId,
    });
  },
});

export const scheduleAIPrediction = internalMutation({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "active") return;

    const aiPlayer = await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", "mistral-ai-agent"))
      .first();

    if (!aiPlayer || !battle.playerIds.includes(aiPlayer._id)) return;

    const existing = await ctx.db
      .query("predictions")
      .withIndex("by_battle_player", (q) =>
        q.eq("battleId", battleId).eq("playerId", aiPlayer._id)
      )
      .first();

    if (existing) return;

    await ctx.scheduler.runAfter(0, internal.actions.mistralAgent.runMistralAgent, {
      battleId,
      frames: battle.simulationData,
      sceneConfig: battle.sceneConfig,
      difficulty: battle.difficulty,
    });
  },
});

export const findWaitingBattle = query({
  args: {
    playerId: v.id("players"),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("normal"),
      v.literal("hard"),
      v.literal("hell")
    ),
  },
  handler: async (ctx, { playerId, difficulty }) => {
    const battles = await ctx.db
      .query("battles")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    return battles.find(
      (b) => b.difficulty === difficulty && !b.playerIds.includes(playerId)
    );
  },
});

export const getBattle = query({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    return await ctx.db.get(battleId);
  },
});

export const getBattleRatingChanges = query({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    return await ctx.db
      .query("ratingHistory")
      .withIndex("by_battle", (q) => q.eq("battleId", battleId))
      .collect();
  },
});

export const completeBattle = mutation({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "active" || !battle.accidentPoint) return;

    // Get all predictions for this battle
    const predictions = await ctx.db
      .query("predictions")
      .withIndex("by_battle", (q) => q.eq("battleId", battleId))
      .collect();

    // Score each prediction
    const scores: { playerId: Id<"players">; score: number }[] = [];

    for (const pred of predictions) {
      const result = calculateScore(
        pred.coordinates,
        battle.accidentPoint,
        pred.predictionTime,
        battle.accidentTime!,
        (battle.sceneConfig as any)?.mapRadius ?? 20
      );

      await ctx.db.patch(pred._id, {
        score: result.score,
        distanceScore: result.distanceScore,
        timingScore: result.timingScore,
      });

      scores.push({ playerId: pred.playerId, score: result.score });
    }

    // Players who didn't predict get 0
    for (const pid of battle.playerIds) {
      if (!scores.find((s) => s.playerId === pid)) {
        scores.push({ playerId: pid, score: 0 });
      }
    }

    // Sort by score descending for placement
    scores.sort((a, b) => b.score - a.score);

    // Compute multi-player Glicko-2 update
    const playerInputs: { input: GlickoInput; placement: number; id: Id<"players"> }[] = [];

    for (let i = 0; i < scores.length; i++) {
      const player = await ctx.db.get(scores[i].playerId);
      if (!player) continue;

      playerInputs.push({
        input: {
          rating: player.elo,
          rd: player.rd,
          volatility: player.volatility,
          lastMatchAt: player.lastMatchAt,
        },
        placement: i,
        id: player._id,
      });
    }

    const eloResults = multiPlayerGlickoUpdate(playerInputs);

    // Update player ratings and stats
    for (let i = 0; i < playerInputs.length; i++) {
      const pid: Id<"players"> = playerInputs[i].id;
      const result = eloResults[i];
      const placement = playerInputs[i].placement;
      const player = await ctx.db.get(pid);
      if (!player) continue;

      const isWin = placement === 0;
      const isLoss = placement === playerInputs.length - 1;

      await ctx.db.patch(pid, {
        elo: result.newRating,
        rd: result.newRd,
        volatility: result.newVolatility,
        wins: player.wins + (isWin ? 1 : 0),
        losses: player.losses + (isLoss ? 1 : 0),
        draws: player.draws + (!isWin && !isLoss ? 1 : 0),
        matchCount: player.matchCount + 1,
        lastMatchAt: Date.now(),
      });

      // Record rating history
      await ctx.db.insert("ratingHistory", {
        playerId: pid,
        battleId,
        eloBefore: player.elo,
        eloAfter: result.newRating,
        rdBefore: player.rd,
        rdAfter: result.newRd,
        placement,
        totalPlayers: playerInputs.length,
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(battleId, { status: "completed" });

    // Update leaderboard
    await ctx.scheduler.runAfter(0, internal.leaderboard.rebuildLeaderboard, {});
  },
});

export const saveAgentLog = internalMutation({
  args: {
    battleId: v.id("battles"),
    step: v.number(),
    type: v.union(
      v.literal("thinking"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("prediction")
    ),
    content: v.string(),
    toolName: v.optional(v.string()),
    toolArgs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentLogs", { ...args, createdAt: Date.now() });
  },
});

export const getAgentLogs = query({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    return await ctx.db
      .query("agentLogs")
      .withIndex("by_battle_step", (q) => q.eq("battleId", battleId))
      .collect();
  },
});

export const submitAIPrediction = internalMutation({
  args: {
    battleId: v.id("battles"),
    coordinates: v.object({ x: v.number(), z: v.number() }),
    predictionTime: v.number(),
  },
  handler: async (ctx, { battleId, coordinates, predictionTime }) => {
    const aiPlayer = await ctx.db
      .query("players")
      .withIndex("by_browserId", (q) => q.eq("browserId", "mistral-ai-agent"))
      .first();

    if (!aiPlayer) return;

    // Check for existing prediction
    const existing = await ctx.db
      .query("predictions")
      .withIndex("by_battle_player", (q) =>
        q.eq("battleId", battleId).eq("playerId", aiPlayer._id)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("predictions", {
      battleId,
      playerId: aiPlayer._id,
      coordinates,
      predictionTime,
    });
  },
});
