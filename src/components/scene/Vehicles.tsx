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

interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

interface VehiclesProps {
  initialVehicles: VehicleSpawn[];
  currentFrame?: VehicleFrame[];
  roads?: RoadSegment[];
}

const VEHICLE_DIMS: Record<string, { w: number; h: number; l: number }> = {
  car: { w: 0.75, h: 0.45, l: 1.5 },
  truck: { w: 0.9, h: 0.6, l: 2.2 },
  bus: { w: 1.1, h: 0.7, l: 3.0 },
  motorcycle: { w: 0.35, h: 0.4, l: 1.0 },
  drone: { w: 0.5, h: 0.12, l: 0.5 },
  helicopter: { w: 0.9, h: 0.5, l: 1.8 },
};

/**
 * Project point onto nearest road polyline segment.
 * Returns snapped position and road tangent heading, or null if too far.
 */
function snapToRoad(
  px: number,
  pz: number,
  roads: RoadSegment[],
  maxDist: number = 3.0
): { x: number; z: number; heading: number } | null {
  let bestDist = maxDist * maxDist;
  let bestX = px;
  let bestZ = pz;
  let bestHeading = 0;

  for (const road of roads) {
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x;
      const az = pts[i].z;
      const bx = pts[i + 1].x;
      const bz = pts[i + 1].z;

      // Project point onto line segment
      const dx = bx - ax;
      const dz = bz - az;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.0001) continue;

      let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));

      const cx = ax + t * dx;
      const cz = az + t * dz;
      const distSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);

      if (distSq < bestDist) {
        bestDist = distSq;
        bestX = cx;
        bestZ = cz;
        // Heading from road tangent direction
        bestHeading = Math.atan2(dx, -dz);
      }
    }
  }

  if (bestDist >= maxDist * maxDist) return null;
  return { x: bestX, z: bestZ, heading: bestHeading };
}

export function Vehicles({ initialVehicles, currentFrame, roads }: VehiclesProps) {
  return (
    <group>
      {initialVehicles.map((v) => {
        const frame = currentFrame?.find((f) => f.id === v.id);
        let x = frame?.x ?? v.x;
        let z = frame?.z ?? v.z;
        let heading = frame?.heading ?? v.heading;
        const isCrashed = frame?.state === "crashed";
        const dims = VEHICLE_DIMS[v.type] ?? VEHICLE_DIMS.car;
        const altitude = frame?.altitude ?? v.altitude ?? 0;

        // Snap ground vehicles to nearest road polyline
        if (roads && roads.length > 0 && !v.flying && !isCrashed) {
          const snapped = snapToRoad(x, z, roads);
          if (snapped) {
            x = snapped.x;
            z = snapped.z;
            // Pick road tangent direction (forward or reverse) closest to simulation heading
            const simDx = Math.sin(heading);
            const simDz = -Math.cos(heading);
            const roadDx = Math.sin(snapped.heading);
            const roadDz = -Math.cos(snapped.heading);
            const dot = simDx * roadDx + simDz * roadDz;
            heading = dot >= 0 ? snapped.heading : snapped.heading + Math.PI;
          }
        }

        if (v.type === "motorcycle") {
          return <Motorcycle key={v.id} x={x} z={z} heading={heading} color={v.color} isCrashed={isCrashed} />;
        }
        if (v.type === "drone") {
          return <Drone key={v.id} x={x} z={z} heading={heading} altitude={altitude} />;
        }
        if (v.type === "helicopter") {
          return <Helicopter key={v.id} x={x} z={z} heading={heading} altitude={altitude} color={v.color} />;
        }

        return (
          <Vehicle key={v.id} x={x} z={z} heading={heading} color={v.color} dims={dims} isCrashed={isCrashed} type={v.type} />
        );
      })}
    </group>
  );
}

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

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, heading, 0]}>
      {/* Main body */}
      <RoundedBox
        args={[dims.w, dims.h, dims.l]}
        radius={0.08}
        smoothness={4}
        position={[0, dims.h / 2 + 0.1, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={isCrashed ? "#cc3333" : color}
          roughness={0.35}
          metalness={0.25}
          emissive={isCrashed ? "#ff0000" : "#000000"}
          emissiveIntensity={isCrashed ? 0.3 : 0}
        />
      </RoundedBox>

      {/* Windshield / cabin glass */}
      {!isTruck && (
        <RoundedBox
          args={[dims.w - 0.08, dims.h * (isBus ? 0.4 : 0.5), dims.l * (isBus ? 0.6 : 0.4)]}
          radius={0.06}
          smoothness={4}
          position={[0, dims.h + 0.12, isBus ? 0 : -dims.l * 0.03]}
        >
          <meshStandardMaterial
            color="#1a2233"
            roughness={0.1}
            metalness={0.3}
            transparent
            opacity={0.8}
          />
        </RoundedBox>
      )}

      {/* Truck cargo box */}
      {isTruck && (
        <RoundedBox
          args={[dims.w - 0.04, dims.h * 0.65, dims.l * 0.5]}
          radius={0.04}
          smoothness={4}
          position={[0, dims.h + 0.02, -dims.l * 0.14]}
          castShadow
        >
          <meshStandardMaterial
            color={isCrashed ? "#cc3333" : "#e8e4df"}
            roughness={0.6}
            metalness={0.05}
          />
        </RoundedBox>
      )}

      {/* Wheels */}
      {[
        [dims.w / 2 + 0.01, 0.08, dims.l * 0.3],
        [-dims.w / 2 - 0.01, 0.08, dims.l * 0.3],
        [dims.w / 2 + 0.01, 0.08, -dims.l * 0.3],
        [-dims.w / 2 - 0.01, 0.08, -dims.l * 0.3],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 8]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}

      {/* Headlights — warm white */}
      {["left", "right"].map((side, i) => (
        <mesh
          key={side}
          position={[(i === 0 ? -1 : 1) * dims.w * 0.32, dims.h * 0.3 + 0.1, dims.l / 2 + 0.01]}
        >
          <circleGeometry args={[0.04, 8]} />
          <meshStandardMaterial
            color="#fff5e0"
            emissive="#fff5e0"
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}

      {/* Taillights — red */}
      {["left", "right"].map((side, i) => (
        <mesh
          key={`tail-${side}`}
          position={[(i === 0 ? -1 : 1) * dims.w * 0.32, dims.h * 0.3 + 0.1, -dims.l / 2 - 0.01]}
          rotation={[0, Math.PI, 0]}
        >
          <circleGeometry args={[0.03, 8]} />
          <meshStandardMaterial
            color="#cc2222"
            emissive="#cc2222"
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}

      {isCrashed && <CrashEffect />}
    </group>
  );
}

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
      <RoundedBox args={[0.25, 0.22, 0.8]} radius={0.08} smoothness={4} position={[0, 0.3, 0]} castShadow>
        <meshStandardMaterial
          color={isCrashed ? "#cc3333" : color}
          roughness={0.25}
          metalness={0.3}
        />
      </RoundedBox>
      <mesh position={[0, 0.1, 0.33]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 10]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, -0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 10]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {isCrashed && <CrashEffect />}
    </group>
  );
}

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
      <RoundedBox args={[0.24, 0.08, 0.24]} radius={0.04} smoothness={4}>
        <meshStandardMaterial color="#555555" roughness={0.3} metalness={0.4} />
      </RoundedBox>
      {[
        [0.18, 0.03, 0.18],
        [-0.18, 0.03, 0.18],
        [0.18, 0.03, -0.18],
        [-0.18, 0.03, -0.18],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh>
            <cylinderGeometry args={[0.008, 0.008, 0.08, 4]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.16, 0.005, 0.025]} />
            <meshStandardMaterial color="#999" transparent opacity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

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
      <RoundedBox args={[0.5, 0.35, 1.3]} radius={0.12} smoothness={4} castShadow>
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.25} />
      </RoundedBox>
      <RoundedBox args={[0.45, 0.25, 0.4]} radius={0.08} smoothness={4} position={[0, 0.06, 0.46]}>
        <meshStandardMaterial color="#1a2233" roughness={0.1} metalness={0.2} transparent opacity={0.7} />
      </RoundedBox>
      <RoundedBox args={[0.1, 0.1, 0.65]} radius={0.04} smoothness={2} position={[0, 0.06, -0.95]}>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.25} />
      </RoundedBox>
      <group position={[0, 0.28, 0]} rotation={[0, rotorAngle.current, 0]}>
        <mesh>
          <boxGeometry args={[1.8, 0.012, 0.06]} />
          <meshStandardMaterial color="#888" transparent opacity={0.35} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[1.8, 0.012, 0.06]} />
          <meshStandardMaterial color="#888" transparent opacity={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function CrashEffect() {
  const groupRef = useRef<THREE.Group>(null);
  const particles = useMemo(() => {
    return Array.from({ length: 6 }, () => ({
      x: (Math.random() - 0.5) * 1.5,
      y: Math.random() * 1.5 + 0.3,
      z: (Math.random() - 0.5) * 1.5,
      scale: 0.04 + Math.random() * 0.08,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 1.5;
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <octahedronGeometry args={[p.scale]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#ff4444" : "#ff8800"}
            emissive={i % 2 === 0 ? "#cc0000" : "#cc6600"}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}
