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

export function Roads({ tiles, gridSize, tileSize }: RoadsProps) {
  const roadTiles = useMemo(() => tiles.filter((t) => isRoad(t.type)), [tiles]);

  return (
    <group>
      {roadTiles.map((tile, i) => {
        const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
        const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;

        return (
          <group key={i} position={[x, 0, z]}>
            {/* Road surface — rounded edges for cute look */}
            <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[tileSize - 0.1, tileSize - 0.1]} />
              <meshStandardMaterial
                color="#e0e0e0"
                roughness={0.8}
              />
            </mesh>

            {/* Lane markings */}
            {(tile.type === "road_straight_ns" ||
              tile.type === "road_intersection" ||
              tile.type.startsWith("road_t_")) && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.1, tileSize * 0.6]} />
                <meshStandardMaterial color="#ffffff" opacity={0.5} transparent />
              </mesh>
            )}
            {(tile.type === "road_straight_ew" ||
              tile.type === "road_intersection" ||
              tile.type.startsWith("road_t_")) && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[tileSize * 0.6, 0.1]} />
                <meshStandardMaterial color="#ffffff" opacity={0.5} transparent />
              </mesh>
            )}

            {/* Sidewalk curbs — cute rounded bumps */}
            <RoadCurbs type={tile.type} tileSize={tileSize} />
          </group>
        );
      })}
    </group>
  );
}

function RoadCurbs({ type, tileSize }: { type: string; tileSize: number }) {
  const curbHeight = 0.15;
  const curbWidth = 0.3;
  const hs = tileSize / 2;

  // Place curbs on non-road edges
  const curbs: { pos: [number, number, number]; scale: [number, number, number] }[] = [];

  const addCurb = (x: number, z: number, sx: number, sz: number) => {
    curbs.push({ pos: [x, curbHeight / 2, z], scale: [sx, curbHeight, sz] });
  };

  if (!type.includes("north") && type !== "road_straight_ns" && type !== "road_intersection" &&
      type !== "road_curve_ne" && type !== "road_curve_nw" && type !== "road_t_east" && type !== "road_t_west") {
    addCurb(0, -hs + curbWidth / 2, tileSize, curbWidth);
  }
  if (!type.includes("south") && type !== "road_straight_ns" && type !== "road_intersection" &&
      type !== "road_curve_se" && type !== "road_curve_sw" && type !== "road_t_east" && type !== "road_t_west") {
    addCurb(0, hs - curbWidth / 2, tileSize, curbWidth);
  }

  return (
    <>
      {curbs.map((c, i) => (
        <mesh key={i} position={c.pos} castShadow>
          <boxGeometry args={c.scale} />
          <meshStandardMaterial color="#d4d4d8" roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}
