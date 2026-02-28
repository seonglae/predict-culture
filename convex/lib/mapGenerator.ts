import {
  type Tile,
  type TileType,
  type VehicleSpawn,
  type SceneConfig,
  type Difficulty,
  DIFFICULTY_CONFIG,
  BUILDING_COLORS,
  VEHICLE_COLORS,
  CITIES,
} from "./types";

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

function isRoad(type: TileType): boolean {
  return type.startsWith("road_");
}

/**
 * Generate a tile map with connected roads, buildings, and vehicle spawns.
 * Uses a city name for flavor (the layout is procedural but themed).
 */
export function generateMap(
  seed: number,
  difficulty: Difficulty
): SceneConfig {
  const rng = mulberry32(seed);
  const config = DIFFICULTY_CONFIG[difficulty];
  const gridSize = config.gridSize;
  const tileSize = 4; // each tile is 4x4 units

  // Initialize grid
  const grid: TileType[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => "empty" as TileType)
  );

  // Step 1: Create road network using random walk + grid pattern
  // Main roads: cross pattern through center
  const mid = Math.floor(gridSize / 2);

  // Horizontal main road
  for (let col = 0; col < gridSize; col++) {
    grid[mid][col] = "road_straight_ew";
  }

  // Vertical main road
  for (let row = 0; row < gridSize; row++) {
    if (row === mid) {
      grid[row][mid] = "road_intersection";
    } else {
      grid[row][mid] = "road_straight_ns";
    }
  }

  // Add secondary roads (perpendicular branches)
  const numBranches = randomInt(rng, 2, Math.floor(gridSize / 2));
  for (let b = 0; b < numBranches; b++) {
    const isHorizontal = rng() > 0.5;
    if (isHorizontal) {
      const row = randomInt(rng, 1, gridSize - 2);
      if (row === mid) continue;
      const startCol = randomInt(rng, 0, Math.floor(gridSize / 2));
      const endCol = randomInt(rng, Math.floor(gridSize / 2), gridSize - 1);
      for (let col = startCol; col <= endCol; col++) {
        if (grid[row][col] === "road_straight_ns") {
          grid[row][col] = "road_intersection";
        } else if (isRoad(grid[row][col]) && grid[row][col] !== "road_straight_ew") {
          grid[row][col] = "road_intersection";
        } else {
          grid[row][col] = "road_straight_ew";
        }
      }
      // Connect to main vertical road
      if (startCol <= mid && endCol >= mid) {
        grid[row][mid] = "road_intersection";
      }
    } else {
      const col = randomInt(rng, 1, gridSize - 2);
      if (col === mid) continue;
      const startRow = randomInt(rng, 0, Math.floor(gridSize / 2));
      const endRow = randomInt(rng, Math.floor(gridSize / 2), gridSize - 1);
      for (let row = startRow; row <= endRow; row++) {
        if (grid[row][col] === "road_straight_ew") {
          grid[row][col] = "road_intersection";
        } else if (isRoad(grid[row][col]) && grid[row][col] !== "road_straight_ns") {
          grid[row][col] = "road_intersection";
        } else {
          grid[row][col] = "road_straight_ns";
        }
      }
      if (startRow <= mid && endRow >= mid) {
        grid[mid][col] = "road_intersection";
      }
    }
  }

  // Step 2: Fix road connectivity — replace with proper T-junctions and curves
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
        // Dead end — extend as straight
        if (north || south) grid[row][col] = "road_straight_ns";
        else grid[row][col] = "road_straight_ew";
      }
    }
  }

  // Step 3: Fill non-road tiles with buildings and parks
  const buildingTypes: TileType[] = ["building_small", "building_medium", "building_tall"];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (isRoad(grid[row][col])) continue;

      // Adjacent to road? → building. Otherwise → park or empty
      const adjRoad =
        (row > 0 && isRoad(grid[row - 1][col])) ||
        (row < gridSize - 1 && isRoad(grid[row + 1][col])) ||
        (col > 0 && isRoad(grid[row][col - 1])) ||
        (col < gridSize - 1 && isRoad(grid[row][col + 1]));

      if (adjRoad) {
        grid[row][col] = pick(rng, buildingTypes);
      } else {
        grid[row][col] = rng() > 0.4 ? pick(rng, buildingTypes) : "park";
      }
    }
  }

  // Step 4: Convert grid to tile array
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
      }

      tiles.push(tile);
    }
  }

  // Step 5: Spawn vehicles on road edges
  const roadTiles = tiles.filter((t) => isRoad(t.type));
  const vehicleCount = randomInt(rng, config.vehicleRange[0], config.vehicleRange[1]);
  const shuffledRoads = shuffle(rng, roadTiles);

  // Vehicle type pool — motorcycles added for variety
  const vehicleTypes: ("car" | "truck" | "bus" | "motorcycle")[] = [
    "car", "car", "car", "motorcycle", "truck", "bus",
  ];

  const vehicles: VehicleSpawn[] = [];
  const usedPositions = new Set<string>();

  for (let i = 0; i < vehicleCount && i < shuffledRoads.length; i++) {
    const tile = shuffledRoads[i];
    const posKey = `${tile.row},${tile.col}`;
    if (usedPositions.has(posKey)) continue;
    usedPositions.add(posKey);

    const vType = pick(rng, vehicleTypes);
    // Spawn at road center with minimal offset
    const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
    const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;

    // Heading based on road direction — use proper cardinal headings
    let heading = 0;
    if (tile.type === "road_straight_ns") heading = rng() > 0.5 ? 0 : Math.PI;
    else if (tile.type === "road_straight_ew") heading = rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    else {
      // At intersections, pick a random cardinal direction
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
      aggressiveness: vType === "motorcycle" ? 0.6 + rng() * 0.4 : 0.3 + rng() * 0.7,
      color: pick(rng, VEHICLE_COLORS),
    });
  }

  // Step 6: Spawn flying vehicles (drones/helicopters) for hard/hell mode
  const { droneCount, helicopterCount } = config;
  const mapRadius = (gridSize * tileSize) / 2;
  let flyingIdx = vehicleCount;

  for (let i = 0; i < droneCount; i++) {
    vehicles.push({
      id: `drone${i}`,
      type: "drone",
      x: (rng() - 0.5) * mapRadius * 1.5,
      z: (rng() - 0.5) * mapRadius * 1.5,
      heading: rng() * Math.PI * 2,
      speed: 1.5 + rng() * 2,
      aggressiveness: 0,
      color: "#00bbf9",
      flying: true,
      altitude: 5 + rng() * 3,
    });
    flyingIdx++;
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
      color: "#264653",
      flying: true,
      altitude: 10 + rng() * 4,
    });
    flyingIdx++;
  }

  const cityName = pick(rng, CITIES);

  return {
    gridSize,
    tileSize,
    tiles,
    vehicles,
    mapRadius,
  };
}
