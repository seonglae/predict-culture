import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  osmCache: defineTable({
    cityName: v.string(),
    lat: v.number(),
    lon: v.number(),
    ways: v.any(),
    createdAt: v.number(),
  }).index("by_city", ["cityName"]),

  cultures: defineTable({
    status: v.string(),
    cityName: v.string(),
    cityLabel: v.optional(v.string()),
    lat: v.optional(v.number()),
    lon: v.optional(v.number()),
    sceneConfig: v.optional(v.any()),
    beliefs: v.optional(v.array(v.string())),
    topic: v.optional(v.string()),
    userPrediction: v.optional(v.string()),
    userBelief: v.optional(v.string()),
    pickTime: v.optional(v.number()),
    gameStartedAt: v.optional(v.number()),
    gameDuration: v.optional(v.number()),
    finalScore: v.optional(v.number()),
    resultSummary: v.optional(v.string()),
    predictionScore: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  bots: defineTable({
    cultureId: v.id("cultures"),
    name: v.string(),
    color: v.string(),
    belief: v.string(),
    originalBelief: v.string(),
    posX: v.number(),
    posZ: v.number(),
    targetX: v.optional(v.number()),
    targetZ: v.optional(v.number()),
    moveStartedAt: v.optional(v.number()),
    heading: v.number(),
    state: v.string(),
  }).index("by_culture", ["cultureId"]),

  cultureMessages: defineTable({
    cultureId: v.id("cultures"),
    senderId: v.string(),
    senderName: v.string(),
    content: v.string(),
    type: v.string(),
    posX: v.number(),
    posZ: v.number(),
    targetId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_culture_time", ["cultureId", "createdAt"]),
});
