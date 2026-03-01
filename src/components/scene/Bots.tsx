"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox, Html } from "@react-three/drei";

interface BotData {
  _id: string;
  name: string;
  color: string;
  belief: string;
  posX: number;
  posZ: number;
  targetX?: number;
  targetZ?: number;
  moveStartedAt?: number;
  heading: number;
  state: string;
}

interface SpeechBubble {
  text: string;
  timestamp: number;
}

interface BotsProps {
  bots: BotData[];
  latestMessages?: { senderId: string; content: string; createdAt: number }[];
}

// Walk speed in world units per second
const WALK_SPEED = 2.0;

export function Bots({ bots, latestMessages }: BotsProps) {
  return (
    <group>
      {bots.map((bot) => {
        const lastMsg = latestMessages?.findLast(
          (m) => m.senderId === bot._id && m.createdAt > Date.now() - 5000
        );
        return (
          <Bot
            key={bot._id}
            bot={bot}
            speechText={lastMsg?.content}
          />
        );
      })}
    </group>
  );
}

function Bot({ bot, speechText }: { bot: BotData; speechText?: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const [bubble, setBubble] = useState<SpeechBubble | null>(null);

  // Track the walk animation state
  const walkRef = useRef({
    startX: bot.posX,
    startZ: bot.posZ,
    endX: bot.posX,
    endZ: bot.posZ,
    startTime: 0,
    duration: 0,
    walking: false,
  });

  // When bot data changes, update walk trajectory
  useEffect(() => {
    const w = walkRef.current;
    if (bot.targetX !== undefined && bot.targetZ !== undefined && bot.moveStartedAt) {
      // New target — start walking from current pos to target
      const g = groupRef.current;
      w.startX = g ? g.position.x : bot.posX;
      w.startZ = g ? g.position.z : bot.posZ;
      w.endX = bot.targetX;
      w.endZ = bot.targetZ;
      const dx = w.endX - w.startX;
      const dz = w.endZ - w.startZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      w.duration = Math.max(0.5, distance / WALK_SPEED); // at least 0.5s
      w.startTime = Date.now() * 0.001;
      w.walking = true;
    } else if (bot.targetX === undefined && bot.targetZ === undefined) {
      // Arrived — snap to final pos
      w.endX = bot.posX;
      w.endZ = bot.posZ;
      w.walking = false;
    }
  }, [bot.posX, bot.posZ, bot.targetX, bot.targetZ, bot.moveStartedAt]);

  // Speech bubble management
  useEffect(() => {
    if (speechText) {
      setBubble({ text: speechText, timestamp: Date.now() });
      const timer = setTimeout(() => setBubble(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [speechText]);

  const lighterColor = useMemo(() => {
    const c = new THREE.Color(bot.color);
    c.lerp(new THREE.Color("#ffffff"), 0.3);
    return `#${c.getHexString()}`;
  }, [bot.color]);

  useFrame(() => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    const w = walkRef.current;
    const now = Date.now() * 0.001;

    let targetX: number, targetZ: number;

    if (w.walking && w.duration > 0) {
      // Time-based interpolation along trajectory
      const elapsed = now - w.startTime;
      const t = Math.min(1, elapsed / w.duration);
      // Smooth ease-in-out
      const smooth = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      targetX = w.startX + (w.endX - w.startX) * smooth;
      targetZ = w.startZ + (w.endZ - w.startZ) * smooth;

      if (t >= 1) {
        w.walking = false;
      }
    } else {
      targetX = w.endX;
      targetZ = w.endZ;
    }

    // Smooth final approach (small lerp to avoid snapping)
    g.position.x += (targetX - g.position.x) * 0.15;
    g.position.z += (targetZ - g.position.z) * 0.15;

    // Gentle bobbing
    const time = now;
    g.position.y = Math.sin(time * 2 + bot._id.charCodeAt(0)) * 0.05;

    // Face direction of movement
    const targetRot = Math.PI - bot.heading;
    let angleDiff = targetRot - g.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    g.rotation.y += angleDiff * 0.08;

    // Walking tilt animation
    if (w.walking || bot.state === "walking") {
      const tilt = Math.sin(time * 6) * 0.08;
      g.rotation.z = g.rotation.z + (tilt - g.rotation.z) * 0.12;
    } else {
      g.rotation.z *= 0.92;
    }
  });

  return (
    <group ref={groupRef} position={[bot.posX, 0, bot.posZ]} rotation={[0, Math.PI - bot.heading, 0]}>
      {/* Body */}
      <RoundedBox
        args={[0.6, 0.8, 0.4]}
        radius={0.15}
        smoothness={4}
        position={[0, 0.5, 0]}
        castShadow
      >
        <meshStandardMaterial color={bot.color} roughness={0.4} metalness={0.1} />
      </RoundedBox>

      {/* Head */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={lighterColor} roughness={0.4} metalness={0.1} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.1, 1.2, 0.25]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.1, 1.2, 0.25]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Eye highlights */}
      <mesh position={[-0.08, 1.22, 0.29]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.12, 1.22, 0.29]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>

      {/* Name label — fixed size regardless of zoom */}
      <Html position={[0, 1.7, 0]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="px-3 py-1 rounded-full text-[13px] font-mono font-bold whitespace-nowrap"
          style={{ backgroundColor: bot.color, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          {bot.name}
        </div>
      </Html>

      {/* Speech bubble — fixed size regardless of zoom */}
      {bubble && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="max-w-[400px] min-w-[220px] px-5 py-3 rounded-xl text-[15px] leading-relaxed font-mono text-white shadow-lg animate-fade-in"
            style={{
              backgroundColor: `${bot.color}cc`,
              backdropFilter: "blur(4px)",
            }}
          >
            {bubble.text.length > 120 ? bubble.text.slice(0, 120) + "..." : bubble.text}
          </div>
        </Html>
      )}
    </group>
  );
}
