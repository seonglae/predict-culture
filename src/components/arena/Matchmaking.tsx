"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface MatchmakingProps {
  onTimeout?: () => void;
  opponentFound?: boolean;
  opponentName?: string;
  showGlobe?: boolean;
}

// Procedural globe shader
const globeVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const globeFragmentShader = `
varying vec3 vNormal;
varying vec3 vPosition;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 n = normalize(vPosition);
  float lat = asin(n.y);
  float lon = atan(n.z, n.x);
  vec2 coord = vec2(lon * 2.0, lat * 3.0);
  float continentNoise = fbm(coord * 1.8 + vec2(0.5, 0.3));
  continentNoise += fbm(coord * 3.5 + vec2(2.1, 1.7)) * 0.3;

  float nAmerica = smoothstep(0.8, 0.0, length(vec2(lon + 1.7, lat - 0.7)));
  float europe = smoothstep(0.7, 0.0, length(vec2(lon - 0.15, lat - 0.8)));
  float africa = smoothstep(0.6, 0.0, length(vec2(lon - 0.3, lat - 0.0)));
  float asia = smoothstep(0.9, 0.0, length(vec2(lon - 1.5, lat - 0.6)));
  float sAmerica = smoothstep(0.5, 0.0, length(vec2(lon + 1.0, lat + 0.3)));
  float australia = smoothstep(0.4, 0.0, length(vec2(lon - 2.3, lat + 0.45)));
  float landBias = max(max(max(nAmerica, europe), max(africa, asia)), max(sAmerica, australia));
  float landMask = smoothstep(0.38, 0.42, continentNoise + landBias * 0.35);

  vec3 ocean = mix(vec3(0.04, 0.08, 0.18), vec3(0.06, 0.12, 0.25), fbm(coord * 5.0) * 0.3);
  vec3 landColor = mix(vec3(0.08, 0.14, 0.1), vec3(0.12, 0.2, 0.14), fbm(coord * 4.0));
  float coast = smoothstep(0.03, 0.0, abs(continentNoise + landBias * 0.35 - 0.4));
  vec3 color = mix(ocean, landColor, landMask);
  color += vec3(0.0, 0.45, 0.5) * coast * 0.6;

  float latLine = smoothstep(0.02, 0.0, abs(fract(lat * 3.0 / 3.14159) - 0.5) - 0.48);
  float lonLine = smoothstep(0.02, 0.0, abs(fract(lon * 3.0 / 3.14159) - 0.5) - 0.48);
  color += vec3(0.0, 0.3, 0.4) * max(latLine, lonLine) * 0.12;

  float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  color += vec3(0.0, 0.4, 0.5) * fresnel * 0.3;

  gl_FragColor = vec4(color, 1.0);
}
`;

function SpinningGlobe() {
  const groupRef = useRef<THREE.Group>(null);

  const shaderMaterial = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: globeVertexShader,
      fragmentShader: globeFragmentShader,
    }),
    []
  );

  const cities = useMemo(() => {
    const cityCoords = [
      { lat: 40.758, lon: -73.9855 },
      { lat: 51.5074, lon: -0.1278 },
      { lat: 48.8606, lon: 2.3376 },
      { lat: 35.6595, lon: 139.7004 },
      { lat: 1.2838, lon: 103.8591 },
      { lat: 34.0407, lon: -118.2468 },
      { lat: 37.7879, lon: -122.4074 },
    ];
    return cityCoords.map(({ lat, lon }) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -1.52 * Math.sin(phi) * Math.cos(theta),
        1.52 * Math.cos(phi),
        1.52 * Math.sin(phi) * Math.sin(theta)
      );
    });
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh material={shaderMaterial}>
        <sphereGeometry args={[1.5, 48, 48]} />
      </mesh>

      {/* Atmosphere */}
      <mesh>
        <sphereGeometry args={[1.56, 32, 32]} />
        <meshBasicMaterial color="#0066aa" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>

      {/* City dots */}
      {cities.map((pos, i) => (
        <CityDot key={i} position={pos} />
      ))}
    </group>
  );
}

function CityDot({ position }: { position: THREE.Vector3 }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 2 + position.x * 5) * 0.3 + 1;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshBasicMaterial color="#00e5c7" toneMapped={false} />
    </mesh>
  );
}

export function Matchmaking({ onTimeout, opponentFound, opponentName, showGlobe }: MatchmakingProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (opponentFound) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeout?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onTimeout, opponentFound]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#030308]"
    >
      {showGlobe ? (
        <div className="relative w-72 h-72 mb-6">
          <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }}>
            <ambientLight intensity={0.4} />
            <pointLight position={[5, 3, 5]} intensity={0.5} color="#4a9eff" />
            <pointLight position={[-3, 2, -3]} intensity={0.25} color="#00e5c7" />
            <SpinningGlobe />
          </Canvas>
        </div>
      ) : (
        <div className="relative w-40 h-40 mb-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border-2 border-[#00e5c7]"
              initial={{ scale: 0.3, opacity: 1 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-[#00e5c7]" />
          </div>
        </div>
      )}

      {opponentFound ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <p className="text-2xl font-bold text-[#00e5c7] mb-2">Opponent Found!</p>
          <p className="text-lg text-white/70">{opponentName}</p>
        </motion.div>
      ) : (
        <div className="text-center">
          <p className="text-[10px] tracking-[0.5em] uppercase text-white/25 font-mono mb-3 animate-pulse">
            Scanning Global Network
          </p>
          <p className="text-lg text-white/60 mb-2 font-mono">Finding opponent...</p>
          <p className="text-white/25 text-xs font-mono">
            {countdown > 0 ? `${countdown}s` : "Starting with AI..."}
          </p>
        </div>
      )}
    </motion.div>
  );
}
