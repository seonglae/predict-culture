"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";

interface Tile {
  row: number;
  col: number;
  type: string;
  height?: number;
  color?: string;
}

interface BuildingsProps {
  tiles: Tile[];
  gridSize: number;
  tileSize: number;
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function Buildings({ tiles, gridSize, tileSize }: BuildingsProps) {
  const buildingTiles = useMemo(
    () => tiles.filter((t) => t.type.startsWith("building_")),
    [tiles]
  );
  const parkTiles = useMemo(
    () => tiles.filter((t) => t.type === "park"),
    [tiles]
  );

  const timeRef = useRef(0);
  const startedRef = useRef(false);

  useFrame((_, delta) => {
    if (!startedRef.current) startedRef.current = true;
    timeRef.current += delta;
  });

  const maxDist = (gridSize * tileSize) / 2;

  return (
    <group>
      {buildingTiles.map((tile, i) => {
        const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
        const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;
        const height = tile.height ?? 2;
        const color = tile.color ?? "#d5cfc7";
        const dist = Math.sqrt(x * x + z * z);
        const delay = (dist / maxDist) * 0.8 + Math.random() * 0.1;

        return (
          <BuildingBlock
            key={i}
            x={x}
            z={z}
            height={height}
            color={color}
            tileSize={tileSize}
            delay={delay}
            timeRef={timeRef}
            buildingType={tile.type}
          />
        );
      })}

      {parkTiles.map((tile, i) => {
        const x = (tile.col - gridSize / 2) * tileSize + tileSize / 2;
        const z = (tile.row - gridSize / 2) * tileSize + tileSize / 2;
        const dist = Math.sqrt(x * x + z * z);
        const delay = (dist / maxDist) * 0.8 + 0.1;

        return (
          <ParkTile
            key={`park-${i}`}
            x={x}
            z={z}
            tileSize={tileSize}
            delay={delay}
            timeRef={timeRef}
          />
        );
      })}
    </group>
  );
}

function BuildingBlock({
  x, z, height, color, tileSize, delay, timeRef, buildingType,
}: {
  x: number; z: number; height: number; color: string;
  tileSize: number; delay: number;
  timeRef: React.RefObject<number>;
  buildingType: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const riseDepth = -(height + 2);
  const riseDuration = 0.6;
  const padding = 0.4;
  const buildingSize = tileSize - padding * 2;

  useFrame(() => {
    if (!groupRef.current || !timeRef.current) return;
    const elapsed = timeRef.current;
    const progress = Math.max(0, Math.min(1, (elapsed - delay) / riseDuration));
    const easedY = progress >= 1 ? 0 : riseDepth * (1 - easeOutBack(progress));
    groupRef.current.position.y = easedY;
    const scaleProgress = Math.max(0, Math.min(1, (elapsed - delay - riseDuration * 0.8) / 0.15));
    const s = scaleProgress < 1 ? 0.95 + scaleProgress * 0.05 : 1;
    groupRef.current.scale.setScalar(s);
  });

  const isTall = buildingType === "building_tall";
  const isMedium = buildingType === "building_medium";

  return (
    <group ref={groupRef} position={[x, riseDepth, z]}>
      {/* Main body — concrete */}
      <RoundedBox
        args={[buildingSize, height, buildingSize]}
        radius={isTall ? 0.1 : 0.15}
        smoothness={4}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.75}
          metalness={0.02}
        />
      </RoundedBox>

      {/* Roof ledge */}
      <mesh position={[0, height + 0.04, 0]} castShadow>
        <boxGeometry args={[buildingSize + 0.06, 0.08, buildingSize + 0.06]} />
        <meshStandardMaterial color="#9a9590" roughness={0.8} />
      </mesh>

      {/* Tall buildings: glass accent band */}
      {isTall && (
        <mesh position={[0, height * 0.7, 0]}>
          <boxGeometry args={[buildingSize + 0.01, 0.3, buildingSize + 0.01]} />
          <meshStandardMaterial
            color="#8fbcd4"
            roughness={0.15}
            metalness={0.2}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* Window grid — subtle lit rows */}
      {height > 2 && (
        <WindowGrid buildingSize={buildingSize} height={height} isTall={isTall} />
      )}

      {/* Ground floor — darker base */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[buildingSize + 0.02, 0.8, buildingSize + 0.02]} />
        <meshStandardMaterial color="#7a7570" roughness={0.85} />
      </mesh>
    </group>
  );
}

function ParkTile({
  x, z, tileSize, delay, timeRef,
}: {
  x: number; z: number; tileSize: number; delay: number;
  timeRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const riseDepth = -4;
  const riseDuration = 0.5;

  useFrame(() => {
    if (!groupRef.current || !timeRef.current) return;
    const elapsed = timeRef.current;
    const progress = Math.max(0, Math.min(1, (elapsed - delay) / riseDuration));
    groupRef.current.position.y = progress >= 1 ? 0 : riseDepth * (1 - easeOutBack(progress));
  });

  return (
    <group ref={groupRef} position={[x, riseDepth, z]}>
      {/* Ground — muted green */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[tileSize - 0.3, tileSize - 0.3]} />
        <meshStandardMaterial color="#6b8f71" roughness={0.85} />
      </mesh>

      {/* Tree — Japanese style */}
      <group position={[0, 0.03, 0]}>
        {/* Trunk */}
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.6, 6]} />
          <meshStandardMaterial color="#6b5b4a" roughness={0.9} />
        </mesh>
        {/* Canopy — layered */}
        <mesh position={[0, 0.75, 0]} castShadow>
          <sphereGeometry args={[0.4, 8, 6]} />
          <meshStandardMaterial color="#4a6b4a" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.95, 0]} castShadow>
          <sphereGeometry args={[0.28, 8, 6]} />
          <meshStandardMaterial color="#3d5c3d" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function WindowGrid({ buildingSize, height, isTall }: { buildingSize: number; height: number; isTall: boolean }) {
  const floors = Math.floor((height - 1) / 1.0);
  const windowsPerSide = isTall ? 4 : 3;
  const windowW = (buildingSize * 0.65) / windowsPerSide;
  const windowH = 0.35;

  return (
    <>
      {Array.from({ length: Math.min(floors, 8) }).map((_, f) => {
        const y = 1.2 + f * 1.0;
        if (y > height - 0.5) return null;
        return (
          <group key={f}>
            {/* Front face windows */}
            {Array.from({ length: windowsPerSide }).map((_, w) => {
              const xOff = (w - (windowsPerSide - 1) / 2) * (windowW + 0.08);
              return (
                <mesh key={`f${w}`} position={[xOff, y, buildingSize / 2 + 0.005]}>
                  <planeGeometry args={[windowW, windowH]} />
                  <meshStandardMaterial
                    color="#ffedc2"
                    emissive="#ffedc2"
                    emissiveIntensity={0.08}
                    transparent
                    opacity={0.5}
                  />
                </mesh>
              );
            })}
            {/* Back face windows */}
            {Array.from({ length: windowsPerSide }).map((_, w) => {
              const xOff = (w - (windowsPerSide - 1) / 2) * (windowW + 0.08);
              return (
                <mesh key={`b${w}`} position={[xOff, y, -(buildingSize / 2 + 0.005)]} rotation={[0, Math.PI, 0]}>
                  <planeGeometry args={[windowW, windowH]} />
                  <meshStandardMaterial
                    color="#ffedc2"
                    emissive="#ffedc2"
                    emissiveIntensity={0.08}
                    transparent
                    opacity={0.4}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
