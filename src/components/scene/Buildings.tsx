"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface BuildingFootprint {
  polygon: { x: number; z: number }[];
  height: number;
  color: string;
}

interface BuildingsProps {
  tiles: any[];
  gridSize: number;
  tileSize: number;
  osmBuildings?: BuildingFootprint[];
}

export function Buildings({ osmBuildings }: BuildingsProps) {
  if (!osmBuildings || osmBuildings.length === 0) return null;

  return (
    <group>
      {osmBuildings.map((b, i) => (
        <OSMBuilding
          key={i}
          polygon={b.polygon}
          height={b.height}
          color={b.color}
        />
      ))}
    </group>
  );
}

function OSMBuilding({
  polygon,
  height,
  color,
}: {
  polygon: { x: number; z: number }[];
  height: number;
  color: string;
}) {
  const geometry = useMemo(() => {
    if (polygon.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, -polygon[0].z);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, -polygon[i].z);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [polygon, height]);

  const roofGeometry = useMemo(() => {
    if (polygon.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, -polygon[0].z);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, -polygon[i].z);
    }
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [polygon]);

  const darkerColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.75);
    return `#${c.getHexString()}`;
  }, [color]);

  if (!geometry) return null;

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.75} metalness={0.02} />
      </mesh>
      {roofGeometry && (
        <mesh geometry={roofGeometry} position={[0, height + 0.02, 0]} castShadow>
          <meshStandardMaterial color={darkerColor} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}
