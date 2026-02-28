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
        const color = tile.color ?? "#a2d2ff";
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
  const dropHeight = 25 + height;
  const dropDuration = 0.6;
  const padding = 0.5;
  const buildingSize = tileSize - padding * 2;

  useFrame(() => {
    if (!groupRef.current || !timeRef.current) return;
    const elapsed = timeRef.current;
    const progress = Math.max(0, Math.min(1, (elapsed - delay) / dropDuration));
    const easedY = progress >= 1 ? 0 : dropHeight * (1 - easeOutBack(progress));
    groupRef.current.position.y = easedY;
    const scaleProgress = Math.max(0, Math.min(1, (elapsed - delay - dropDuration * 0.8) / 0.15));
    const s = scaleProgress < 1 ? 0.95 + scaleProgress * 0.05 : 1;
    groupRef.current.scale.setScalar(s);
  });

  const isTall = buildingType === "building_tall";
  const isMedium = buildingType === "building_medium";

  return (
    <group ref={groupRef} position={[x, dropHeight, z]}>
      {/* Main body — soft rounded box */}
      <RoundedBox
        args={[buildingSize, height, buildingSize]}
        radius={isTall ? 0.2 : 0.35}
        smoothness={4}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.05}
        />
      </RoundedBox>

      {/* Roof — flat accent top */}
      <RoundedBox
        args={[buildingSize - 0.2, 0.12, buildingSize - 0.2]}
        radius={0.1}
        smoothness={4}
        position={[0, height + 0.06, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.35}
          metalness={0.08}
        />
      </RoundedBox>

      {/* Tall buildings get a darker accent band */}
      {isTall && (
        <RoundedBox
          args={[buildingSize + 0.02, 0.15, buildingSize + 0.02]}
          radius={0.08}
          smoothness={2}
          position={[0, height * 0.6, 0]}
        >
          <meshStandardMaterial color="white" roughness={0.3} transparent opacity={0.25} />
        </RoundedBox>
      )}

      {/* Windows — minimal light dots */}
      {height > 2 && (
        <WindowStrips buildingSize={buildingSize} height={height} isTall={isTall} />
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
      {/* Ground patch */}
      <RoundedBox
        args={[tileSize - 0.4, 0.12, tileSize - 0.4]}
        radius={0.08}
        smoothness={4}
        position={[0, 0.06, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#b5ead7" roughness={0.7} />
      </RoundedBox>

      {/* Tree — minimal */}
      <group position={[0, 0.12, 0]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 0.5, 6]} />
          <meshStandardMaterial color="#a8896c" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.7, 0]} castShadow>
          <sphereGeometry args={[0.45, 8, 8]} />
          <meshStandardMaterial color="#7ec99a" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

// Clean window strips instead of individual dots (less draw calls)
function WindowStrips({ buildingSize, height, isTall }: { buildingSize: number; height: number; isTall: boolean }) {
  const floors = Math.floor(height / 1.2);
  const strips: { y: number }[] = [];

  for (let f = 0; f < floors; f++) {
    strips.push({ y: 0.8 + f * 1.2 });
  }

  return (
    <>
      {strips.map((s, i) => (
        <group key={i}>
          {/* Front/back window strips */}
          <mesh position={[0, s.y, buildingSize / 2 + 0.01]}>
            <planeGeometry args={[buildingSize * 0.7, 0.25]} />
            <meshStandardMaterial
              color="#fffde7"
              emissive="#fffde7"
              emissiveIntensity={0.15}
              transparent
              opacity={0.6}
            />
          </mesh>
          <mesh position={[0, s.y, -(buildingSize / 2 + 0.01)]}>
            <planeGeometry args={[buildingSize * 0.7, 0.25]} />
            <meshStandardMaterial
              color="#fffde7"
              emissive="#fffde7"
              emissiveIntensity={0.15}
              transparent
              opacity={0.6}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
