"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface Tile {
  row: number;
  col: number;
  type: string;
  height?: number;
  color?: string;
}

interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

interface WaterPolygon {
  polygon: { x: number; z: number }[];
}

interface RoadsProps {
  tiles: Tile[];
  gridSize: number;
  tileSize: number;
  roads?: RoadSegment[];
  waterPolygons?: WaterPolygon[];
}

function isRoad(type: string): boolean {
  return type.startsWith("road_");
}

function isWater(type: string): boolean {
  return type === "water" || type === "river";
}

/**
 * Trim a polyline by removing `trimDist` from each end.
 * Returns a shorter polyline, or null if too short.
 */
function trimPolyline(
  points: { x: number; z: number }[],
  trimDist: number
): { x: number; z: number }[] | null {
  if (points.length < 2) return null;

  // Compute cumulative distances
  const cumDist: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  const totalLen = cumDist[cumDist.length - 1];
  if (totalLen < trimDist * 2 + 0.3) return null;

  const startDist = trimDist;
  const endDist = totalLen - trimDist;
  const result: { x: number; z: number }[] = [];

  // Interpolate start point
  for (let i = 0; i < points.length - 1; i++) {
    if (cumDist[i + 1] >= startDist) {
      const segLen = cumDist[i + 1] - cumDist[i];
      const t = segLen > 0.001 ? (startDist - cumDist[i]) / segLen : 0;
      result.push({
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        z: points[i].z + (points[i + 1].z - points[i].z) * t,
      });
      break;
    }
  }

  // Middle points
  for (let i = 1; i < points.length - 1; i++) {
    if (cumDist[i] > startDist && cumDist[i] < endDist) {
      result.push(points[i]);
    }
  }

  // Interpolate end point
  for (let i = points.length - 1; i > 0; i--) {
    if (cumDist[i - 1] <= endDist) {
      const segLen = cumDist[i] - cumDist[i - 1];
      const t = segLen > 0.001 ? (endDist - cumDist[i - 1]) / segLen : 1;
      result.push({
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        z: points[i - 1].z + (points[i].z - points[i - 1].z) * t,
      });
      break;
    }
  }

  return result.length >= 2 ? result : null;
}

/**
 * Build a ribbon mesh geometry from a polyline — 2 triangles per segment.
 */
function buildRoadRibbonGeometry(
  points: { x: number; z: number }[],
  width: number
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    // Compute direction for perpendicular offset
    let dx: number, dz: number;
    if (i === 0) {
      dx = points[1].x - p.x;
      dz = points[1].z - p.z;
    } else if (i === points.length - 1) {
      dx = p.x - points[i - 1].x;
      dz = p.z - points[i - 1].z;
    } else {
      // Average of prev and next direction for smooth joints
      dx = points[i + 1].x - points[i - 1].x;
      dz = points[i + 1].z - points[i - 1].z;
    }

    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    // Perpendicular (rotate 90 degrees)
    const nx = -dz / len;
    const nz = dx / len;

    const hw = width / 2;
    // Left vertex
    vertices.push(p.x + nx * hw, 0.015, p.z + nz * hw);
    // Right vertex
    vertices.push(p.x - nx * hw, 0.015, p.z - nz * hw);

    if (i < points.length - 1) {
      const bi = i * 2;
      // Two triangles for this segment
      indices.push(bi, bi + 2, bi + 1);
      indices.push(bi + 1, bi + 2, bi + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build dashed center line geometry for a road polyline.
 */
function buildCenterLineGeometry(
  points: { x: number; z: number }[],
  dashLen: number,
  gapLen: number,
  lineWidth: number
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertCount = 0;

  // Walk the polyline at fixed intervals, drawing dashes
  const cycle = dashLen + gapLen;
  let cumDist = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    const ux = dx / segLen;
    const uz = dz / segLen;
    const nx = -uz;
    const nz = ux;
    const hw = lineWidth / 2;

    let t = 0;
    while (t < segLen - 0.001) {
      const posInCycle = cumDist % cycle;
      const drawing = posInCycle < dashLen;

      if (drawing) {
        const dashRemaining = dashLen - posInCycle;
        const step = Math.max(0.01, Math.min(segLen - t, dashRemaining));

        const sx = p0.x + ux * t;
        const sz = p0.z + uz * t;
        const ex = p0.x + ux * (t + step);
        const ez = p0.z + uz * (t + step);

        const bi = vertCount;
        vertices.push(sx + nx * hw, 0.02, sz + nz * hw);
        vertices.push(sx - nx * hw, 0.02, sz - nz * hw);
        vertices.push(ex + nx * hw, 0.02, ez + nz * hw);
        vertices.push(ex - nx * hw, 0.02, ez - nz * hw);
        indices.push(bi, bi + 2, bi + 1);
        indices.push(bi + 1, bi + 2, bi + 3);
        vertCount += 4;

        cumDist += step;
        t += step;
      } else {
        const gapRemaining = cycle - posInCycle;
        const step = Math.max(0.01, Math.min(segLen - t, gapRemaining));
        cumDist += step;
        t += step;
      }

      // Safety: prevent runaway loops
      if (vertCount > 50000) break;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function PolylineRoads({ roads }: { roads: RoadSegment[] }) {
  const geometries = useMemo(() => {
    const roadSurfaces: THREE.BufferGeometry[] = [];
    const yellowLines: THREE.BufferGeometry[] = [];

    for (const road of roads) {
      if (road.points.length < 2) continue;

      // Road surface — full length
      roadSurfaces.push(buildRoadRibbonGeometry(road.points, road.width));

      // Yellow dashed center line — trimmed at intersections
      const trimDist = Math.max(road.width * 0.4, 0.8);
      const trimmed = trimPolyline(road.points, trimDist);
      if (trimmed) {
        yellowLines.push(buildCenterLineGeometry(trimmed, 1.2, 0.8, 0.12));
      }
    }

    return { roadSurfaces, yellowLines };
  }, [roads]);

  return (
    <group>
      {/* Road surface */}
      {geometries.roadSurfaces.map((geo, i) => (
        <mesh key={`road-${i}`} geometry={geo} receiveShadow>
          <meshStandardMaterial color="#3a3a3e" roughness={0.85} metalness={0.02} />
        </mesh>
      ))}
      {/* Yellow dashed center line */}
      {geometries.yellowLines.map((geo, i) => (
        <mesh key={`yellow-${i}`} geometry={geo}>
          <meshBasicMaterial color="#e8b500" />
        </mesh>
      ))}
    </group>
  );
}

export function Roads({ tiles, gridSize, tileSize, roads, waterPolygons }: RoadsProps) {
  const roadTiles = useMemo(() => tiles.filter((t) => isRoad(t.type)), [tiles]);
  const waterTiles = useMemo(() => tiles.filter((t) => isWater(t.type)), [tiles]);

  const hasPolylineRoads = roads && roads.length > 0;
  const hasWaterPolygons = waterPolygons && waterPolygons.length > 0;

  // Build water polygon geometries
  const waterGeos = useMemo(() => {
    if (!waterPolygons || waterPolygons.length === 0) return [];
    return waterPolygons.map((wp) => {
      const shape = new THREE.Shape();
      shape.moveTo(wp.polygon[0].x, wp.polygon[0].z);
      for (let i = 1; i < wp.polygon.length; i++) {
        shape.lineTo(wp.polygon[i].x, wp.polygon[i].z);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      // Rotate from XY to XZ plane
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.02, 0);
      return geo;
    });
  }, [waterPolygons]);

  return (
    <group>
      {/* Water polygons (from OSM) */}
      {hasWaterPolygons && waterGeos.map((geo, i) => (
        <mesh key={`waterpoly-${i}`} geometry={geo} receiveShadow>
          <meshStandardMaterial
            color="#4a7c8f"
            roughness={0.15}
            metalness={0.1}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}

      {/* Fallback: Water tiles */}
      {!hasWaterPolygons && waterTiles.map((tile, i) => {
        const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
        const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;
        return (
          <mesh
            key={`water-${i}`}
            receiveShadow
            position={[x, 0.02, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[tileSize, tileSize]} />
            <meshStandardMaterial
              color="#4a7c8f"
              roughness={0.15}
              metalness={0.1}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}

      {/* Real road polylines (when available) */}
      {hasPolylineRoads && <PolylineRoads roads={roads} />}

      {/* Fallback: tile-based roads */}
      {!hasPolylineRoads && roadTiles.map((tile, i) => {
        const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
        const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;
        const isIntersection = tile.type === "road_intersection" || tile.type.startsWith("road_t_");

        return (
          <group key={i} position={[x, 0, z]}>
            {/* Asphalt surface — dark gray */}
            <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[tileSize, tileSize]} />
              <meshStandardMaterial color="#3a3a3e" roughness={0.85} metalness={0.02} />
            </mesh>

            {/* Center lane markings — white dashed for straights */}
            {tile.type === "road_straight_ns" && (
              <>
                <mesh position={[0, 0.015, -tileSize * 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.08, tileSize * 0.25]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
                </mesh>
                <mesh position={[0, 0.015, tileSize * 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.08, tileSize * 0.25]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
                </mesh>
              </>
            )}
            {tile.type === "road_straight_ew" && (
              <>
                <mesh position={[-tileSize * 0.2, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[tileSize * 0.25, 0.08]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
                </mesh>
                <mesh position={[tileSize * 0.2, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[tileSize * 0.25, 0.08]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
                </mesh>
              </>
            )}

            {/* Crosswalk stripes at intersections */}
            {isIntersection && <Crosswalk tileSize={tileSize} />}

            {/* Sidewalk / curb edges */}
            <RoadEdges type={tile.type} tileSize={tileSize} />
          </group>
        );
      })}
    </group>
  );
}

function Crosswalk({ tileSize }: { tileSize: number }) {
  const stripes = 4;
  const stripeWidth = 0.12;
  const gap = 0.18;
  const hs = tileSize / 2;

  return (
    <>
      {/* North edge crosswalk */}
      {Array.from({ length: stripes }).map((_, i) => (
        <mesh key={`n${i}`} position={[(i - (stripes - 1) / 2) * gap, 0.016, -hs + 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[stripeWidth, 0.5]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
        </mesh>
      ))}
      {/* East edge crosswalk */}
      {Array.from({ length: stripes }).map((_, i) => (
        <mesh key={`e${i}`} position={[hs - 0.35, 0.016, (i - (stripes - 1) / 2) * gap]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, stripeWidth]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
        </mesh>
      ))}
    </>
  );
}

function RoadEdges({ type, tileSize }: { type: string; tileSize: number }) {
  const edgeH = 0.1;
  const edgeW = 0.15;
  const hs = tileSize / 2;

  const edges: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
  const add = (x: number, z: number, sx: number, sz: number) => {
    edges.push({ pos: [x, edgeH / 2, z], scale: [sx, edgeH, sz] });
  };

  // Place curb on non-connecting edges
  const isNS = type === "road_straight_ns";
  const isEW = type === "road_straight_ew";
  const isInt = type === "road_intersection" || type.startsWith("road_t_");

  if (isNS) {
    add(-hs + edgeW / 2, 0, edgeW, tileSize);
    add(hs - edgeW / 2, 0, edgeW, tileSize);
  } else if (isEW) {
    add(0, -hs + edgeW / 2, tileSize, edgeW);
    add(0, hs - edgeW / 2, tileSize, edgeW);
  }
  // Intersections and T-junctions don't get curbs (open sides)

  return (
    <>
      {edges.map((e, i) => (
        <mesh key={i} position={e.pos}>
          <boxGeometry args={e.scale} />
          <meshStandardMaterial color="#6b6b6b" roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}
