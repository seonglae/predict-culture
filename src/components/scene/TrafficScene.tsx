"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Ground } from "./Ground";
import { Roads } from "./Roads";
import { Buildings } from "./Buildings";
import { Vehicles } from "./Vehicles";
import { PredictionPin } from "./PredictionPin";
import { CameraRig } from "./CameraRig";

interface Tile {
  row: number;
  col: number;
  type: string;
  height?: number;
  color?: string;
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

interface Prediction {
  x: number;
  z: number;
  color?: string;
  label?: string;
}

interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

interface TrafficSceneProps {
  tiles: Tile[];
  gridSize: number;
  tileSize: number;
  vehicles: VehicleSpawn[];
  currentFrame?: VehicleFrame[];
  predictions?: Prediction[];
  accidentPoint?: { x: number; z: number } | null;
  onGroundClick?: (point: { x: number; z: number }) => void;
  interactive?: boolean;
  roads?: RoadSegment[];
}

// Gradient sky dome — soft urban sky
function SkyDome({ mapSize }: { mapSize: number }) {
  const skyGeo = useMemo(() => new THREE.SphereGeometry(mapSize * 6, 32, 16), [mapSize]);
  const skyMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color("#87CEEB") },
        bottomColor: { value: new THREE.Color("#dce8f0") },
        offset: { value: 0.3 },
        exponent: { value: 0.5 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y + offset;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
    });
  }, []);

  return <mesh geometry={skyGeo} material={skyMat} />;
}

export function TrafficScene({
  tiles,
  gridSize,
  tileSize,
  vehicles,
  currentFrame,
  predictions = [],
  accidentPoint,
  onGroundClick,
  interactive = true,
  roads,
}: TrafficSceneProps) {
  const mapSize = (gridSize * tileSize) / 2;

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-white/[0.06]">
      <Canvas
        shadows
        camera={{ position: [0, mapSize * 2, mapSize * 1.2], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#dce8f0" }}
      >
        <Suspense fallback={null}>
          {/* Sky */}
          <SkyDome mapSize={mapSize} />

          {/* Lighting — warm and soft */}
          <ambientLight intensity={0.65} color="#fff8f0" />
          <directionalLight
            position={[mapSize, mapSize * 1.5, mapSize]}
            intensity={1.1}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={mapSize * 4}
            shadow-camera-left={-mapSize * 1.5}
            shadow-camera-right={mapSize * 1.5}
            shadow-camera-top={mapSize * 1.5}
            shadow-camera-bottom={-mapSize * 1.5}
          />
          <directionalLight
            position={[-mapSize, mapSize, -mapSize]}
            intensity={0.25}
            color="#b8d4e8"
          />

          {/* Fog for depth */}
          <fog attach="fog" args={["#dce8f0", mapSize * 2.5, mapSize * 6]} />

          {/* Scene */}
          <Ground size={mapSize} onGroundClick={interactive ? onGroundClick : undefined} />
          <Roads tiles={tiles} gridSize={gridSize} tileSize={tileSize} roads={roads} />
          <Buildings tiles={tiles} gridSize={gridSize} tileSize={tileSize} />
          <Vehicles initialVehicles={vehicles} currentFrame={currentFrame} roads={roads} />

          {/* Prediction markers */}
          {predictions.map((p, i) => (
            <PredictionPin
              key={i}
              position={{ x: p.x, z: p.z }}
              color={p.color}
              label={p.label}
            />
          ))}

          {/* Accident point reveal */}
          {accidentPoint && (
            <PredictionPin
              position={accidentPoint}
              color="#e63946"
              isAccident
            />
          )}

          {/* Controls */}
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            enableRotate={true}
            maxPolarAngle={Math.PI / 2}
            minPolarAngle={0}
            minDistance={mapSize * 0.5}
            maxDistance={mapSize * 5}
          />

          <CameraRig mapSize={mapSize} />
        </Suspense>
      </Canvas>
    </div>
  );
}
