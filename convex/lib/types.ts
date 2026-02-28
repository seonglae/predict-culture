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
  | "water"
  | "river"
  | "forest"
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
  cityName?: string;
  cityLabel?: string;
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

// Vibrant pastel building colors — bright, cute, modern
export const BUILDING_COLORS = [
  "#ffb3c6", // hot pink pastel
  "#a2d2ff", // bright sky blue
  "#cdb4db", // vivid lilac
  "#ffd6a5", // warm peach
  "#caffbf", // bright mint
  "#bde0fe", // cornflower blue
  "#ffc8dd", // candy pink
  "#b8e0d2", // aqua mint
  "#d0b8ff", // electric lavender
  "#fdffb6", // lemon cream
];

// Modern vehicle colors — soft pastels, contemporary feel
export const VEHICLE_COLORS = [
  "#94b8d0", // dusty blue
  "#e8a0bf", // soft rose
  "#b5c99a", // sage green
  "#c4a7d7", // lavender mist
  "#f2cc8f", // warm sand
  "#a8dadc", // powder teal
  "#d4a5a5", // blush mauve
  "#89b0ae", // muted seafoam
  "#dda0dd", // soft plum
  "#b8d4e3", // sky wash
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
