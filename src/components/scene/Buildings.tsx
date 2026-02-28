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

// Ease-out back — nice overshoot "plop" on landing
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

  // Staggered drop animation state
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
        const color = tile.color ?? "#92b4c8";

        // Stagger: center buildings drop first, edges last
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
  x, z, height, color, tileSize, delay, timeRef,
}: {
  x: number; z: number; height: number; color: string;
  tileSize: number; delay: number;
  timeRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dropHeight = 25 + height;
  const dropDuration = 0.6;
  const padding = 0.4;
  const buildingSize = tileSize - padding * 2;

  useFrame(() => {
    if (!groupRef.current || !timeRef.current) return;
    const elapsed = timeRef.current;
    const progress = Math.max(0, Math.min(1, (elapsed - delay) / dropDuration));
    const easedY = progress >= 1 ? 0 : dropHeight * (1 - easeOutBack(progress));
    groupRef.current.position.y = easedY;
    // Scale pop on landing
    const scaleProgress = Math.max(0, Math.min(1, (elapsed - delay - dropDuration * 0.8) / 0.15));
    const s = scaleProgress < 1 ? 0.95 + scaleProgress * 0.05 : 1;
    groupRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef} position={[x, dropHeight, z]}>
      {/* Main building body */}
      <RoundedBox
        args={[buildingSize, height, buildingSize]}
        radius={0.3}
        smoothness={4}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.08} />
      </RoundedBox>

      {/* Roof accent */}
      <RoundedBox
        args={[buildingSize - 0.3, 0.2, buildingSize - 0.3]}
        radius={0.15}
        smoothness={4}
        position={[0, height + 0.1, 0]}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.12} toneMapped={false} />
      </RoundedBox>

      {/* Windows */}
      {height > 2 && (
        <WindowDots buildingSize={buildingSize} height={height} />
      )}
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
  const dropHeight = 18;
  const dropDuration = 0.5;

  useFrame(() => {
    if (!groupRef.current || !timeRef.current) return;
    const elapsed = timeRef.current;
    const progress = Math.max(0, Math.min(1, (elapsed - delay) / dropDuration));
    groupRef.current.position.y = progress >= 1 ? 0 : dropHeight * (1 - easeOutBack(progress));
  });

  return (
    <group ref={groupRef} position={[x, dropHeight, z]}>
      <RoundedBox
        args={[tileSize - 0.4, 0.15, tileSize - 0.4]}
        radius={0.1}
        smoothness={4}
        position={[0, 0.075, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#a3c4a8" roughness={0.8} />
      </RoundedBox>

      <group position={[0, 0.15, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.6, 8]} />
          <meshStandardMaterial color="#9e8b76" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.8, 0]} castShadow>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial color="#6b9e6b" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function WindowDots({ buildingSize, height }: { buildingSize: number; height: number }) {
  const floors = Math.floor(height / 1.2);
  const windowsPerFloor = Math.min(3, Math.floor(buildingSize / 0.8));
  const windows: { x: number; y: number; z: number }[] = [];

  for (let f = 0; f < floors; f++) {
    const y = 0.8 + f * 1.2;
    for (let w = 0; w < windowsPerFloor; w++) {
      const offset = (w - (windowsPerFloor - 1) / 2) * 0.7;
      windows.push({ x: offset, y, z: buildingSize / 2 + 0.01 });
      windows.push({ x: offset, y, z: -(buildingSize / 2 + 0.01) });
    }
  }

  return (
    <>
      {windows.map((w, i) => (
        <mesh key={i} position={[w.x, w.y, w.z]}>
          <planeGeometry args={[0.3, 0.3]} />
          <meshStandardMaterial
            color="#ffeaa7"
            emissive="#ffeaa7"
            emissiveIntensity={0.25}
            transparent
            opacity={0.75}
          />
        </mesh>
      ))}
    </>
  );
}
