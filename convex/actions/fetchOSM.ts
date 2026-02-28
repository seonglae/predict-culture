"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type {
  Tile,
  TileType,
  VehicleSpawn,
  SceneConfig,
  Difficulty,
} from "../lib/types";
import {
  DIFFICULTY_CONFIG,
  BUILDING_COLORS,
  VEHICLE_COLORS,
} from "../lib/types";
import { CITY_CONFIGS } from "../lib/cityData";

// Seeded PRNG — mulberry32
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Direction helpers
type Dir = "north" | "south" | "east" | "west";

function isRoad(type: TileType): boolean {
  return type.startsWith("road_");
}

function hasConnection(type: TileType, dir: Dir): boolean {
  const connections: Record<string, Dir[]> = {
    road_straight_ns: ["north", "south"],
    road_straight_ew: ["east", "west"],
    road_intersection: ["north", "south", "east", "west"],
    road_t_north: ["north", "east", "west"],
    road_t_south: ["south", "east", "west"],
    road_t_east: ["north", "south", "east"],
    road_t_west: ["north", "south", "west"],
    road_curve_ne: ["north", "east"],
    road_curve_nw: ["north", "west"],
    road_curve_se: ["south", "east"],
    road_curve_sw: ["south", "west"],
  };
  return connections[type]?.includes(dir) ?? false;
}

interface OSMWay {
  type: "road" | "water";
  nodes: { lat: number; lon: number }[];
}

/**
 * Fetch roads + waterways from Overpass API for a given bounding box.
 */
async function fetchOverpassData(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): Promise<OSMWay[]> {
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `
[out:json][timeout:10];
(
  way["highway"~"primary|secondary|tertiary|residential|trunk|unclassified"](${bbox});
  way["waterway"](${bbox});
);
out body;
>;
out skel qt;
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();

    // Build node lookup
    const nodes: Record<number, { lat: number; lon: number }> = {};
    for (const el of data.elements) {
      if (el.type === "node") {
        nodes[el.id] = { lat: el.lat, lon: el.lon };
      }
    }

    // Extract ways
    const ways: OSMWay[] = [];
    for (const el of data.elements) {
      if (el.type !== "way" || !el.nodes) continue;
      const wayNodes = el.nodes
        .map((nid: number) => nodes[nid])
        .filter(Boolean);
      if (wayNodes.length < 2) continue;

      const isWater = el.tags?.waterway !== undefined;
      ways.push({
        type: isWater ? "water" : "road",
        nodes: wayNodes,
      });
    }

    return ways;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

/**
 * Convert lat/lon to grid row/col using simple equirectangular projection.
 */
function latLonToGrid(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  gridSize: number,
  metersPerTile: number
): { row: number; col: number } {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180);

  const dx = (lon - centerLon) * metersPerDegLon;
  const dz = (centerLat - lat) * metersPerDegLat; // north is negative row

  const col = Math.floor(dx / metersPerTile + gridSize / 2);
  const row = Math.floor(dz / metersPerTile + gridSize / 2);

  return { row, col };
}

/**
 * Bresenham line walk — rasterize a line segment onto the grid.
 */
function bresenhamLine(
  r0: number,
  c0: number,
  r1: number,
  c1: number
): { row: number; col: number }[] {
  const points: { row: number; col: number }[] = [];
  let dr = Math.abs(r1 - r0);
  let dc = Math.abs(c1 - c0);
  let sr = r0 < r1 ? 1 : -1;
  let sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;
  let r = r0;
  let c = c0;

  while (true) {
    points.push({ row: r, col: c });
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) {
      err -= dc;
      r += sr;
    }
    if (e2 < dr) {
      err += dr;
      c += sc;
    }
  }
  return points;
}

/**
 * Rasterize OSM ways onto a tile grid.
 */
function rasterizeOSM(
  ways: OSMWay[],
  centerLat: number,
  centerLon: number,
  gridSize: number,
  metersPerTile: number
): TileType[][] {
  const grid: TileType[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => "empty" as TileType)
  );

  // Rasterize each way
  for (const way of ways) {
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = latLonToGrid(
        way.nodes[i].lat,
        way.nodes[i].lon,
        centerLat,
        centerLon,
        gridSize,
        metersPerTile
      );
      const b = latLonToGrid(
        way.nodes[i + 1].lat,
        way.nodes[i + 1].lon,
        centerLat,
        centerLon,
        gridSize,
        metersPerTile
      );

      const line = bresenhamLine(a.row, a.col, b.row, b.col);
      for (const { row, col } of line) {
        if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) continue;
        if (way.type === "water") {
          if (!isRoad(grid[row][col])) {
            grid[row][col] = "water";
          }
        } else {
          // Road — mark as straight initially, will fix connectivity later
          grid[row][col] = "road_straight_ns"; // placeholder
        }
      }
    }
  }

  return grid;
}

/**
 * Fix road connectivity — convert to proper T-junctions, curves, intersections.
 * Same NSEW logic as existing mapGenerator.
 */
function fixRoadConnectivity(grid: TileType[][], gridSize: number) {
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (!isRoad(grid[row][col])) continue;

      const north = row > 0 && isRoad(grid[row - 1][col]);
      const south = row < gridSize - 1 && isRoad(grid[row + 1][col]);
      const east = col < gridSize - 1 && isRoad(grid[row][col + 1]);
      const west = col > 0 && isRoad(grid[row][col - 1]);

      const connections = [north, south, east, west].filter(Boolean).length;

      if (connections === 4) {
        grid[row][col] = "road_intersection";
      } else if (connections === 3) {
        if (!north) grid[row][col] = "road_t_south";
        else if (!south) grid[row][col] = "road_t_north";
        else if (!east) grid[row][col] = "road_t_west";
        else grid[row][col] = "road_t_east";
      } else if (connections === 2) {
        if (north && south) grid[row][col] = "road_straight_ns";
        else if (east && west) grid[row][col] = "road_straight_ew";
        else if (north && east) grid[row][col] = "road_curve_ne";
        else if (north && west) grid[row][col] = "road_curve_nw";
        else if (south && east) grid[row][col] = "road_curve_se";
        else if (south && west) grid[row][col] = "road_curve_sw";
      } else if (connections === 1) {
        if (north || south) grid[row][col] = "road_straight_ns";
        else grid[row][col] = "road_straight_ew";
      } else {
        // Isolated road tile with no neighbors — keep as EW straight
        grid[row][col] = "road_straight_ew";
      }
    }
  }
}

/**
 * Fill non-road cells: adjacent to road → building, near water → water, else → park.
 */
function fillNonRoadCells(
  grid: TileType[][],
  gridSize: number,
  rng: () => number
) {
  const buildingTypes: TileType[] = [
    "building_small",
    "building_medium",
    "building_tall",
  ];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (isRoad(grid[row][col]) || grid[row][col] === "water") continue;

      const adjRoad =
        (row > 0 && isRoad(grid[row - 1][col])) ||
        (row < gridSize - 1 && isRoad(grid[row + 1][col])) ||
        (col > 0 && isRoad(grid[row][col - 1])) ||
        (col < gridSize - 1 && isRoad(grid[row][col + 1]));

      const adjWater =
        (row > 0 && grid[row - 1][col] === "water") ||
        (row < gridSize - 1 && grid[row + 1][col] === "water") ||
        (col > 0 && grid[row][col - 1] === "water") ||
        (col < gridSize - 1 && grid[row][col + 1] === "water");

      if (adjWater && rng() > 0.6) {
        grid[row][col] = "water";
      } else if (adjRoad) {
        grid[row][col] = pick(rng, buildingTypes);
      } else {
        grid[row][col] = rng() > 0.4 ? pick(rng, buildingTypes) : "park";
      }
    }
  }
}

/**
 * Convert grid to Tile[] and spawn vehicles — reuses same logic as mapGenerator.
 */
function gridToSceneConfig(
  grid: TileType[][],
  gridSize: number,
  tileSize: number,
  difficulty: Difficulty,
  seed: number,
  cityName: string,
  cityLabel: string
): SceneConfig {
  const rng = mulberry32(seed + 999);
  const config = DIFFICULTY_CONFIG[difficulty];

  const tiles: Tile[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const type = grid[row][col];
      const tile: Tile = { row, col, type };

      if (type === "building_small") {
        tile.height = 1.5 + rng() * 1;
        tile.color = pick(rng, BUILDING_COLORS);
      } else if (type === "building_medium") {
        tile.height = 3 + rng() * 2;
        tile.color = pick(rng, BUILDING_COLORS);
      } else if (type === "building_tall") {
        tile.height = 5 + rng() * 4;
        tile.color = pick(rng, BUILDING_COLORS);
      } else if (type === "park") {
        tile.color = "#b5ead7";
      } else if (type === "water") {
        tile.color = "#7ec8e3";
      }

      tiles.push(tile);
    }
  }

  // Spawn vehicles on road tiles
  const roadTiles = tiles.filter((t) => isRoad(t.type));
  const vehicleCount = randomInt(
    rng,
    config.vehicleRange[0],
    config.vehicleRange[1]
  );
  const shuffledRoads = shuffle(rng, roadTiles);

  const vehicleTypes: ("car" | "truck" | "bus" | "motorcycle")[] = [
    "car",
    "car",
    "car",
    "motorcycle",
    "truck",
    "bus",
  ];

  const vehicles: VehicleSpawn[] = [];
  const usedPositions = new Set<string>();

  for (let i = 0; i < vehicleCount && i < shuffledRoads.length; i++) {
    const tile = shuffledRoads[i];
    const posKey = `${tile.row},${tile.col}`;
    if (usedPositions.has(posKey)) continue;
    usedPositions.add(posKey);

    const vType = pick(rng, vehicleTypes);
    const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
    const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;

    let heading = 0;
    if (tile.type === "road_straight_ns")
      heading = rng() > 0.5 ? 0 : Math.PI;
    else if (tile.type === "road_straight_ew")
      heading = rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    else {
      const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      heading = pick(rng, cardinals);
    }

    vehicles.push({
      id: `v${i}`,
      type: vType,
      x,
      z,
      heading,
      speed: vType === "motorcycle" ? 3.5 + rng() * 3.5 : 2.5 + rng() * 3,
      aggressiveness:
        vType === "motorcycle" ? 0.6 + rng() * 0.4 : 0.3 + rng() * 0.7,
      color: pick(rng, VEHICLE_COLORS),
    });
  }

  // Flying vehicles for hard/hell
  const { droneCount, helicopterCount } = config;
  const mapRadius = (gridSize * tileSize) / 2;

  for (let i = 0; i < droneCount; i++) {
    vehicles.push({
      id: `drone${i}`,
      type: "drone",
      x: (rng() - 0.5) * mapRadius * 1.5,
      z: (rng() - 0.5) * mapRadius * 1.5,
      heading: rng() * Math.PI * 2,
      speed: 1.5 + rng() * 2,
      aggressiveness: 0,
      color: "#a8dadc",
      flying: true,
      altitude: 5 + rng() * 3,
    });
  }

  for (let i = 0; i < helicopterCount; i++) {
    vehicles.push({
      id: `heli${i}`,
      type: "helicopter",
      x: (rng() - 0.5) * mapRadius * 1.2,
      z: (rng() - 0.5) * mapRadius * 1.2,
      heading: rng() * Math.PI * 2,
      speed: 1 + rng() * 1.5,
      aggressiveness: 0,
      color: "#89b0ae",
      flying: true,
      altitude: 10 + rng() * 4,
    });
  }

  return {
    gridSize,
    tileSize,
    tiles,
    vehicles,
    mapRadius,
    cityName,
    cityLabel,
  };
}

/**
 * Main action: fetch OSM data for a random city and generate a SceneConfig.
 * Falls back to procedural generation if Overpass fails or road count too low.
 */
export const generateMapFromOSM = internalAction({
  args: {
    battleId: v.id("battles"),
    mapSeed: v.number(),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("normal"),
      v.literal("hard"),
      v.literal("hell")
    ),
  },
  handler: async (ctx, { battleId, mapSeed, difficulty }) => {
    const rng = mulberry32(mapSeed);
    const config = DIFFICULTY_CONFIG[difficulty];
    const gridSize = config.gridSize;
    const tileSize = 4;
    const metersPerTile = 50;

    // Pick a random city
    const city = CITY_CONFIGS[Math.floor(rng() * CITY_CONFIGS.length)];

    // Compute bounding box
    const halfExtentMeters = (gridSize * metersPerTile) / 2;
    const metersPerDegLat = 111320;
    const metersPerDegLon =
      111320 * Math.cos((city.lat * Math.PI) / 180);
    const dLat = halfExtentMeters / metersPerDegLat;
    const dLon = halfExtentMeters / metersPerDegLon;

    const minLat = city.lat - dLat;
    const maxLat = city.lat + dLat;
    const minLon = city.lon - dLon;
    const maxLon = city.lon + dLon;

    // Fetch OSM data
    const ways = await fetchOverpassData(minLat, minLon, maxLat, maxLon);

    const roadWays = ways.filter((w) => w.type === "road");
    const minRoads = gridSize * 2;

    let scene: SceneConfig;

    if (roadWays.length >= minRoads) {
      // Rasterize OSM data onto grid
      const grid = rasterizeOSM(
        ways,
        city.lat,
        city.lon,
        gridSize,
        metersPerTile
      );

      // Count road tiles
      let roadCount = 0;
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (isRoad(grid[r][c])) roadCount++;
        }
      }

      if (roadCount >= minRoads) {
        fixRoadConnectivity(grid, gridSize);
        fillNonRoadCells(grid, gridSize, rng);
        scene = gridToSceneConfig(
          grid,
          gridSize,
          tileSize,
          difficulty,
          mapSeed,
          city.name,
          city.label
        );
      } else {
        // Too few roads after rasterization — fallback
        scene = await fallbackGenerate(ctx, battleId, mapSeed, difficulty, city);
      }
    } else {
      // Not enough OSM data — fallback
      scene = await fallbackGenerate(ctx, battleId, mapSeed, difficulty, city);
    }

    // Run simulation
    // We import dynamically to avoid pulling simulation into the action bundle unnecessarily
    const { generateSimulation } = await import("../lib/simulation");
    const simResult = generateSimulation(scene, mapSeed);

    if (!simResult) {
      // Retry with different seed
      const newSeed = mapSeed + 100000;
      const { generateMap } = await import("../lib/mapGenerator");
      const newScene = generateMap(newSeed, difficulty);
      newScene.cityName = city.name;
      newScene.cityLabel = city.label;
      const retryResult = generateSimulation(newScene, newSeed);

      if (!retryResult) {
        await ctx.runMutation(internal.battles.setGeneratedBattle, {
          battleId,
          status: "cancelled",
        });
        return;
      }

      await ctx.runMutation(internal.battles.setGeneratedBattle, {
        battleId,
        mapSeed: newSeed,
        sceneConfig: newScene,
        simulationData: retryResult.result.frames,
        accidentPoint: retryResult.result.accidentPoint,
        accidentTime: retryResult.result.accidentTime,
        accidentFrame: retryResult.result.accidentFrame,
        totalFrames: retryResult.result.totalFrames,
        cityName: city.name,
        status: "active",
      });
      return;
    }

    await ctx.runMutation(internal.battles.setGeneratedBattle, {
      battleId,
      mapSeed,
      sceneConfig: scene,
      simulationData: simResult.result.frames,
      accidentPoint: simResult.result.accidentPoint,
      accidentTime: simResult.result.accidentTime,
      accidentFrame: simResult.result.accidentFrame,
      totalFrames: simResult.result.totalFrames,
      cityName: city.name,
      status: "active",
    });
  },
});

async function fallbackGenerate(
  ctx: any,
  battleId: any,
  mapSeed: number,
  difficulty: Difficulty,
  city: { name: string; label: string }
): Promise<SceneConfig> {
  const { generateMap } = await import("../lib/mapGenerator");
  const scene = generateMap(mapSeed, difficulty);
  scene.cityName = city.name;
  scene.cityLabel = city.label;
  return scene;
}
