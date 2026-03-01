"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

interface Tile {
  row: number;
  col: number;
  type: string;
}

interface GlobeMiniProps {
  cityName?: string;
  cityLabel?: string;
  lat?: number;
  lon?: number;
  roads?: RoadSegment[];
  tiles?: Tile[];
  gridSize?: number;
  tileSize?: number;
}

export function GlobeMini({ cityName, cityLabel, lat, lon, roads, tiles, gridSize, tileSize }: GlobeMiniProps) {
  if (!cityName) return null;

  // Format coordinates for display
  const coordStr =
    lat !== undefined && lon !== undefined
      ? `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`
      : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-4 left-4 z-[100] pointer-events-none"
    >
      {/* GTA-style minimap container */}
      <div
        className="relative overflow-hidden border border-white/15 shadow-lg shadow-black/40"
        style={{
          width: 200,
          height: 200,
          borderRadius: 4,
          background: "#1a1f2a",
        }}
      >
        {/* Road map SVG */}
        <MiniMapRoads roads={roads} tiles={tiles} gridSize={gridSize} tileSize={tileSize} />

        {/* Compass indicator */}
        <div className="absolute top-1.5 right-1.5 text-[8px] text-white/40 font-mono font-bold">
          N
        </div>

        {/* City label overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <div
            className="text-[10px] text-white/90 tracking-wide leading-tight truncate"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            {cityName}
          </div>
          {cityLabel && (
            <div className="text-[8px] text-white/40 font-mono tracking-wider truncate">
              {cityLabel}
            </div>
          )}
        </div>
      </div>

      {/* Coordinates below minimap */}
      {coordStr && (
        <div className="text-[8px] text-white/25 font-mono tracking-wider mt-1 text-center">
          {coordStr}
        </div>
      )}
    </motion.div>
  );
}

function MiniMapRoads({ roads, tiles, gridSize, tileSize }: { roads?: RoadSegment[]; tiles?: Tile[]; gridSize?: number; tileSize?: number }) {
  const svgPaths = useMemo(() => {
    // If no polyline roads, generate paths from tile grid
    if ((!roads || roads.length === 0) && tiles && gridSize && tileSize) {
      const roadTiles = tiles.filter((t) => t.type.startsWith("road_"));
      if (roadTiles.length === 0) return null;
      const pad = 8;
      const size = 200;
      const drawSize = size - pad * 2;
      const half = gridSize / 2;
      const paths: { d: string; width: number; type: RoadSegment["type"] }[] = [];
      for (const t of roadTiles) {
        const sx = pad + ((t.col + 0.5) / gridSize) * drawSize;
        const sz = pad + ((t.row + 0.5) / gridSize) * drawSize;
        paths.push({
          d: `M${sx.toFixed(1)},${sz.toFixed(1)} L${(sx + 0.1).toFixed(1)},${(sz + 0.1).toFixed(1)}`,
          width: 2,
          type: "residential",
        });
      }
      return paths;
    }
    if (!roads || roads.length === 0) return null;

    // Find bounds of all roads
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const road of roads) {
      for (const p of road.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const range = Math.max(rangeX, rangeZ);
    const pad = 8; // px padding
    const size = 200;
    const drawSize = size - pad * 2;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const toSvg = (x: number, z: number): [number, number] => {
      const sx = pad + ((x - centerX) / range + 0.5) * drawSize;
      const sz = pad + ((z - centerZ) / range + 0.5) * drawSize;
      return [sx, sz];
    };

    const paths: { d: string; width: number; type: RoadSegment["type"] }[] = [];

    for (const road of roads) {
      if (road.points.length < 2) continue;
      const pts = road.points.map((p) => toSvg(p.x, p.z));
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

      let strokeWidth = 1;
      if (road.type === "primary") strokeWidth = 2;
      else if (road.type === "secondary") strokeWidth = 1.5;

      paths.push({ d, width: strokeWidth, type: road.type });
    }

    return paths;
  }, [roads]);

  if (!svgPaths) {
    // No road data — show placeholder grid pattern
    return (
      <svg width={200} height={200} className="absolute inset-0">
        {/* Simple grid pattern as placeholder */}
        {[40, 80, 120, 160].map((v) => (
          <line key={`h${v}`} x1={0} y1={v} x2={200} y2={v} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}
        {[40, 80, 120, 160].map((v) => (
          <line key={`v${v}`} x1={v} y1={0} x2={v} y2={200} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}
      </svg>
    );
  }

  return (
    <svg width={200} height={200} className="absolute inset-0">
      {/* Road outlines (darker, slightly wider) */}
      {svgPaths.map((p, i) => (
        <path
          key={`outline-${i}`}
          d={p.d}
          fill="none"
          stroke="rgba(80,80,100,0.5)"
          strokeWidth={p.width + 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Road lines */}
      {svgPaths.map((p, i) => (
        <path
          key={`road-${i}`}
          d={p.d}
          fill="none"
          stroke={
            p.type === "primary"
              ? "rgba(255,255,255,0.45)"
              : p.type === "secondary"
                ? "rgba(255,255,255,0.3)"
                : "rgba(255,255,255,0.18)"
          }
          strokeWidth={p.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
