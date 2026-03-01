"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

interface VehicleFrame {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: string;
}

interface SimulationFrame {
  time: number;
  vehicles: VehicleFrame[];
}

const TOOL_LIMITS: Record<string, number> = {
  easy: 2,
  normal: 4,
  hard: 6,
  hell: 8,
};

function getFrameAtTime(frames: SimulationFrame[], time: number): SimulationFrame | null {
  if (!frames || frames.length === 0) return null;
  let closest = frames[0];
  let minDiff = Math.abs(frames[0].time - time);
  for (const f of frames) {
    const diff = Math.abs(f.time - time);
    if (diff < minDiff) { minDiff = diff; closest = f; }
  }
  return closest;
}

function getTrajectory(
  frames: SimulationFrame[], vehicleId: string, fromTime: number, duration: number
) {
  const trajectory: any[] = [];
  for (const f of frames) {
    if (f.time >= fromTime && f.time <= fromTime + duration) {
      const v = f.vehicles.find((v) => v.id === vehicleId);
      if (v) trajectory.push({ time: f.time, x: v.x, z: v.z, heading: v.heading, speed: v.speed });
    }
  }
  return trajectory;
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_scene_state",
      description: "Get all vehicle positions and headings at a specific time in the simulation",
      parameters: {
        type: "object",
        properties: { time: { type: "number", description: "Time in seconds (0.0 to 10.0)" } },
        required: ["time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_vehicle_trajectory",
      description: "Get the trajectory of a specific vehicle over a time range",
      parameters: {
        type: "object",
        properties: {
          vehicleId: { type: "string", description: "Vehicle ID (e.g. 'v0')" },
          fromTime: { type: "number", description: "Start time in seconds" },
          duration: { type: "number", description: "Duration in seconds" },
        },
        required: ["vehicleId", "fromTime", "duration"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "predict_collision",
      description: "Submit your prediction for where the collision will happen. You must call this exactly once.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate on the map" },
          z: { type: "number", description: "Z coordinate on the map" },
        },
        required: ["x", "z"],
      },
    },
  },
];

export const runMistralAgent = internalAction({
  args: {
    battleId: v.id("battles"),
    frames: v.any(),
    sceneConfig: v.any(),
    difficulty: v.string(),
  },
  handler: async (ctx, { battleId, frames, sceneConfig, difficulty }) => {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      console.error("MISTRAL_API_KEY not set");
      return;
    }

    const toolLimit = TOOL_LIMITS[difficulty] ?? 4;
    const simFrames = frames as SimulationFrame[];
    let logStep = 0;

    async function log(
      type: "thinking" | "tool_call" | "tool_result" | "prediction",
      content: string,
      toolName?: string,
      toolArgs?: string
    ) {
      await ctx.runMutation(internal.battles.saveAgentLog, {
        battleId, step: logStep++, type, content,
        ...(toolName ? { toolName } : {}),
        ...(toolArgs ? { toolArgs } : {}),
      });
    }

    const initialFrame = simFrames[0];
    const vehicleList = initialFrame.vehicles
      .map((v) => `${v.id}: (${v.x.toFixed(1)}, ${v.z.toFixed(1)}) h=${v.heading.toFixed(2)} spd=${v.speed.toFixed(1)}`)
      .join("\n");

    const systemPrompt = `You are an expert traffic analyst AI competing in a prediction game. Analyze this traffic simulation and predict where a car accident will occur.

The simulation runs on a map with coordinates roughly -${(sceneConfig.gridSize * sceneConfig.tileSize) / 2} to ${(sceneConfig.gridSize * sceneConfig.tileSize) / 2} on both axes.

You have ${toolLimit} tool calls. Use them strategically:
- get_scene_state: See all vehicles at a given time
- get_vehicle_trajectory: Track a specific vehicle's path
- predict_collision: Submit your final prediction (MUST call exactly once)

Think step by step. Look for converging trajectories, dangerous intersections, and high-speed vehicles.

Initial positions:
${vehicleList}`;

    await log("thinking", `Analyzing ${initialFrame.vehicles.length} vehicles on a ${sceneConfig.gridSize}x${sceneConfig.gridSize} map...`);

    let toolCallCount = 0;
    let prediction: { x: number; z: number } | null = null;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Analyze the traffic simulation and predict where the collision will occur." },
    ];

    for (let turn = 0; turn < toolLimit + 2 && !prediction; turn++) {
      try {
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "mistral-small-latest", messages, tools: TOOLS, tool_choice: "auto" }),
        });

        if (!response.ok) {
          await log("thinking", `API error: ${response.status}`);
          break;
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        if (!choice) break;

        const message = choice.message;
        messages.push(message);

        if (message.content) {
          await log("thinking", message.content);
        }

        if (!message.tool_calls || message.tool_calls.length === 0) break;

        for (const toolCall of message.tool_calls) {
          toolCallCount++;
          const fn = toolCall.function;
          const args = JSON.parse(fn.arguments);
          let result: string;

          await log("tool_call", `Calling ${fn.name}`, fn.name, fn.arguments);

          switch (fn.name) {
            case "get_scene_state": {
              const frame = getFrameAtTime(simFrames, args.time);
              if (frame) {
                const summary = frame.vehicles
                  .map((v) => `${v.id}:(${v.x.toFixed(1)},${v.z.toFixed(1)}) spd=${v.speed.toFixed(1)} ${v.state}`)
                  .join(", ");
                result = JSON.stringify(frame.vehicles.map((v) => ({
                  id: v.id, x: v.x, z: v.z, heading: v.heading, speed: v.speed, state: v.state,
                })));
                await log("tool_result", `t=${args.time.toFixed(1)}s: ${frame.vehicles.length} vehicles — ${summary.slice(0, 200)}`, fn.name);
              } else {
                result = "No data";
                await log("tool_result", "No data at this time", fn.name);
              }
              break;
            }
            case "get_vehicle_trajectory": {
              const traj = getTrajectory(simFrames, args.vehicleId, args.fromTime, args.duration);
              result = JSON.stringify(traj);
              const summary = traj.length > 0
                ? `${traj.length} points: (${traj[0].x.toFixed(1)},${traj[0].z.toFixed(1)}) → (${traj[traj.length-1].x.toFixed(1)},${traj[traj.length-1].z.toFixed(1)})`
                : "No data";
              await log("tool_result", `${args.vehicleId} trajectory: ${summary}`, fn.name);
              break;
            }
            case "predict_collision": {
              prediction = { x: args.x, z: args.z };
              result = `Prediction recorded at (${args.x.toFixed(1)}, ${args.z.toFixed(1)})`;
              await log("prediction", `Collision predicted at (${args.x.toFixed(1)}, ${args.z.toFixed(1)})`, fn.name);
              break;
            }
            default:
              result = "Unknown tool";
          }

          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });

          if (toolCallCount >= toolLimit && !prediction) break;
        }
      } catch (error) {
        await log("thinking", `Error: ${error}`);
        break;
      }
    }

    if (!prediction) {
      const midFrame = simFrames[Math.floor(simFrames.length * 0.4)];
      if (midFrame) {
        let sumX = 0, sumZ = 0;
        for (const v of midFrame.vehicles) { sumX += v.x; sumZ += v.z; }
        prediction = {
          x: sumX / midFrame.vehicles.length + (Math.random() - 0.5) * 4,
          z: sumZ / midFrame.vehicles.length + (Math.random() - 0.5) * 4,
        };
      } else {
        prediction = { x: 0, z: 0 };
      }
      await log("prediction", `Fallback prediction at (${prediction.x.toFixed(1)}, ${prediction.z.toFixed(1)})`);
    }

    const predictionTime = 2 + Math.random() * 3;
    await ctx.runMutation(internal.battles.submitAIPrediction, {
      battleId, coordinates: prediction, predictionTime,
    });
  },
});
