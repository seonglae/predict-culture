"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * Mistral AI Agent — uses tool-use to analyze traffic scene and predict collision.
 *
 * Available tools:
 * - get_scene_state(time): All vehicle positions/headings at given time
 * - get_vehicle_trajectory(vehicleId, fromTime, duration): Future path
 * - get_intersection_data(row, col): Vehicles approaching an intersection
 * - predict_collision(x, z): Submit prediction (must call exactly once)
 *
 * Tool call limits by difficulty: Easy=2, Normal=4, Hard=6, Hell=8
 */

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
  // Find closest frame
  let closest = frames[0];
  let minDiff = Math.abs(frames[0].time - time);
  for (const f of frames) {
    const diff = Math.abs(f.time - time);
    if (diff < minDiff) {
      minDiff = diff;
      closest = f;
    }
  }
  return closest;
}

function getTrajectory(
  frames: SimulationFrame[],
  vehicleId: string,
  fromTime: number,
  duration: number
): { time: number; x: number; z: number; heading: number; speed: number }[] {
  const trajectory: any[] = [];
  for (const f of frames) {
    if (f.time >= fromTime && f.time <= fromTime + duration) {
      const v = f.vehicles.find((v) => v.id === vehicleId);
      if (v) {
        trajectory.push({
          time: f.time,
          x: v.x,
          z: v.z,
          heading: v.heading,
          speed: v.speed,
        });
      }
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
        properties: {
          time: {
            type: "number",
            description: "Time in seconds (0.0 to 10.0)",
          },
        },
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

    // Build initial scene description
    const initialFrame = simFrames[0];
    const vehicleList = initialFrame.vehicles
      .map(
        (v: VehicleFrame) =>
          `${v.id}: pos(${v.x.toFixed(1)}, ${v.z.toFixed(1)}) heading=${v.heading.toFixed(2)} speed=${v.speed.toFixed(1)}`
      )
      .join("\n");

    const systemPrompt = `You are analyzing a traffic simulation to predict where a car accident will occur.

The simulation runs for ~10 seconds on a ${sceneConfig.gridSize}x${sceneConfig.gridSize} grid (tile size ${sceneConfig.tileSize}).
Map coordinates range from roughly -${(sceneConfig.gridSize * sceneConfig.tileSize) / 2} to ${(sceneConfig.gridSize * sceneConfig.tileSize) / 2} on both X and Z axes.

You have ${toolLimit} tool calls to analyze the scene. Use them wisely:
- get_scene_state: See all vehicles at a given time
- get_vehicle_trajectory: Track a specific vehicle's path
- predict_collision: Submit your prediction (MUST call exactly once)

Think about:
1. Which vehicles are heading toward each other
2. Which intersections have converging traffic
3. Vehicle speeds and aggressiveness

Initial vehicle positions:
${vehicleList}`;

    let toolCallCount = 0;
    let prediction: { x: number; z: number } | null = null;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: "Analyze the traffic simulation and predict where the collision will occur. Use your tools wisely.",
      },
    ];

    // Agentic loop
    for (let turn = 0; turn < toolLimit + 2 && !prediction; turn++) {
      try {
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "mistral-small-latest",
            messages,
            tools: TOOLS,
            tool_choice: "auto",
          }),
        });

        if (!response.ok) {
          console.error("Mistral API error:", response.status);
          break;
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        if (!choice) break;

        const message = choice.message;
        messages.push(message);

        if (!message.tool_calls || message.tool_calls.length === 0) {
          // No tool calls — done
          break;
        }

        // Process tool calls
        for (const toolCall of message.tool_calls) {
          toolCallCount++;
          const fn = toolCall.function;
          const args = JSON.parse(fn.arguments);
          let result: string;

          switch (fn.name) {
            case "get_scene_state": {
              const frame = getFrameAtTime(simFrames, args.time);
              result = frame
                ? JSON.stringify(frame.vehicles.map((v: VehicleFrame) => ({
                    id: v.id,
                    x: v.x,
                    z: v.z,
                    heading: v.heading,
                    speed: v.speed,
                    state: v.state,
                  })))
                : "No data available for this time";
              break;
            }
            case "get_vehicle_trajectory": {
              const traj = getTrajectory(
                simFrames,
                args.vehicleId,
                args.fromTime,
                args.duration
              );
              result = JSON.stringify(traj);
              break;
            }
            case "predict_collision": {
              prediction = { x: args.x, z: args.z };
              result = `Prediction recorded at (${args.x}, ${args.z})`;
              break;
            }
            default:
              result = "Unknown tool";
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });

          if (toolCallCount >= toolLimit && !prediction) {
            // Force a prediction if we've used all tool calls
            // Use the last analysis to make a guess
            break;
          }
        }
      } catch (error) {
        console.error("Mistral agent error:", error);
        break;
      }
    }

    // If no prediction was made, fall back to heuristic
    if (!prediction) {
      // Simple fallback: find center of most congested area
      const midFrame = simFrames[Math.floor(simFrames.length * 0.4)];
      if (midFrame) {
        let sumX = 0;
        let sumZ = 0;
        for (const v of midFrame.vehicles) {
          sumX += v.x;
          sumZ += v.z;
        }
        prediction = {
          x: sumX / midFrame.vehicles.length + (Math.random() - 0.5) * 4,
          z: sumZ / midFrame.vehicles.length + (Math.random() - 0.5) * 4,
        };
      } else {
        prediction = { x: 0, z: 0 };
      }
    }

    // Submit prediction
    // Find AI player
    const predictionTime = 2 + Math.random() * 3;

    // Store via internal mutation
    await ctx.runMutation(internal.battles.submitAIPrediction, {
      battleId,
      coordinates: prediction,
      predictionTime,
    });
  },
});
