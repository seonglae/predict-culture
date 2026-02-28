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

interface RoadsProps {
  tiles: Tile[];
  gridSize: number;
  tileSize: number;
  roads?: RoadSegment[];
}

function isRoad(type: string): boolean {
  return type.startsWith("road_");
}

function isWater(type: string): boolean {
  return type === "water" || type === "river";
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

  let dist = 0;
  let drawing = true;
  let segStart = 0;
  let vertCount = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    const ux = dx / segLen;
    const uz = dz / segLen;
    // Perpendicular
    const nx = -uz;
    const nz = ux;
    const hw = lineWidth / 2;

    let t = 0;
    while (t < segLen) {
      const toggleDist = drawing ? dashLen : gapLen;
      const remaining = toggleDist - (dist % (dashLen + gapLen) < toggleDist ? dist % (dashLen + gapLen) : 0);
      const step = Math.min(segLen - t, remaining > 0 ? remaining : toggleDist);

      if (drawing) {
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
      }

      t += step;
      dist += step;
      if (dist >= (drawing ? dashLen : gapLen)) {
        dist = 0;
        drawing = !drawing;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function PolylineRoads({ roads }: { roads: RoadSegment[] }) {
  const { roadGeometries, lineGeometries } = useMemo(() => {
    const rGeos: { geo: THREE.BufferGeometry; type: RoadSegment["type"] }[] = [];
    const lGeos: THREE.BufferGeometry[] = [];

    for (const road of roads) {
      if (road.points.length < 2) continue;
      rGeos.push({
        geo: buildRoadRibbonGeometry(road.points, road.width),
        type: road.type,
      });
      // Center dashes for all roads
      lGeos.push(
        buildCenterLineGeometry(road.points, 0.4, 0.3, 0.06)
      );
    }

    return { roadGeometries: rGeos, lineGeometries: lGeos };
  }, [roads]);

  return (
    <group>
      {roadGeometries.map((r, i) => (
        <mesh key={`road-${i}`} geometry={r.geo} receiveShadow>
          <meshStandardMaterial color="#3a3a3e" roughness={0.85} metalness={0.02} />
        </mesh>
      ))}
      {lineGeometries.map((geo, i) => (
        <mesh key={`line-${i}`} geometry={geo}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

export function Roads({ tiles, gridSize, tileSize, roads }: RoadsProps) {
  const roadTiles = useMemo(() => tiles.filter((t) => isRoad(t.type)), [tiles]);
  const waterTiles = useMemo(() => tiles.filter((t) => isWater(t.type)), [tiles]);

  const hasPolylineRoads = roads && roads.length > 0;

  return (
    <group>
      {/* Water tiles */}
      {waterTiles.map((tile, i) => {
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
