"use client";

import { useRef } from "react";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

interface GroundProps {
  size: number;
  onGroundClick?: (point: { x: number; z: number }) => void;
}

export function Ground({ size, onGroundClick }: GroundProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (onGroundClick && e.point) {
      onGroundClick({ x: e.point.x, z: e.point.z });
    }
  };

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.05, 0]}
      onClick={handleClick}
      receiveShadow
    >
      <planeGeometry args={[size * 2.5, size * 2.5]} />
      <meshStandardMaterial color="#c8e6c9" />
    </mesh>
  );
}
