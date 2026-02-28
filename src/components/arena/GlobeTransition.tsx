"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";

interface CityMarker {
  name: string;
  label: string;
  lat: number;
  lon: number;
  position: THREE.Vector3;
}

const CITIES: Omit<CityMarker, "position">[] = [
  { name: "New York", label: "Times Square", lat: 40.758, lon: -73.9855 },
  { name: "London", label: "Trafalgar Square", lat: 51.5074, lon: -0.1278 },
  { name: "Paris", label: "Rue de Rivoli", lat: 48.8606, lon: 2.3376 },
  { name: "Tokyo", label: "Shibuya Crossing", lat: 35.6595, lon: 139.7004 },
  { name: "Singapore", label: "Marina Bay", lat: 1.2838, lon: 103.8591 },
  { name: "Los Angeles", label: "Downtown LA", lat: 34.0407, lon: -118.2468 },
  { name: "San Francisco", label: "Union Square", lat: 37.7879, lon: -122.4074 },
];

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Procedural globe shader — ocean + continents from noise
const globeVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Simple noise-based continent generation
// Uses a combination of sine waves to approximate continent shapes
const globeFragmentShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

// Simple hash for pseudo-random
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise
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

// Fractal noise
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
  // Convert sphere position to lat/lon
  vec3 n = normalize(vPosition);
  float lat = asin(n.y);
  float lon = atan(n.z, n.x);

  // Generate continent mask using noise
  vec2 coord = vec2(lon * 2.0, lat * 3.0);
  float continentNoise = fbm(coord * 1.8 + vec2(0.5, 0.3));
  continentNoise += fbm(coord * 3.5 + vec2(2.1, 1.7)) * 0.3;

  // Bias towards land near known continent positions
  // North America
  float nAmerica = smoothstep(0.8, 0.0, length(vec2(lon + 1.7, lat - 0.7)));
  // Europe/Africa
  float europe = smoothstep(0.7, 0.0, length(vec2(lon - 0.15, lat - 0.8)));
  float africa = smoothstep(0.6, 0.0, length(vec2(lon - 0.3, lat - 0.0)));
  // Asia
  float asia = smoothstep(0.9, 0.0, length(vec2(lon - 1.5, lat - 0.6)));
  // South America
  float sAmerica = smoothstep(0.5, 0.0, length(vec2(lon + 1.0, lat + 0.3)));
  // Australia
  float australia = smoothstep(0.4, 0.0, length(vec2(lon - 2.3, lat + 0.45)));

  float landBias = max(max(max(nAmerica, europe), max(africa, asia)), max(sAmerica, australia));

  float landMask = smoothstep(0.38, 0.42, continentNoise + landBias * 0.35);

  // Colors
  vec3 oceanDeep = vec3(0.04, 0.08, 0.18);
  vec3 oceanLight = vec3(0.06, 0.12, 0.25);
  vec3 land = vec3(0.08, 0.14, 0.1);
  vec3 landHighlight = vec3(0.12, 0.2, 0.14);
  vec3 coastline = vec3(0.0, 0.45, 0.5);

  // Ocean with subtle depth variation
  float oceanVariation = fbm(coord * 5.0) * 0.3;
  vec3 ocean = mix(oceanDeep, oceanLight, oceanVariation);

  // Land with height variation
  float height = fbm(coord * 4.0);
  vec3 landColor = mix(land, landHighlight, height);

  // Coastline glow
  float coast = smoothstep(0.03, 0.0, abs(continentNoise + landBias * 0.35 - 0.4));

  vec3 color = mix(ocean, landColor, landMask);
  color += coastline * coast * 0.6;

  // Grid lines
  float latLine = smoothstep(0.02, 0.0, abs(fract(lat * 3.0 / 3.14159) - 0.5) - 0.48);
  float lonLine = smoothstep(0.02, 0.0, abs(fract(lon * 3.0 / 3.14159) - 0.5) - 0.48);
  float grid = max(latLine, lonLine);
  color += vec3(0.0, 0.3, 0.4) * grid * 0.15;

  // Fresnel rim glow
  float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  color += vec3(0.0, 0.4, 0.5) * fresnel * 0.4;

  gl_FragColor = vec4(color, 1.0);
}
`;

interface GlobeTransitionProps {
  selectedCity: string;
  onComplete: () => void;
}

type Phase = "spinning" | "locking" | "zooming" | "done";

function GlobeScene({
  selectedCity,
  onComplete,
}: GlobeTransitionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const phaseRef = useRef<Phase>("spinning");
  const completedRef = useRef(false);
  const { camera } = useThree();

  const cities = useMemo<CityMarker[]>(
    () =>
      CITIES.map((c) => ({
        ...c,
        position: latLonToVector3(c.lat, c.lon, 2.02),
      })),
    []
  );

  const targetCity = useMemo(
    () => cities.find((c) => c.name === selectedCity) ?? cities[0],
    [cities, selectedCity]
  );

  const targetRotation = useMemo(() => {
    const theta = (targetCity.lon + 180) * (Math.PI / 180);
    return new THREE.Euler(0, -theta + Math.PI, 0);
  }, [targetCity]);

  const shaderMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: globeVertexShader,
        fragmentShader: globeFragmentShader,
      }),
    []
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    elapsedRef.current += delta;
    const t = elapsedRef.current;

    if (t < 2) {
      phaseRef.current = "spinning";
      groupRef.current.rotation.y += delta * 0.8;
    } else if (t < 3.5) {
      phaseRef.current = "locking";
      const lockProgress = Math.min(1, (t - 2) / 1.5);
      const eased = 1 - Math.pow(1 - lockProgress, 3);
      const currentQ = new THREE.Quaternion().setFromEuler(groupRef.current.rotation);
      const targetQ = new THREE.Quaternion().setFromEuler(targetRotation);
      currentQ.slerp(targetQ, eased * 0.08);
      groupRef.current.quaternion.copy(currentQ);
    } else if (t < 4.5) {
      phaseRef.current = "zooming";
      const zoomProgress = Math.min(1, (t - 3.5) / 1.0);
      const eased = 1 - Math.pow(1 - zoomProgress, 2);
      camera.position.z = 5 - eased * 4.5;
      camera.position.y = eased * 0.5;
    } else {
      phaseRef.current = "done";
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Globe with procedural shader — ocean + continents */}
      <mesh material={shaderMaterial}>
        <sphereGeometry args={[2, 64, 64]} />
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[2.08, 48, 48]} />
        <meshBasicMaterial
          color="#0066aa"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </mesh>

      {/* City dots */}
      {cities.map((city) => (
        <CityDot
          key={city.name}
          position={city.position}
          isSelected={city.name === selectedCity}
        />
      ))}
    </group>
  );
}

function CityDot({
  position,
  isSelected,
}: {
  position: THREE.Vector3;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 1;
    const scale = isSelected ? 0.06 * pulse : 0.035;
    meshRef.current.scale.setScalar(scale / 0.04);

    if (ringRef.current && isSelected) {
      const ringPulse = (Math.sin(state.clock.elapsedTime * 2) + 1) * 0.5;
      ringRef.current.scale.setScalar(1 + ringPulse * 0.5);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.4 - ringPulse * 0.3;
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial
          color={isSelected ? "#00e5c7" : "#4a9eff"}
          toneMapped={false}
        />
      </mesh>
      {isSelected && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.06, 0.08, 24]} />
          <meshBasicMaterial color="#00e5c7" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export function GlobeTransition({ selectedCity, onComplete }: GlobeTransitionProps) {
  const [showLabel, setShowLabel] = useState(false);

  const cityInfo = useMemo(
    () => CITIES.find((c) => c.name === selectedCity),
    [selectedCity]
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(true), 2000);
    return () => clearTimeout(timer);
  }, [selectedCity]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 bg-[#030308]"
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 3, 5]} intensity={0.6} color="#4a9eff" />
        <pointLight position={[-4, 2, -3]} intensity={0.3} color="#00e5c7" />
        <GlobeScene selectedCity={selectedCity} onComplete={onComplete} />
      </Canvas>

      {/* City label overlay */}
      <AnimatePresence>
        {showLabel && cityInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute bottom-20 left-0 right-0 text-center pointer-events-none"
          >
            <p className="text-[10px] tracking-[0.5em] uppercase text-[#00e5c7]/50 font-mono mb-2">
              Target Location
            </p>
            <h2
              className="text-4xl md:text-6xl text-white/90 tracking-wider"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {selectedCity}
            </h2>
            <p className="text-xs text-white/30 font-mono mt-2 tracking-widest">
              {cityInfo.label}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scanning text */}
      <div className="absolute top-8 left-0 right-0 text-center pointer-events-none">
        <p className="text-[10px] tracking-[0.5em] uppercase text-white/15 font-mono animate-pulse">
          Scanning Global Network
        </p>
      </div>
    </motion.div>
  );
}
