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

// Modern vehicle — cleaner geometry, smooth rounded shapes
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
  const isTruck = type === "truck";
  const crashColor = "#ff6b6b";

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, heading, 0]}>
      {/* Body — main shape */}
      <RoundedBox
        args={[dims.w, dims.h, dims.l]}
        radius={0.15}
        smoothness={4}
        position={[0, dims.h / 2 + 0.1, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={isCrashed ? crashColor : color}
          roughness={0.25}
          metalness={0.15}
          emissive={isCrashed ? "#ff0000" : "#000000"}
          emissiveIntensity={isCrashed ? 0.4 : 0}
        />
      </RoundedBox>

      {/* Cabin — glass top section */}
      {!isTruck && (
        <RoundedBox
          args={[dims.w - 0.1, dims.h * (isBus ? 0.5 : 0.55), dims.l * (isBus ? 0.65 : 0.45)]}
          radius={0.1}
          smoothness={4}
          position={[0, dims.h + 0.15, isBus ? 0 : -dims.l * 0.04]}
          castShadow
        >
          <meshStandardMaterial
            color="#e3edf7"
            roughness={0.15}
            metalness={0.05}
            transparent
            opacity={0.85}
          />
        </RoundedBox>
      )}

      {/* Truck cargo */}
      {isTruck && (
        <RoundedBox
          args={[dims.w - 0.05, dims.h * 0.7, dims.l * 0.55]}
          radius={0.08}
          smoothness={4}
          position={[0, dims.h + 0.05, -dims.l * 0.15]}
          castShadow
        >
          <meshStandardMaterial
            color={isCrashed ? crashColor : color}
            roughness={0.3}
            metalness={0.1}
          />
        </RoundedBox>
      )}

      {/* Wheels — dark circles */}
      {[
        [dims.w / 2, 0.09, dims.l * 0.3],
        [-dims.w / 2, 0.09, dims.l * 0.3],
        [dims.w / 2, 0.09, -dims.l * 0.3],
        [-dims.w / 2, 0.09, -dims.l * 0.3],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 8]} />
          <meshStandardMaterial color="#2a2a2e" roughness={0.8} />
        </mesh>
      ))}

      {/* Bus accent stripe */}
      {isBus && (
        <RoundedBox
          args={[dims.w + 0.01, 0.06, dims.l - 0.15]}
          radius={0.03}
          smoothness={2}
          position={[0, dims.h * 0.35 + 0.1, 0]}
        >
          <meshStandardMaterial color="white" roughness={0.3} transparent opacity={0.6} />
        </RoundedBox>
      )}

      {/* Headlights */}
      {["left", "right"].map((side, i) => (
        <mesh
          key={side}
          position={[(i === 0 ? -1 : 1) * dims.w * 0.35, dims.h * 0.35 + 0.1, dims.l / 2 + 0.01]}
        >
          <circleGeometry args={[0.06, 8]} />
          <meshStandardMaterial
            color="#fffbe6"
            emissive="#fffbe6"
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}

      {isCrashed && <CrashEffect />}
    </group>
  );
}

// Motorcycle — sleek minimal
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
      <RoundedBox args={[0.3, 0.25, 0.9]} radius={0.1} smoothness={4} position={[0, 0.32, 0]} castShadow>
        <meshStandardMaterial
          color={isCrashed ? "#ff6b6b" : color}
          roughness={0.2}
          metalness={0.25}
          emissive={isCrashed ? "#ff0000" : "#000000"}
          emissiveIntensity={isCrashed ? 0.4 : 0}
        />
      </RoundedBox>

      {/* Handlebar */}
      <RoundedBox args={[0.45, 0.06, 0.06]} radius={0.02} smoothness={2} position={[0, 0.52, 0.3]}>
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.4} />
      </RoundedBox>

      {/* Wheels */}
      <mesh position={[0, 0.12, 0.36]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.12, -0.32]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.8} />
      </mesh>

      {isCrashed && <CrashEffect />}
    </group>
  );
}

// Drone — minimal quad
function Drone({
  x, z, heading, altitude,
}: {
  x: number; z: number; heading: number; altitude: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(x, altitude, z));

  targetPos.current.set(x, altitude, z);

  useFrame(() => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.position.x += (targetPos.current.x - g.position.x) * 0.08;
    g.position.y += (targetPos.current.y - g.position.y) * 0.08;
    g.position.z += (targetPos.current.z - g.position.z) * 0.08;
    g.position.y += Math.sin(Date.now() * 0.003) * 0.01;
    g.rotation.y = heading;
  });

  return (
    <group ref={groupRef} position={[x, altitude, z]}>
      <RoundedBox args={[0.28, 0.1, 0.28]} radius={0.05} smoothness={4}>
        <meshStandardMaterial color="#a8dadc" roughness={0.2} metalness={0.3} />
      </RoundedBox>

      {[
        [0.22, 0.04, 0.22],
        [-0.22, 0.04, 0.22],
        [0.22, 0.04, -0.22],
        [-0.22, 0.04, -0.22],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh>
            <cylinderGeometry args={[0.01, 0.01, 0.12, 4]} />
            <meshStandardMaterial color="#555" />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <boxGeometry args={[0.2, 0.008, 0.03]} />
            <meshStandardMaterial color="#ddd" transparent opacity={0.5} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, -0.06, 0.13]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color="#ff6b6b" emissive="#ff6b6b" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

// Helicopter — clean modern
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
      <RoundedBox args={[0.55, 0.4, 1.5]} radius={0.15} smoothness={4} castShadow>
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.2} />
      </RoundedBox>

      <RoundedBox args={[0.5, 0.28, 0.45]} radius={0.1} smoothness={4} position={[0, 0.08, 0.52]}>
        <meshStandardMaterial color="#e3edf7" roughness={0.15} metalness={0.05} transparent opacity={0.75} />
      </RoundedBox>

      <RoundedBox args={[0.12, 0.12, 0.75]} radius={0.05} smoothness={2} position={[0, 0.08, -1.1]}>
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </RoundedBox>

      <RoundedBox args={[0.03, 0.3, 0.18]} radius={0.015} smoothness={2} position={[0, 0.22, -1.4]}>
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </RoundedBox>

      {/* Main rotor */}
      <group position={[0, 0.32, 0]} rotation={[0, rotorAngle.current, 0]}>
        <mesh>
          <boxGeometry args={[2.0, 0.015, 0.08]} />
          <meshStandardMaterial color="#bbb" transparent opacity={0.4} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[2.0, 0.015, 0.08]} />
          <meshStandardMaterial color="#bbb" transparent opacity={0.4} />
        </mesh>
      </group>

      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.06, 8]} />
        <meshStandardMaterial color="#555" metalness={0.5} />
      </mesh>

      {[-0.22, 0.22].map((xOff, i) => (
        <mesh key={i} position={[xOff, -0.27, 0]}>
          <boxGeometry args={[0.03, 0.03, 1.0]} />
          <meshStandardMaterial color="#555" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// Crash effect — minimal, clean particles
function CrashEffect() {
  const groupRef = useRef<THREE.Group>(null);
  const particles = useMemo(() => {
    return Array.from({ length: 8 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: Math.random() * 2 + 0.3,
      z: (Math.random() - 0.5) * 2,
      scale: 0.06 + Math.random() * 0.1,
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
            color={i % 2 === 0 ? "#ff6b6b" : "#ffd93d"}
            emissive={i % 2 === 0 ? "#ff4444" : "#ff8800"}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}
