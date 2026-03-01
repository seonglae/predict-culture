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

export interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

export interface BuildingFootprint {
  /** Polygon vertices in world coordinates (closed loop) */
  polygon: { x: number; z: number }[];
  /** Height in world units */
  height: number;
  /** Building color */
  color: string;
}

export interface SceneConfig {
  gridSize: number;
  tileSize: number;
  tiles: Tile[];
  vehicles: VehicleSpawn[];
  mapRadius: number;
  cityName?: string;
  cityLabel?: string;
  roads?: RoadSegment[];
  buildings?: BuildingFootprint[];
  lat?: number;
  lon?: number;
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

// Japanese urban building colors — muted, sophisticated, concrete/glass
export const BUILDING_COLORS = [
  "#e8e4df", // warm concrete
  "#d5cfc7", // aged concrete
  "#c8c2b8", // stone gray
  "#bfb8ae", // warm gray
  "#d4cec5", // light concrete
  "#eae6e1", // pale stone
  "#ccc6bc", // taupe
  "#e0dbd4", // cream concrete
  "#b8b2a8", // dark warm gray
  "#c4bfb5", // mushroom
];

// Realistic Japanese vehicle colors — mostly white/silver/black with some accents
export const VEHICLE_COLORS = [
  "#f5f5f5", // white (most common in Japan)
  "#f5f5f5", // white
  "#e8e8e8", // pearl white
  "#c0c0c0", // silver
  "#a8a8a8", // light gray
  "#3a3a3a", // black
  "#2c2c2c", // dark black
  "#1a3a5c", // dark navy
  "#8b1a1a", // dark red
  "#2d4a3e", // forest green
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
