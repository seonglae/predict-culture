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

interface RoadsProps {
  tiles: Tile[];
  gridSize: number;
  tileSize: number;
}

function isRoad(type: string): boolean {
  return type.startsWith("road_");
}

function isWater(type: string): boolean {
  return type === "water" || type === "river";
}

export function Roads({ tiles, gridSize, tileSize }: RoadsProps) {
  const roadTiles = useMemo(() => tiles.filter((t) => isRoad(t.type)), [tiles]);
  const waterTiles = useMemo(() => tiles.filter((t) => isWater(t.type)), [tiles]);

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

      {/* Road tiles */}
      {roadTiles.map((tile, i) => {
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
