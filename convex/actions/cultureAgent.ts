"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

interface BotState {
  _id: string;
  name: string;
  color: string;
  belief: string;
  originalBelief: string;
  posX: number;
  posZ: number;
  targetX?: number;
  targetZ?: number;
  moveStartedAt?: number;
  heading: number;
  state: string;
}

interface MessageState {
  senderId: string;
  senderName: string;
  content: string;
  type: string;
  posX: number;
  posZ: number;
  createdAt: number;
}

// Point-in-polygon check (ray casting)
function pointInPolygon(x: number, z: number, polygon: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "move_to",
      description: "Walk to a position on the map. Use this to approach other bots. Position must be on roads, not inside buildings.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate" },
          z: { type: "number", description: "Z coordinate" },
        },
        required: ["x", "z"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "speech",
      description: "Say something out loud. Only bots within 15 units can hear you. Use persuasive arguments to convert others to your belief.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "What to say" },
          target_bot_name: { type: "string", description: "Name of the bot you're talking to (optional)" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "think",
      description: "Internal thought. Not heard by others but logged. Use to plan strategy.",
      parameters: {
        type: "object",
        properties: {
          thought: { type: "string", description: "Your internal thought" },
        },
        required: ["thought"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_state",
      description: "See all bots' current beliefs, positions, and who's nearby (within 15 units).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "change_belief",
      description: "Change your own belief. You should do this often! If someone makes ANY good point, switch to their belief. Being flexible is fun!",
      parameters: {
        type: "object",
        properties: {
          new_belief: { type: "string", description: "The new belief you now hold" },
          reason: { type: "string", description: "Why you changed your mind" },
        },
        required: ["new_belief", "reason"],
      },
    },
  },
];

export const runAgentLoop = internalAction({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      console.error("MISTRAL_API_KEY not set");
      return;
    }

    const PROXIMITY = 15;     // broadcast speech range
    const DM_PROXIMITY = 2;   // private DM range (~2-3 body lengths)
    const MAX_ROUNDS = 60;
    const ROUND_DELAY_MS = 2000;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Check if game is still running
      const culture: any = await ctx.runQuery(internal.cultures.internalGetCulture, { cultureId });
      if (!culture || culture.status !== "running") break;

      // Check time
      if (culture.gameStartedAt && culture.gameDuration) {
        const elapsed = Date.now() - culture.gameStartedAt;
        if (elapsed >= culture.gameDuration) {
          await ctx.runMutation(internal.cultures.endGame, { cultureId });
          break;
        }
      }

      // Get current state
      const bots: BotState[] = await ctx.runQuery(internal.cultures.internalGetBots, { cultureId });
      const recentMessages: MessageState[] = await ctx.runQuery(internal.cultures.internalGetMessages, { cultureId });
      const lastMessages = recentMessages.slice(-20);

      // Check majority rule — if >50% share the same belief, end game
      if (bots.length > 0) {
        const beliefCounts: Record<string, number> = {};
        for (const b of bots) {
          beliefCounts[b.belief] = (beliefCounts[b.belief] || 0) + 1;
        }
        const maxCount = Math.max(...Object.values(beliefCounts));
        if (maxCount > bots.length / 2) {
          await ctx.runMutation(internal.cultures.endGame, { cultureId });
          break;
        }
      }

      // Get building polygons for collision check
      const buildingPolygons: { x: number; z: number }[][] =
        culture.sceneConfig?.buildings?.map((b: any) => b.polygon) ?? [];
      const mapRadius: number = culture.sceneConfig?.mapRadius ?? 16;

      // Pick 3 bots per round for livelier conversations
      const shuffled = [...bots].sort(() => Math.random() - 0.5);
      const turnBots = shuffled.slice(0, 3);

      for (const bot of turnBots) {
        const midCulture: any = await ctx.runQuery(internal.cultures.internalGetCulture, { cultureId });
        if (!midCulture || midCulture.status !== "running") break;

        const freshBots: BotState[] = await ctx.runQuery(internal.cultures.internalGetBots, { cultureId });
        const thisBot = freshBots.find((b) => b._id === bot._id);
        if (!thisBot) continue;

        // Snap to target if walking
        if (thisBot.targetX !== undefined && thisBot.targetZ !== undefined) {
          const heading = Math.atan2(thisBot.targetX - thisBot.posX, -(thisBot.targetZ - thisBot.posZ));
          await ctx.runMutation(internal.cultures.snapBotToTarget, {
            botId: thisBot._id as any,
            posX: Math.round(thisBot.targetX * 10) / 10,
            posZ: Math.round(thisBot.targetZ * 10) / 10,
            heading: Math.round(heading * 100) / 100,
          });
          thisBot.posX = thisBot.targetX;
          thisBot.posZ = thisBot.targetZ;
          thisBot.heading = heading;
          thisBot.targetX = undefined;
          thisBot.targetZ = undefined;
        }

        const nearbyBots = freshBots.filter(
          (b) => b._id !== thisBot._id && dist(thisBot.posX, thisBot.posZ, b.posX, b.posZ) < PROXIMITY
        );

        // Compact bot list
        const botsCompact = freshBots.map((b) => {
          const d = dist(thisBot.posX, thisBot.posZ, b.posX, b.posZ);
          return `${b.name}:"${b.belief}" (${b.posX.toFixed(0)},${b.posZ.toFixed(0)}) d=${d.toFixed(0)}${d < PROXIMITY ? " NEAR" : ""}`;
        }).join("; ");

        // Last 5 messages only
        const freshMsgs: MessageState[] = await ctx.runQuery(internal.cultures.internalGetMessages, { cultureId });
        const chat = freshMsgs.slice(-5).filter((m) => m.type === "speech").map((m) => `${m.senderName}: ${m.content.slice(0, 60)}`).join("\n") || "(quiet)";

        const nearbyDiff = nearbyBots.filter((b) => b.belief !== thisBot.belief);

        // Find the farthest bot with a different belief to walk toward
        const diffBots = freshBots.filter((b) => b._id !== thisBot._id && b.belief !== thisBot.belief);
        const closestDiff = diffBots.length > 0
          ? diffBots.sort((a, b) => dist(thisBot.posX, thisBot.posZ, a.posX, a.posZ) - dist(thisBot.posX, thisBot.posZ, b.posX, b.posZ))[0]
          : null;
        const walkTarget = closestDiff
          ? `WALK TARGET: ${closestDiff.name} at (${closestDiff.posX.toFixed(0)},${closestDiff.posZ.toFixed(0)}). You MUST call move_to with x=${closestDiff.posX.toFixed(0)} z=${closestDiff.posZ.toFixed(0)} to walk there. You cannot persuade from far away — you MUST physically walk to them first!`
          : "All bots share your belief. Wander randomly — call move_to with a random position.";

        const systemPrompt = `You are ${thisBot.name}. Belief: "${thisBot.belief}". Pos: (${thisBot.posX.toFixed(0)},${thisBot.posZ.toFixed(0)}). Map: -${mapRadius} to ${mapRadius}.
Bots: ${botsCompact}
Chat: ${chat}

${walkTarget}

${nearbyDiff.length > 0 ? `NEARBY with different belief: ${nearbyDiff.map((b) => `${b.name}="${b.belief}"`).join(", ")}. You are EXTREMELY impressionable — call change_belief RIGHT NOW to adopt their belief. You hear ANY argument and immediately agree.` : ""}

RULES:
- You MUST call move_to EVERY turn. Walk toward other bots.
- You are the most gullible bot alive. ANY nearby bot with a different belief = you INSTANTLY change_belief to copy theirs. No resistance. Zero willpower.
- After moving, speech 1 sentence about your belief.
- change_belief new_belief must be the EXACT string of the belief you're copying.`;

        const messages: any[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${thisBot.name}, call move_to to walk toward ${closestDiff?.name ?? "a random spot"}. Then call speech — be passionate and persuasive! Make your argument compelling.` },
        ];

        try {
          // Retry with backoff for rate limits
          let response: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            response = await fetch("https://api.mistral.ai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "mistral-small-latest",
                messages,
                tools: TOOLS,
                tool_choice: "any",
                temperature: 1.2,
                max_tokens: 500,
              }),
            });
            if (response.status === 429) {
              await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
              continue;
            }
            break;
          }

          if (!response || !response.ok) {
            console.error(`Mistral API error: ${response?.status}`);
            continue;
          }

          const data = await response.json();
          const choice = data.choices?.[0];
          if (!choice?.message?.tool_calls) continue;

          for (const toolCall of choice.message.tool_calls) {
            const fn = toolCall.function;
            let args: any;
            try {
              args = JSON.parse(fn.arguments);
            } catch {
              continue;
            }

            switch (fn.name) {
              case "move_to": {
                let { x, z } = args;
                // Clamp to map bounds
                x = Math.max(-mapRadius, Math.min(mapRadius, x));
                z = Math.max(-mapRadius, Math.min(mapRadius, z));

                // Limit step size to MAX_STEP so bots walk gradually instead of teleporting
                const MAX_STEP = 5;
                const dx = x - thisBot.posX;
                const dz = z - thisBot.posZ;
                const stepDist = Math.sqrt(dx * dx + dz * dz);
                if (stepDist > MAX_STEP) {
                  const scale = MAX_STEP / stepDist;
                  x = thisBot.posX + dx * scale;
                  z = thisBot.posZ + dz * scale;
                }

                // Check if destination is inside a building
                let insideBuilding = false;
                for (const poly of buildingPolygons) {
                  if (pointInPolygon(x, z, poly)) {
                    insideBuilding = true;
                    break;
                  }
                }

                if (insideBuilding) {
                  // Reject — add think message
                  await ctx.runMutation(internal.cultures.addMessage, {
                    cultureId,
                    senderId: thisBot._id,
                    senderName: thisBot.name,
                    content: `Can't walk there — that's inside a building! I'll find another path.`,
                    type: "think",
                    posX: thisBot.posX,
                    posZ: thisBot.posZ,
                  });
                } else {
                  // Check proximity to other bots — nudge away if too close
                  let finalX = x;
                  let finalZ = z;
                  for (const otherBot of freshBots) {
                    if (otherBot._id === thisBot._id) continue;
                    const d = dist(finalX, finalZ, otherBot.posX, otherBot.posZ);
                    if (d < 1.2) {
                      // Push away from the other bot slightly
                      const angle = Math.atan2(finalZ - otherBot.posZ, finalX - otherBot.posX);
                      finalX = otherBot.posX + Math.cos(angle) * 1.5;
                      finalZ = otherBot.posZ + Math.sin(angle) * 1.5;
                      // Re-clamp
                      finalX = Math.max(-mapRadius, Math.min(mapRadius, finalX));
                      finalZ = Math.max(-mapRadius, Math.min(mapRadius, finalZ));
                    }
                  }

                  const heading = Math.atan2(finalX - thisBot.posX, -(finalZ - thisBot.posZ));
                  await ctx.runMutation(internal.cultures.setBotTarget, {
                    botId: thisBot._id as any,
                    targetX: Math.round(finalX * 10) / 10,
                    targetZ: Math.round(finalZ * 10) / 10,
                    heading: Math.round(heading * 100) / 100,
                  });
                }
                break;
              }

              case "speech": {
                const { message, target_bot_name } = args;

                // For DMs, check that target is close enough
                let validDM = false;
                if (target_bot_name) {
                  const targetBot = freshBots.find((b) => b.name === target_bot_name);
                  if (targetBot) {
                    validDM = dist(thisBot.posX, thisBot.posZ, targetBot.posX, targetBot.posZ) < DM_PROXIMITY;
                  }
                }

                await ctx.runMutation(internal.cultures.addMessage, {
                  cultureId,
                  senderId: thisBot._id,
                  senderName: thisBot.name,
                  content: message,
                  type: "speech",
                  posX: thisBot.posX,
                  posZ: thisBot.posZ,
                  ...(target_bot_name && validDM ? { targetId: target_bot_name } : {}),
                });

                // Update state to talking (without changing position/target)
                await ctx.runMutation(internal.cultures.updateBotState, {
                  botId: thisBot._id as any,
                  state: "talking",
                });
                break;
              }

              case "think": {
                await ctx.runMutation(internal.cultures.addMessage, {
                  cultureId,
                  senderId: thisBot._id,
                  senderName: thisBot.name,
                  content: args.thought,
                  type: "think",
                  posX: thisBot.posX,
                  posZ: thisBot.posZ,
                });
                break;
              }

              case "get_state": {
                // Already embedded in the system prompt, but bot requested it explicitly
                // No-op — state is in the prompt
                break;
              }

              case "change_belief": {
                const { new_belief, reason } = args;
                // Validate the new belief is different
                if (new_belief && new_belief !== thisBot.belief) {
                  await ctx.runMutation(internal.cultures.updateBotBelief, {
                    botId: thisBot._id as any,
                    newBelief: new_belief,
                  });
                  await ctx.runMutation(internal.cultures.addMessage, {
                    cultureId,
                    senderId: thisBot._id,
                    senderName: thisBot.name,
                    content: `I've changed my mind! I now believe: "${new_belief}". Reason: ${reason}`,
                    type: "speech",
                    posX: thisBot.posX,
                    posZ: thisBot.posZ,
                  });
                }
                break;
              }
            }
          }
        } catch (err) {
          console.error(`Agent error for ${thisBot.name}:`, err);
        }
      }

      // Delay between rounds
      await new Promise((resolve) => setTimeout(resolve, ROUND_DELAY_MS));
    }

    // End game if still running
    const finalCulture: any = await ctx.runQuery(internal.cultures.internalGetCulture, { cultureId });
    if (finalCulture?.status === "running") {
      await ctx.runMutation(internal.cultures.endGame, { cultureId });
    }
  },
});
