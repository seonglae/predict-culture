export type Difficulty = "easy" | "normal" | "hard" | "hell";
export type BattleStatus = "waiting" | "simulating" | "active" | "completed" | "cancelled";

export type TileType =
  | "road_straight_ns"
  | "road_straight_ew"
  | "road_intersection"
  | "road_t_north"
  | "road_t_south"
  | "road_t_east"
  | "road_t_west"
  | "road_curve_ne"
  | "road_curve_nw"
  | "road_curve_se"
  | "road_curve_sw"
  | "building_small"
  | "building_medium"
  | "building_tall"
  | "park"
  | "empty";

export interface Tile {
  row: number;
  col: number;
  type: TileType;
  height?: number;
  color?: string;
}

export type VehicleType = "car" | "truck" | "bus" | "motorcycle" | "drone" | "helicopter";
export type VehicleState = "driving" | "turning" | "braking" | "crashed";

export interface VehicleSpawn {
  id: string;
  type: VehicleType;
  x: number;
  z: number;
  heading: number;
  speed: number;
  aggressiveness: number;
  color: string;
  flying?: boolean; // drones/helicopters
  altitude?: number;
}

export interface VehicleFrame {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: VehicleState;
  flying?: boolean;
  altitude?: number;
}

export interface SimulationFrame {
  time: number;
  vehicles: VehicleFrame[];
}

export interface SceneConfig {
  gridSize: number;
  tileSize: number;
  tiles: Tile[];
  vehicles: VehicleSpawn[];
  mapRadius: number;
}

export interface SimulationResult {
  frames: SimulationFrame[];
  accidentPoint: { x: number; z: number };
  accidentTime: number;
  accidentFrame: number;
  totalFrames: number;
}

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  {
    gridSize: number;
    vehicleRange: [number, number];
    aiToolCalls: number;
    droneCount: number;
    helicopterCount: number;
  }
> = {
  easy: { gridSize: 6, vehicleRange: [4, 6], aiToolCalls: 2, droneCount: 0, helicopterCount: 0 },
  normal: { gridSize: 8, vehicleRange: [8, 12], aiToolCalls: 4, droneCount: 0, helicopterCount: 0 },
  hard: { gridSize: 12, vehicleRange: [15, 20], aiToolCalls: 6, droneCount: 2, helicopterCount: 0 },
  hell: { gridSize: 16, vehicleRange: [25, 35], aiToolCalls: 8, droneCount: 4, helicopterCount: 2 },
};

// Modern building colors — less saccharine, more architectural
export const BUILDING_COLORS = [
  "#e8b4b8", // dusty rose
  "#92b4c8", // steel blue
  "#b8a9c9", // muted lavender
  "#d4a574", // terracotta
  "#a3c4a8", // sage
  "#c9b896", // sandstone
  "#d1848f", // mauve
  "#8ba4b8", // slate
  "#c8c3b8", // warm gray
  "#b4ccc4", // seafoam
];

// Modern vehicle colors — bolder, more distinct
export const VEHICLE_COLORS = [
  "#e63946", // crimson
  "#2ec4b6", // teal
  "#f4a261", // amber
  "#264653", // deep teal
  "#e76f51", // burnt sienna
  "#606c38", // olive
  "#457b9d", // blue steel
  "#9b5de5", // electric purple
  "#f15bb5", // hot pink
  "#00bbf9", // cyan
];

export const CITIES = [
  "New York",
  "London",
  "Paris",
  "Tokyo",
  "Singapore",
  "Los Angeles",
  "San Francisco",
] as const;
