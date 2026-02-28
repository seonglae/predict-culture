import {
  type SceneConfig,
  type VehicleSpawn,
  type VehicleFrame,
  type SimulationFrame,
  type SimulationResult,
  type TileType,
  type Tile,
} from "./types";

// Seeded PRNG
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface VehicleSim {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  targetSpeed: number;
  aggressiveness: number;
  state: "driving" | "turning" | "braking" | "crashed";
  width: number;
  length: number;
  turnTimer: number;
  lastTurnRow: number;
  lastTurnCol: number;
  flying: boolean;
  altitude: number;
  driftOffset: number; // lateral lane drift
}

function isRoad(type: TileType): boolean {
  return type.startsWith("road_");
}

function getTileAt(tiles: Tile[], row: number, col: number): Tile | undefined {
  return tiles.find((t) => t.row === row && t.col === col);
}

function worldToGrid(x: number, z: number, gridSize: number, tileSize: number): { row: number; col: number } {
  const col = Math.floor(x / tileSize + gridSize / 2);
  const row = Math.floor(z / tileSize + gridSize / 2);
  return { row, col };
}

// Collision detection — hybrid AABB + distance check
function checkCollision(a: VehicleSim, b: VehicleSim): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);

  // Quick distance reject
  const maxDim = Math.max(a.length, b.length);
  if (dx > maxDim + 1 || dz > maxDim + 1) return false;

  // Method 1: Oriented AABB
  const cosA = Math.abs(Math.cos(a.heading));
  const sinA = Math.abs(Math.sin(a.heading));
  const cosB = Math.abs(Math.cos(b.heading));
  const sinB = Math.abs(Math.sin(b.heading));

  const aExtX = (a.length / 2) * sinA + (a.width / 2) * cosA;
  const aExtZ = (a.length / 2) * cosA + (a.width / 2) * sinA;
  const bExtX = (b.length / 2) * sinB + (b.width / 2) * cosB;
  const bExtZ = (b.length / 2) * cosB + (b.width / 2) * sinB;

  const aabb = dx < aExtX + bExtX && dz < aExtZ + bExtZ;
  if (aabb) return true;

  // Method 2: Simple center distance
  const dist = Math.sqrt(dx * dx + dz * dz);
  const minSep = (a.width + b.width) / 2 + 0.3;
  return dist < minSep;
}

// Collision hitbox sizes — matches visual RoundedBox
const VEHICLE_SIZES: Record<string, { width: number; length: number }> = {
  car: { width: 1.1, length: 2.0 },
  truck: { width: 1.3, length: 2.8 },
  bus: { width: 1.5, length: 3.6 },
  motorcycle: { width: 0.6, length: 1.4 },
  drone: { width: 0.6, length: 0.6 },
  helicopter: { width: 1.2, length: 2.2 },
};

export function runSimulation(
  scene: SceneConfig,
  seed: number,
  durationSeconds: number = 15,
  fps: number = 60,
  recordEvery: number = 3
): SimulationResult | null {
  const rng = mulberry32(seed + 12345);
  const dt = 1 / fps;
  const totalSteps = Math.ceil(durationSeconds * fps);
  const { gridSize, tileSize, tiles } = scene;

  // Initialize vehicles
  const vehicles: VehicleSim[] = scene.vehicles.map((v) => ({
    ...v,
    targetSpeed: v.speed,
    state: "driving" as const,
    width: VEHICLE_SIZES[v.type]?.width ?? 0.8,
    length: VEHICLE_SIZES[v.type]?.length ?? 1.6,
    turnTimer: 0,
    lastTurnRow: -1,
    lastTurnCol: -1,
    flying: v.flying ?? false,
    altitude: v.altitude ?? 0,
    driftOffset: (rng() - 0.5) * 0.4, // initial lane position variation
  }));

  const frames: SimulationFrame[] = [];
  let accidentPoint: { x: number; z: number } | null = null;
  let accidentTime = 0;
  let accidentFrame = 0;

  for (let step = 0; step < totalSteps; step++) {
    const time = step * dt;

    for (const v of vehicles) {
      if (v.state === "crashed") continue;

      // Flying vehicles: simple circular/wandering motion
      if (v.flying) {
        const baseAngle = v.heading + rng() * 0.02 - 0.01;
        v.heading = baseAngle;
        v.x += Math.sin(v.heading) * v.speed * dt;
        v.z -= Math.cos(v.heading) * v.speed * dt;
        // Gentle turning
        if (rng() < 0.005) v.heading += (rng() - 0.5) * 0.5;
        // Keep within bounds
        const halfMap = (gridSize * tileSize) / 2;
        if (Math.abs(v.x) > halfMap * 0.8 || Math.abs(v.z) > halfMap * 0.8) {
          v.heading += Math.PI * 0.02;
        }
        continue;
      }

      // Get current tile
      const { row, col } = worldToGrid(v.x, v.z, gridSize, tileSize);
      const tile = getTileAt(tiles, row, col);

      // Intersection decision
      if (
        tile &&
        (tile.type === "road_intersection" || tile.type.startsWith("road_t_")) &&
        (row !== v.lastTurnRow || col !== v.lastTurnCol)
      ) {
        v.lastTurnRow = row;
        v.lastTurnCol = col;

        const choices: number[] = [];
        const weights: number[] = [];

        const checkDir = (dr: number, dc: number, heading: number) => {
          const nextTile = getTileAt(tiles, row + dr, col + dc);
          if (nextTile && isRoad(nextTile.type)) {
            choices.push(heading);
            const angleDiff = Math.abs(heading - v.heading);
            const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff) / Math.PI;
            weights.push(1 - normalizedDiff * 0.6 + v.aggressiveness * 0.3);
          }
        };

        checkDir(-1, 0, 0);
        checkDir(1, 0, Math.PI);
        checkDir(0, 1, Math.PI / 2);
        checkDir(0, -1, -Math.PI / 2);

        if (choices.length > 0) {
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          let r = rng() * totalWeight;
          let chosen = choices[0];
          for (let i = 0; i < choices.length; i++) {
            r -= weights[i];
            if (r <= 0) { chosen = choices[i]; break; }
          }
          v.heading = chosen;
          v.state = "turning";
          v.turnTimer = 0.3;
        }
      }

      // Update turn timer
      if (v.turnTimer > 0) {
        v.turnTimer -= dt;
        if (v.turnTimer <= 0) v.state = "driving";
      }

      // Random lane drift — causes collisions on straight roads too
      if (rng() < 0.003 * v.aggressiveness) {
        v.driftOffset += (rng() - 0.5) * 0.3;
        v.driftOffset = Math.max(-0.8, Math.min(0.8, v.driftOffset));
      }

      // Speed control
      const isAtIntersection = tile &&
        (tile.type === "road_intersection" || tile.type.startsWith("road_t_"));
      const desiredSpeed = isAtIntersection
        ? v.targetSpeed * (0.65 + v.aggressiveness * 0.35)
        : v.targetSpeed;
      v.speed += (desiredSpeed - v.speed) * 0.1;

      // Move — main direction + lateral drift
      const driftDx = Math.cos(v.heading) * v.driftOffset * 0.01;
      const driftDz = Math.sin(v.heading) * v.driftOffset * 0.01;
      v.x += Math.sin(v.heading) * v.speed * dt + driftDx;
      v.z -= Math.cos(v.heading) * v.speed * dt + driftDz;

      // Boundary wrapping
      const halfMap = (gridSize * tileSize) / 2;
      if (v.x > halfMap) v.x = -halfMap + 1;
      if (v.x < -halfMap) v.x = halfMap - 1;
      if (v.z > halfMap) v.z = -halfMap + 1;
      if (v.z < -halfMap) v.z = halfMap - 1;
    }

    // Collision detection — ground vehicles only
    if (!accidentPoint) {
      for (let i = 0; i < vehicles.length; i++) {
        if (vehicles[i].state === "crashed" || vehicles[i].flying) continue;
        for (let j = i + 1; j < vehicles.length; j++) {
          if (vehicles[j].state === "crashed" || vehicles[j].flying) continue;
          if (checkCollision(vehicles[i], vehicles[j])) {
            vehicles[i].state = "crashed";
            vehicles[j].state = "crashed";
            vehicles[i].speed = 0;
            vehicles[j].speed = 0;
            accidentPoint = {
              x: (vehicles[i].x + vehicles[j].x) / 2,
              z: (vehicles[i].z + vehicles[j].z) / 2,
            };
            accidentTime = time;
            accidentFrame = Math.floor(step / recordEvery);
          }
        }
      }
    }

    // Record frame
    if (step % recordEvery === 0) {
      frames.push({
        time,
        vehicles: vehicles.map((v) => ({
          id: v.id,
          x: Math.round(v.x * 100) / 100,
          z: Math.round(v.z * 100) / 100,
          heading: Math.round(v.heading * 100) / 100,
          speed: Math.round(v.speed * 100) / 100,
          state: v.state,
          flying: v.flying || undefined,
          altitude: v.altitude || undefined,
        })),
      });
    }
  }

  if (!accidentPoint) return null;

  return { frames, accidentPoint, accidentTime, accidentFrame, totalFrames: frames.length };
}

export function generateSimulation(
  scene: SceneConfig,
  baseSeed: number,
  maxRetries: number = 10
): { result: SimulationResult; seed: number } | null {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const simSeed = baseSeed + attempt * 7919;
    const result = runSimulation(scene, simSeed);
    if (result) return { result, seed: simSeed };
  }
  return null;
}
