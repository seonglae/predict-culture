"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";

interface VehicleFrame {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: string;
  flying?: boolean;
  altitude?: number;
}

interface VehicleSpawn {
  id: string;
  type: string;
  color: string;
  x: number;
  z: number;
  heading: number;
  flying?: boolean;
  altitude?: number;
}

interface VehiclesProps {
  initialVehicles: VehicleSpawn[];
  currentFrame?: VehicleFrame[];
}

const VEHICLE_DIMS: Record<string, { w: number; h: number; l: number }> = {
  car: { w: 0.8, h: 0.5, l: 1.6 },
  truck: { w: 1.0, h: 0.7, l: 2.4 },
  bus: { w: 1.2, h: 0.8, l: 3.2 },
  motorcycle: { w: 0.4, h: 0.45, l: 1.2 },
  drone: { w: 0.6, h: 0.15, l: 0.6 },
  helicopter: { w: 1.0, h: 0.6, l: 2.0 },
};

export function Vehicles({ initialVehicles, currentFrame }: VehiclesProps) {
  return (
    <group>
      {initialVehicles.map((v) => {
        const frame = currentFrame?.find((f) => f.id === v.id);
        const x = frame?.x ?? v.x;
        const z = frame?.z ?? v.z;
        const heading = frame?.heading ?? v.heading;
        const isCrashed = frame?.state === "crashed";
        const dims = VEHICLE_DIMS[v.type] ?? VEHICLE_DIMS.car;
        const isFlying = v.flying || frame?.flying;
        const altitude = frame?.altitude ?? v.altitude ?? 0;

        if (v.type === "motorcycle") {
          return (
            <Motorcycle key={v.id} x={x} z={z} heading={heading} color={v.color} isCrashed={isCrashed} />
          );
        }
        if (v.type === "drone") {
          return (
            <Drone key={v.id} x={x} z={z} heading={heading} altitude={altitude} />
          );
        }
        if (v.type === "helicopter") {
          return (
            <Helicopter key={v.id} x={x} z={z} heading={heading} altitude={altitude} color={v.color} />
          );
        }

        return (
          <Vehicle key={v.id} x={x} z={z} heading={heading} color={v.color} dims={dims} isCrashed={isCrashed} type={v.type} />
        );
      })}
    </group>
  );
}

// ── Standard Vehicle (car, truck, bus) ──
function Vehicle({
  x, z, heading, color, dims, isCrashed, type,
}: {
  x: number; z: number; heading: number; color: string;
  dims: { w: number; h: number; l: number }; isCrashed: boolean; type: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(x, 0, z));
  const targetRot = useRef(heading);

  targetPos.current.set(x, 0, z);
  targetRot.current = heading;

  useFrame(() => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.position.x += (targetPos.current.x - g.position.x) * 0.15;
    g.position.z += (targetPos.current.z - g.position.z) * 0.15;
    let angleDiff = targetRot.current - g.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    g.rotation.y += angleDiff * 0.15;
  });

  const isBus = type === "bus";

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, heading, 0]}>
      {/* Body */}
      <RoundedBox
        args={[dims.w, dims.h, dims.l]}
        radius={0.12}
        smoothness={4}
        position={[0, dims.h / 2 + 0.12, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={isCrashed ? "#e63946" : color}
          roughness={0.35}
          metalness={0.25}
          emissive={isCrashed ? "#ff0000" : "#000000"}
          emissiveIntensity={isCrashed ? 0.5 : 0}
        />
      </RoundedBox>

      {/* Cabin / windshield */}
      <RoundedBox
        args={[dims.w - 0.12, dims.h * (isBus ? 0.55 : 0.6), dims.l * (isBus ? 0.7 : 0.5)]}
        radius={0.08}
        smoothness={4}
        position={[0, dims.h + 0.18, isBus ? 0 : -dims.l * 0.05]}
        castShadow
      >
        <meshStandardMaterial
          color="#dbeafe"
          roughness={0.25}
          metalness={0.15}
          transparent
          opacity={0.8}
        />
      </RoundedBox>

      {/* Wheels */}
      {[
        [dims.w / 2 - 0.05, 0.1, dims.l / 3],
        [-dims.w / 2 + 0.05, 0.1, dims.l / 3],
        [dims.w / 2 - 0.05, 0.1, -dims.l / 3],
        [-dims.w / 2 + 0.05, 0.1, -dims.l / 3],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#2d3436" roughness={0.9} />
        </mesh>
      ))}

      {/* Bus: stripe accent */}
      {isBus && (
        <RoundedBox
          args={[dims.w + 0.02, 0.08, dims.l - 0.2]}
          radius={0.04}
          smoothness={2}
          position={[0, dims.h * 0.4 + 0.12, 0]}
        >
          <meshStandardMaterial color="#ffeaa7" roughness={0.5} />
        </RoundedBox>
      )}

      {isCrashed && <CrashEffect />}
    </group>
  );
}

// ── Motorcycle ──
function Motorcycle({
  x, z, heading, color, isCrashed,
}: {
  x: number; z: number; heading: number; color: string; isCrashed: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(x, 0, z));
  const targetRot = useRef(heading);

  targetPos.current.set(x, 0, z);
  targetRot.current = heading;

  useFrame(() => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.position.x += (targetPos.current.x - g.position.x) * 0.18;
    g.position.z += (targetPos.current.z - g.position.z) * 0.18;
    let angleDiff = targetRot.current - g.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    g.rotation.y += angleDiff * 0.18;
  });

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, heading, 0]}>
      {/* Body */}
      <RoundedBox
        args={[0.35, 0.3, 1.0]}
        radius={0.1}
        smoothness={4}
        position={[0, 0.35, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={isCrashed ? "#e63946" : color}
          roughness={0.3}
          metalness={0.3}
          emissive={isCrashed ? "#ff0000" : "#000000"}
          emissiveIntensity={isCrashed ? 0.5 : 0}
        />
      </RoundedBox>

      {/* Handlebars */}
      <RoundedBox
        args={[0.5, 0.08, 0.08]}
        radius={0.03}
        smoothness={2}
        position={[0, 0.55, 0.35]}
      >
        <meshStandardMaterial color="#636e72" roughness={0.4} metalness={0.5} />
      </RoundedBox>

      {/* Front wheel */}
      <mesh position={[0, 0.13, 0.4]}>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshStandardMaterial color="#2d3436" roughness={0.9} />
      </mesh>

      {/* Rear wheel */}
      <mesh position={[0, 0.13, -0.35]}>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshStandardMaterial color="#2d3436" roughness={0.9} />
      </mesh>

      {isCrashed && <CrashEffect />}
    </group>
  );
}

// ── Drone ──
function Drone({
  x, z, heading, altitude,
}: {
  x: number; z: number; heading: number; altitude: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rotorRef = useRef(0);
  const targetPos = useRef(new THREE.Vector3(x, altitude, z));

  targetPos.current.set(x, altitude, z);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.position.x += (targetPos.current.x - g.position.x) * 0.08;
    g.position.y += (targetPos.current.y - g.position.y) * 0.08;
    g.position.z += (targetPos.current.z - g.position.z) * 0.08;
    // Hover bob
    g.position.y += Math.sin(Date.now() * 0.003) * 0.01;
    // Rotor spin
    rotorRef.current += delta * 25;
    g.rotation.y = heading;
  });

  return (
    <group ref={groupRef} position={[x, altitude, z]}>
      {/* Central body */}
      <RoundedBox args={[0.3, 0.12, 0.3]} radius={0.06} smoothness={4}>
        <meshStandardMaterial color="#00bbf9" roughness={0.3} metalness={0.4} />
      </RoundedBox>

      {/* 4 arms + rotors */}
      {[
        [0.25, 0.05, 0.25],
        [-0.25, 0.05, 0.25],
        [0.25, 0.05, -0.25],
        [-0.25, 0.05, -0.25],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh>
            <cylinderGeometry args={[0.01, 0.01, 0.15, 4]} />
            <meshStandardMaterial color="#636e72" />
          </mesh>
          <mesh position={[0, 0.08, 0]} rotation={[0, rotorRef.current + i * Math.PI / 2, 0]}>
            <boxGeometry args={[0.25, 0.01, 0.04]} />
            <meshStandardMaterial color="#dfe6e9" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}

      {/* LED indicator */}
      <mesh position={[0, -0.08, 0.15]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#e63946" emissive="#e63946" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

// ── Helicopter ──
function Helicopter({
  x, z, heading, altitude, color,
}: {
  x: number; z: number; heading: number; altitude: number; color: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rotorAngle = useRef(0);
  const targetPos = useRef(new THREE.Vector3(x, altitude, z));

  targetPos.current.set(x, altitude, z);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.position.x += (targetPos.current.x - g.position.x) * 0.06;
    g.position.y += (targetPos.current.y - g.position.y) * 0.06;
    g.position.z += (targetPos.current.z - g.position.z) * 0.06;
    g.position.y += Math.sin(Date.now() * 0.002) * 0.015;
    rotorAngle.current += delta * 18;
    g.rotation.y = heading;
  });

  return (
    <group ref={groupRef} position={[x, altitude, z]}>
      {/* Fuselage */}
      <RoundedBox args={[0.6, 0.45, 1.6]} radius={0.15} smoothness={4} castShadow>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.3} />
      </RoundedBox>

      {/* Windshield */}
      <RoundedBox
        args={[0.55, 0.3, 0.5]}
        radius={0.1}
        smoothness={4}
        position={[0, 0.1, 0.55]}
      >
        <meshStandardMaterial color="#dbeafe" roughness={0.2} metalness={0.1} transparent opacity={0.7} />
      </RoundedBox>

      {/* Tail boom */}
      <RoundedBox args={[0.15, 0.15, 0.8]} radius={0.06} smoothness={2} position={[0, 0.1, -1.15]}>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
      </RoundedBox>

      {/* Tail fin */}
      <RoundedBox args={[0.04, 0.35, 0.2]} radius={0.02} smoothness={2} position={[0, 0.25, -1.45]}>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
      </RoundedBox>

      {/* Main rotor */}
      <group position={[0, 0.35, 0]} rotation={[0, rotorAngle.current, 0]}>
        <mesh>
          <boxGeometry args={[2.2, 0.02, 0.1]} />
          <meshStandardMaterial color="#b2bec3" transparent opacity={0.5} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[2.2, 0.02, 0.1]} />
          <meshStandardMaterial color="#b2bec3" transparent opacity={0.5} />
        </mesh>
      </group>

      {/* Rotor hub */}
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 8]} />
        <meshStandardMaterial color="#636e72" metalness={0.5} />
      </mesh>

      {/* Skids */}
      {[-0.25, 0.25].map((xOff, i) => (
        <mesh key={i} position={[xOff, -0.3, 0]}>
          <boxGeometry args={[0.04, 0.04, 1.2]} />
          <meshStandardMaterial color="#636e72" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ── Crash Effect ──
function CrashEffect() {
  const groupRef = useRef<THREE.Group>(null);
  const particles = useMemo(() => {
    return Array.from({ length: 10 }, () => ({
      x: (Math.random() - 0.5) * 2.5,
      y: Math.random() * 2.5 + 0.5,
      z: (Math.random() - 0.5) * 2.5,
      scale: 0.08 + Math.random() * 0.15,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 2;
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <octahedronGeometry args={[p.scale]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? "#e63946" : i % 3 === 1 ? "#f4a261" : "#ffd93d"}
            emissive={i % 3 === 0 ? "#ff0000" : "#ff6600"}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}
