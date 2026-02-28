"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface PredictionPinProps {
  position: { x: number; z: number };
  color?: string;
  label?: string;
  isAccident?: boolean;
}

export function PredictionPin({
  position,
  color = "#159999",
  isAccident = false,
}: PredictionPinProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    // Floating animation
    groupRef.current.position.y =
      1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3;

    // Pulse ring
    if (ringRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
      ringRef.current.scale.set(scale, scale, 1);
    }
  });

  return (
    <group position={[position.x, 0, position.z]}>
      {/* Ground ring */}
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
      >
        <ringGeometry args={[0.6, 0.8, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pin */}
      <group ref={groupRef} position={[0, 1.5, 0]}>
        {/* Sphere */}
        <mesh castShadow>
          <sphereGeometry args={[isAccident ? 0.5 : 0.35, 16, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isAccident ? 1.0 : 0.5}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>

        {/* Glow sphere */}
        <mesh>
          <sphereGeometry args={[isAccident ? 0.7 : 0.5, 16, 16]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.15}
          />
        </mesh>

        {/* Stem line */}
        <mesh position={[0, -0.8, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.0, 8]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.3}
          />
        </mesh>
      </group>
    </group>
  );
}
