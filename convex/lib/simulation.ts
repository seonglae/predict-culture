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
  laneOffset: number; // lateral offset within road (-1 to 1 range)
}

function isRoad(type: TileType): boolean {
  return type.startsWith("road_");
}

function isBlocker(type: TileType): boolean {
  return (
    type.startsWith("building_") ||
    type === "water" ||
    type === "river" ||
    type === "forest"
  );
}

// Build a fast lookup grid for tiles
function buildTileGrid(tiles: Tile[], gridSize: number): (Tile | null)[][] {
  const grid: (Tile | null)[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => null)
  );
  for (const t of tiles) {
    if (t.row >= 0 && t.row < gridSize && t.col >= 0 && t.col < gridSize) {
      grid[t.row][t.col] = t;
    }
  }
  return grid;
}

function getTileFromGrid(
  grid: (Tile | null)[][],
  row: number,
  col: number,
  gridSize: number
): Tile | null {
  if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null;
  return grid[row][col];
}

function worldToGrid(
  x: number,
  z: number,
  gridSize: number,
  tileSize: number
): { row: number; col: number } {
  const col = Math.floor(x / tileSize + gridSize / 2);
  const row = Math.floor(z / tileSize + gridSize / 2);
  return { row, col };
}

function gridToWorld(
  row: number,
  col: number,
  gridSize: number,
  tileSize: number
): { x: number; z: number } {
  const x = (col - gridSize / 2) * tileSize + tileSize / 2;
  const z = (row - gridSize / 2) * tileSize + tileSize / 2;
  return { x, z };
}

// Get the center of the road tile in world coords
function tileCenterWorld(
  tile: Tile,
  gridSize: number,
  tileSize: number
): { x: number; z: number } {
  return gridToWorld(tile.row, tile.col, gridSize, tileSize);
}

// Check which directions a road tile connects
function getRoadConnections(
  type: TileType
): { north: boolean; south: boolean; east: boolean; west: boolean } {
  const connections: Record<
    string,
    { north: boolean; south: boolean; east: boolean; west: boolean }
  > = {
    road_straight_ns: { north: true, south: true, east: false, west: false },
    road_straight_ew: { north: false, south: false, east: true, west: true },
    road_intersection: { north: true, south: true, east: true, west: true },
    road_t_north: { north: true, south: false, east: true, west: true },
    road_t_south: { north: false, south: true, east: true, west: true },
    road_t_east: { north: true, south: true, east: true, west: false },
    road_t_west: { north: true, south: true, east: false, west: true },
    road_curve_ne: { north: true, south: false, east: true, west: false },
    road_curve_nw: { north: true, south: false, east: false, west: true },
    road_curve_se: { north: false, south: true, east: true, west: false },
    road_curve_sw: { north: false, south: true, east: false, west: true },
  };
  return (
    connections[type] ?? {
      north: false,
      south: false,
      east: false,
      west: false,
    }
  );
}

// Heading to direction
function headingToDir(
  heading: number
): "north" | "south" | "east" | "west" {
  // Normalize to 0-2PI
  let h = ((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (h < Math.PI / 4 || h >= (Math.PI * 7) / 4) return "north"; // ~0
  if (h < (Math.PI * 3) / 4) return "east"; // ~PI/2
  if (h < (Math.PI * 5) / 4) return "south"; // ~PI
  return "west"; // ~3PI/2
}

function dirToHeading(dir: "north" | "south" | "east" | "west"): number {
  switch (dir) {
    case "north":
      return 0;
    case "east":
      return Math.PI / 2;
    case "south":
      return Math.PI;
    case "west":
      return -Math.PI / 2;
  }
}

// Collision detection — AABB with orientation
function checkCollision(a: VehicleSim, b: VehicleSim): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);

  // Quick distance reject
  const maxDim = Math.max(a.length, b.length) * 1.2;
  if (dx > maxDim || dz > maxDim) return false;

  // Oriented AABB
  const cosA = Math.abs(Math.cos(a.heading));
  const sinA = Math.abs(Math.sin(a.heading));
  const cosB = Math.abs(Math.cos(b.heading));
  const sinB = Math.abs(Math.sin(b.heading));

  const aExtX = (a.length / 2) * sinA + (a.width / 2) * cosA;
  const aExtZ = (a.length / 2) * cosA + (a.width / 2) * sinA;
  const bExtX = (b.length / 2) * sinB + (b.width / 2) * cosB;
  const bExtZ = (b.length / 2) * cosB + (b.width / 2) * sinB;

  if (dx < aExtX + bExtX && dz < aExtZ + bExtZ) return true;

  // Center distance fallback
  const dist = Math.sqrt(dx * dx + dz * dz);
  const minSep = (a.length + b.length) / 4;
  return dist < minSep;
}

// Collision hitbox sizes
const VEHICLE_SIZES: Record<string, { width: number; length: number }> = {
  car: { width: 1.0, length: 1.8 },
  truck: { width: 1.2, length: 2.6 },
  bus: { width: 1.4, length: 3.4 },
  motorcycle: { width: 0.5, length: 1.3 },
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
  const halfTile = tileSize / 2;

  // Build fast tile lookup
  const tileGrid = buildTileGrid(tiles, gridSize);

  // Initialize vehicles
  const vehicles: VehicleSim[] = scene.vehicles.map((v) => {
    const sizes = VEHICLE_SIZES[v.type] ?? { width: 0.8, length: 1.6 };
    return {
      id: v.id,
      x: v.x,
      z: v.z,
      heading: v.heading,
      speed: v.speed,
      targetSpeed: v.speed,
      aggressiveness: v.aggressiveness,
      state: "driving" as const,
      width: sizes.width,
      length: sizes.length,
      turnTimer: 0,
      lastTurnRow: -1,
      lastTurnCol: -1,
      flying: v.flying ?? false,
      altitude: v.altitude ?? 0,
      laneOffset: (rng() - 0.5) * 0.6, // slight initial lane variation
    };
  });

  // Snap ground vehicles onto road centers initially
  for (const v of vehicles) {
    if (v.flying) continue;
    const { row, col } = worldToGrid(v.x, v.z, gridSize, tileSize);
    const tile = getTileFromGrid(tileGrid, row, col, gridSize);
    if (tile && isRoad(tile.type)) {
      const center = tileCenterWorld(tile, gridSize, tileSize);
      // Snap to center with small lane offset perpendicular to heading
      const perpX = Math.cos(v.heading);
      const perpZ = -Math.sin(v.heading);
      v.x = center.x + perpX * v.laneOffset * 0.5;
      v.z = center.z + perpZ * v.laneOffset * 0.5;
    }
  }

  const frames: SimulationFrame[] = [];
  let accidentPoint: { x: number; z: number } | null = null;
  let accidentTime = 0;
  let accidentFrame = 0;

  for (let step = 0; step < totalSteps; step++) {
    const time = step * dt;

    for (const v of vehicles) {
      if (v.state === "crashed") continue;

      // Flying vehicles: simple wandering
      if (v.flying) {
        v.heading += (rng() - 0.5) * 0.03;
        v.x += Math.sin(v.heading) * v.speed * dt;
        v.z -= Math.cos(v.heading) * v.speed * dt;
        const halfMap = (gridSize * tileSize) / 2;
        if (Math.abs(v.x) > halfMap * 0.8 || Math.abs(v.z) > halfMap * 0.8) {
          v.heading += Math.PI * 0.03;
        }
        continue;
      }

      // Get current tile
      const { row, col } = worldToGrid(v.x, v.z, gridSize, tileSize);
      const tile = getTileFromGrid(tileGrid, row, col, gridSize);

      // If somehow off-road, teleport back to nearest road center
      if (!tile || !isRoad(tile.type)) {
        let bestDist = Infinity;
        let bestTile: Tile | null = null;
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            const nt = getTileFromGrid(tileGrid, row + dr, col + dc, gridSize);
            if (nt && isRoad(nt.type)) {
              const c = tileCenterWorld(nt, gridSize, tileSize);
              const d = (c.x - v.x) ** 2 + (c.z - v.z) ** 2;
              if (d < bestDist) {
                bestDist = d;
                bestTile = nt;
              }
            }
          }
        }
        if (bestTile) {
          const c = tileCenterWorld(bestTile, gridSize, tileSize);
          v.x = c.x;
          v.z = c.z;
          // Align heading to the road direction
          const conn = getRoadConnections(bestTile.type);
          if (conn.north || conn.south) v.heading = conn.north ? 0 : Math.PI;
          else if (conn.east || conn.west) v.heading = conn.east ? Math.PI / 2 : -Math.PI / 2;
        }
        continue; // skip rest of this vehicle's update
      }

      // Road-center attraction — strong lateral centering perpendicular to heading
      {
        const center = tileCenterWorld(tile, gridSize, tileSize);
        // Perpendicular to heading direction
        const perpX = Math.cos(v.heading);
        const perpZ = -Math.sin(v.heading);
        // Distance from center projected onto perpendicular axis
        const dx = v.x - center.x;
        const dz = v.z - center.z;
        const lateralDist = dx * perpX + dz * perpZ;
        // Pull toward center lane (allow small lane offset)
        const targetLateral = v.laneOffset * 0.3;
        const correction = (targetLateral - lateralDist) * 0.08;
        v.x += perpX * correction;
        v.z += perpZ * correction;
      }

      // Straight road heading correction — keep aligned to road axis
      if (tile.type === "road_straight_ns") {
        // Should be heading north (0) or south (PI)
        const targetH = Math.abs(v.heading) < Math.PI / 2 ? 0 : Math.PI;
        let diff = targetH - v.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.heading += diff * 0.15;
      } else if (tile.type === "road_straight_ew") {
        // Should be heading east (PI/2) or west (-PI/2)
        const h = ((v.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const targetH = h < Math.PI ? Math.PI / 2 : -Math.PI / 2;
        let diff = targetH - v.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.heading += diff * 0.15;
      }

      // Intersection / junction decision
      if (
        tile &&
        (tile.type === "road_intersection" ||
          tile.type.startsWith("road_t_") ||
          tile.type.startsWith("road_curve_")) &&
        (row !== v.lastTurnRow || col !== v.lastTurnCol)
      ) {
        const center = tileCenterWorld(tile, gridSize, tileSize);
        const distToCenter = Math.sqrt(
          (center.x - v.x) ** 2 + (center.z - v.z) ** 2
        );

        // Only decide when near center of intersection
        if (distToCenter < halfTile * 0.6) {
          v.lastTurnRow = row;
          v.lastTurnCol = col;

          const connections = getRoadConnections(tile.type);
          const dirs: ("north" | "south" | "east" | "west")[] = [];
          const weights: number[] = [];

          const currentDir = headingToDir(v.heading);
          const oppositeDir: Record<string, string> = {
            north: "south",
            south: "north",
            east: "west",
            west: "east",
          };

          const checkDir = (
            dir: "north" | "south" | "east" | "west",
            dr: number,
            dc: number
          ) => {
            if (!connections[dir]) return;
            // Don't U-turn
            if (dir === oppositeDir[currentDir]) return;

            const nextTile = getTileFromGrid(
              tileGrid,
              row + dr,
              col + dc,
              gridSize
            );
            if (nextTile && isRoad(nextTile.type)) {
              dirs.push(dir);
              // Favor going straight, aggressive vehicles take turns more often
              const isStraight = dir === currentDir;
              weights.push(
                isStraight ? 2.0 - v.aggressiveness * 0.8 : 0.5 + v.aggressiveness * 0.8
              );
            }
          };

          checkDir("north", -1, 0);
          checkDir("south", 1, 0);
          checkDir("east", 0, 1);
          checkDir("west", 0, -1);

          if (dirs.length > 0) {
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let r = rng() * totalWeight;
            let chosenDir = dirs[0];
            for (let i = 0; i < dirs.length; i++) {
              r -= weights[i];
              if (r <= 0) {
                chosenDir = dirs[i];
                break;
              }
            }
            v.heading = dirToHeading(chosenDir);
            v.state = "turning";
            v.turnTimer = 0.3;

            // Snap to road center when turning to prevent clipping
            v.x = center.x;
            v.z = center.z;
          }
        }
      }

      // Curve tiles: force heading to follow the curve
      if (tile && tile.type.startsWith("road_curve_")) {
        const center = tileCenterWorld(tile, gridSize, tileSize);
        const distToCenter = Math.sqrt(
          (center.x - v.x) ** 2 + (center.z - v.z) ** 2
        );
        if (
          distToCenter < halfTile * 0.8 &&
          (row !== v.lastTurnRow || col !== v.lastTurnCol)
        ) {
          v.lastTurnRow = row;
          v.lastTurnCol = col;
          const connections = getRoadConnections(tile.type);
          const currentDir = headingToDir(v.heading);
          // Find the direction that isn't where we came from
          const availableDirs = (
            ["north", "south", "east", "west"] as const
          ).filter(
            (d) =>
              connections[d] &&
              d !==
                ({
                  north: "south",
                  south: "north",
                  east: "west",
                  west: "east",
                }[currentDir] as typeof d)
          );
          if (availableDirs.length > 0) {
            v.heading = dirToHeading(availableDirs[0]);
            v.x = center.x;
            v.z = center.z;
          }
        }
      }

      // Update turn timer
      if (v.turnTimer > 0) {
        v.turnTimer -= dt;
        if (v.turnTimer <= 0) v.state = "driving";
      }

      // Aggressive lane offset changes — causes collisions on straights
      if (rng() < 0.005 * v.aggressiveness) {
        v.laneOffset += (rng() - 0.5) * 0.4;
        v.laneOffset = Math.max(-0.8, Math.min(0.8, v.laneOffset));
      }

      // Speed control — slow at intersections unless aggressive
      const isAtJunction =
        tile &&
        (tile.type === "road_intersection" ||
          tile.type.startsWith("road_t_") ||
          tile.type.startsWith("road_curve_"));
      const desiredSpeed = isAtJunction
        ? v.targetSpeed * (0.5 + v.aggressiveness * 0.5)
        : v.targetSpeed;
      v.speed += (desiredSpeed - v.speed) * 0.08;

      // Move — main direction + small lateral offset
      const perpX = Math.cos(v.heading);
      const perpZ = -Math.sin(v.heading);
      const laneX = perpX * v.laneOffset * 0.02;
      const laneZ = perpZ * v.laneOffset * 0.02;
      const newX = v.x + Math.sin(v.heading) * v.speed * dt + laneX;
      const newZ = v.z - Math.cos(v.heading) * v.speed * dt + laneZ;

      // Check if new position is on a road tile or building
      const { row: newRow, col: newCol } = worldToGrid(
        newX,
        newZ,
        gridSize,
        tileSize
      );
      const newTile = getTileFromGrid(tileGrid, newRow, newCol, gridSize);

      if (newTile && isRoad(newTile.type)) {
        // On road — allow movement
        v.x = newX;
        v.z = newZ;
      } else {
        // Would go off-road (building, park, edge, empty)
        // Don't move — just keep position, slow down, wait for next intersection turn
        v.speed *= 0.9;
        // If completely stuck (speed near zero), try to find a valid direction
        if (v.speed < 0.3) {
          const conn = getRoadConnections(tile.type);
          const currentDir = headingToDir(v.heading);
          const opposite: Record<string, "north" | "south" | "east" | "west"> = {
            north: "south", south: "north", east: "west", west: "east",
          };
          // Try any connected direction except where we're going (which is blocked)
          const altDirs = (["north", "south", "east", "west"] as const).filter(
            d => conn[d] && d !== currentDir
          );
          if (altDirs.length > 0) {
            // Pick a non-U-turn if possible
            const nonUturn = altDirs.filter(d => d !== opposite[currentDir]);
            const chosen = nonUturn.length > 0
              ? nonUturn[Math.floor(rng() * nonUturn.length)]
              : altDirs[Math.floor(rng() * altDirs.length)];
            v.heading = dirToHeading(chosen);
            v.speed = v.targetSpeed * 0.5;
            v.state = "turning";
            v.turnTimer = 0.4;
            // Snap to center for clean turn
            const center = tileCenterWorld(tile, gridSize, tileSize);
            v.x = center.x;
            v.z = center.z;
          } else {
            // Dead end — U-turn as last resort
            v.heading = dirToHeading(opposite[currentDir]);
            v.speed = v.targetSpeed * 0.3;
          }
        }
      }

      // Proximity braking — slow down if another vehicle is ahead
      for (const other of vehicles) {
        if (other === v || other.state === "crashed" || other.flying) continue;
        const dx = other.x - v.x;
        const dz = other.z - v.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 4) continue;

        // Is the other vehicle ahead of us?
        const aheadX = Math.sin(v.heading);
        const aheadZ = -Math.cos(v.heading);
        const dot = dx * aheadX + dz * aheadZ;
        if (dot > 0 && dot < 3.5) {
          // Vehicle ahead — brake based on distance
          const brakeFactor = 1 - dot / 4;
          v.speed = Math.min(v.speed, v.targetSpeed * brakeFactor);

          // Aggressive drivers might swerve instead
          if (v.aggressiveness > 0.6 && rng() < 0.02) {
            v.laneOffset += (rng() > 0.5 ? 1 : -1) * 0.5;
            v.laneOffset = Math.max(-1.2, Math.min(1.2, v.laneOffset));
          }
        }
      }
    }

    // Collision detection — ground vehicles only
    // Warm-up: no crashes in the first 1.5 seconds so vehicles can spread out
    if (!accidentPoint && time > 1.5) {
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

  return {
    frames,
    accidentPoint,
    accidentTime,
    accidentFrame,
    totalFrames: frames.length,
  };
}

export function generateSimulation(
  scene: SceneConfig,
  baseSeed: number,
  maxRetries: number = 15
): { result: SimulationResult; seed: number } | null {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const simSeed = baseSeed + attempt * 7919;
    const result = runSimulation(scene, simSeed);
    if (result) return { result, seed: simSeed };
  }
  return null;
}
