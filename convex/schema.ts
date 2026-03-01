import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    name: v.string(),
    browserId: v.string(),
    elo: v.number(),
    rd: v.number(),
    volatility: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    matchCount: v.number(),
    isAI: v.boolean(),
    lastMatchAt: v.number(),
  })
    .index("by_browserId", ["browserId"])
    .index("by_elo", ["elo"])
    .index("by_isAI", ["isAI"]),

  battles: defineTable({
    playerIds: v.array(v.id("players")),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("normal"),
      v.literal("hard"),
      v.literal("hell")
    ),
    mapSeed: v.number(),
    status: v.union(
      v.literal("waiting"),
      v.literal("simulating"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    sceneConfig: v.any(),
    simulationData: v.optional(v.any()),
    accidentPoint: v.optional(v.object({ x: v.number(), z: v.number() })),
    accidentTime: v.optional(v.number()),
    accidentFrame: v.optional(v.number()),
    simulationSpeed: v.number(),
    totalFrames: v.optional(v.number()),
    cityName: v.optional(v.string()),
    cityLabel: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  predictions: defineTable({
    battleId: v.id("battles"),
    playerId: v.id("players"),
    coordinates: v.object({ x: v.number(), z: v.number() }),
    predictionTime: v.number(),
    score: v.optional(v.number()),
    distanceScore: v.optional(v.number()),
    timingScore: v.optional(v.number()),
  })
    .index("by_battle", ["battleId"])
    .index("by_battle_player", ["battleId", "playerId"]),

  leaderboard: defineTable({
    playerId: v.id("players"),
    elo: v.number(),
    rank: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    matchCount: v.number(),
    name: v.string(),
  })
    .index("by_elo", ["elo"])
    .index("by_rank", ["rank"])
    .index("by_player", ["playerId"]),

  ratingHistory: defineTable({
    playerId: v.id("players"),
    battleId: v.id("battles"),
    eloBefore: v.number(),
    eloAfter: v.number(),
    rdBefore: v.number(),
    rdAfter: v.number(),
    placement: v.number(),
    totalPlayers: v.number(),
    createdAt: v.number(),
  })
    .index("by_player", ["playerId"])
    .index("by_battle", ["battleId"]),

  agentLogs: defineTable({
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
    createdAt: v.number(),
  })
    .index("by_battle", ["battleId"])
    .index("by_battle_step", ["battleId", "step"]),

  osmCache: defineTable({
    cityName: v.string(),
    lat: v.number(),
    lon: v.number(),
    ways: v.any(),
    createdAt: v.number(),
  })
    .index("by_city", ["cityName"]),
});
