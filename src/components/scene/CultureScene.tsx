"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Ground } from "./Ground";
import { Buildings } from "./Buildings";
import { Bots } from "./Bots";

interface RoadSegment {
  points: { x: number; z: number }[];
  width: number;
  type: "primary" | "secondary" | "residential";
}

interface BuildingFootprint {
  polygon: { x: number; z: number }[];
  height: number;
  color: string;
}

interface WaterPolygon {
  polygon: { x: number; z: number }[];
}

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

interface CultureSceneProps {
  gridSize: number;
  tileSize: number;
  roads?: RoadSegment[];
  buildings?: BuildingFootprint[];
  waterPolygons?: WaterPolygon[];
  bots: BotData[];
  latestMessages?: { senderId: string; content: string; createdAt: number }[];
  onGroundClick?: (point: { x: number; z: number }) => void;
}

// Gradient sky dome
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

/**
 * Trim a polyline by removing `trimDist` from each end.
 */
function trimPolyline(
  points: { x: number; z: number }[],
  trimDist: number
): { x: number; z: number }[] | null {
  if (points.length < 2) return null;
  const cumDist: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  const totalLen = cumDist[cumDist.length - 1];
  if (totalLen < trimDist * 2 + 0.3) return null;
  const startDist = trimDist;
  const endDist = totalLen - trimDist;
  const result: { x: number; z: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (cumDist[i + 1] >= startDist) {
      const segLen = cumDist[i + 1] - cumDist[i];
      const t = segLen > 0.001 ? (startDist - cumDist[i]) / segLen : 0;
      result.push({ x: points[i].x + (points[i + 1].x - points[i].x) * t, z: points[i].z + (points[i + 1].z - points[i].z) * t });
      break;
    }
  }
  for (let i = 1; i < points.length - 1; i++) {
    if (cumDist[i] > startDist && cumDist[i] < endDist) result.push(points[i]);
  }
  for (let i = points.length - 1; i > 0; i--) {
    if (cumDist[i - 1] <= endDist) {
      const segLen = cumDist[i] - cumDist[i - 1];
      const t = segLen > 0.001 ? (endDist - cumDist[i - 1]) / segLen : 1;
      result.push({ x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, z: points[i - 1].z + (points[i].z - points[i - 1].z) * t });
      break;
    }
  }
  return result.length >= 2 ? result : null;
}

/** Build a ribbon mesh geometry from a polyline. */
function buildRoadRibbonGeometry(points: { x: number; z: number }[], width: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let dx: number, dz: number;
    if (i === 0) { dx = points[1].x - p.x; dz = points[1].z - p.z; }
    else if (i === points.length - 1) { dx = p.x - points[i - 1].x; dz = p.z - points[i - 1].z; }
    else { dx = points[i + 1].x - points[i - 1].x; dz = points[i + 1].z - points[i - 1].z; }
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const hw = width / 2;
    vertices.push(p.x + nx * hw, 0.015, p.z + nz * hw);
    vertices.push(p.x - nx * hw, 0.015, p.z - nz * hw);
    if (i < points.length - 1) {
      const bi = i * 2;
      indices.push(bi, bi + 2, bi + 1);
      indices.push(bi + 1, bi + 2, bi + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Build dashed center line geometry for a road polyline. */
function buildCenterLineGeometry(
  points: { x: number; z: number }[], dashLen: number, gapLen: number, lineWidth: number
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertCount = 0;
  const cycle = dashLen + gapLen;
  let cumDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;
    const ux = dx / segLen, uz = dz / segLen;
    const nx = -uz, nz = ux;
    const hw = lineWidth / 2;
    let t = 0;
    while (t < segLen - 0.001) {
      const posInCycle = cumDist % cycle;
      const drawing = posInCycle < dashLen;
      if (drawing) {
        const dashRemaining = dashLen - posInCycle;
        const step = Math.max(0.01, Math.min(segLen - t, dashRemaining));
        const sx = p0.x + ux * t, sz = p0.z + uz * t;
        const ex = p0.x + ux * (t + step), ez = p0.z + uz * (t + step);
        const bi = vertCount;
        vertices.push(sx + nx * hw, 0.02, sz + nz * hw);
        vertices.push(sx - nx * hw, 0.02, sz - nz * hw);
        vertices.push(ex + nx * hw, 0.02, ez + nz * hw);
        vertices.push(ex - nx * hw, 0.02, ez - nz * hw);
        indices.push(bi, bi + 2, bi + 1);
        indices.push(bi + 1, bi + 2, bi + 3);
        vertCount += 4;
        cumDist += step;
        t += step;
      } else {
        const gapRemaining = cycle - posInCycle;
        const step = Math.max(0.01, Math.min(segLen - t, gapRemaining));
        cumDist += step;
        t += step;
      }
      if (vertCount > 50000) break;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function PolylineRoads({ roads }: { roads: RoadSegment[] }) {
  const geometries = useMemo(() => {
    const roadSurfaces: THREE.BufferGeometry[] = [];
    const yellowLines: THREE.BufferGeometry[] = [];
    for (const road of roads) {
      if (road.points.length < 2) continue;
      roadSurfaces.push(buildRoadRibbonGeometry(road.points, road.width));
      const trimDist = Math.max(road.width * 0.4, 0.8);
      const trimmed = trimPolyline(road.points, trimDist);
      if (trimmed) yellowLines.push(buildCenterLineGeometry(trimmed, 1.0, 0.7, 0.06));
    }
    return { roadSurfaces, yellowLines };
  }, [roads]);

  return (
    <group>
      {geometries.roadSurfaces.map((geo, i) => (
        <mesh key={`road-${i}`} geometry={geo} receiveShadow>
          <meshStandardMaterial color="#3a3a3e" roughness={0.85} metalness={0.02} />
        </mesh>
      ))}
      {geometries.yellowLines.map((geo, i) => (
        <mesh key={`yellow-${i}`} geometry={geo}>
          <meshBasicMaterial color="#e8b500" />
        </mesh>
      ))}
    </group>
  );
}

// Water polygons
function WaterBodies({ waterPolygons }: { waterPolygons: WaterPolygon[] }) {
  const geos = useMemo(() => {
    return waterPolygons.map((wp) => {
      const shape = new THREE.Shape();
      shape.moveTo(wp.polygon[0].x, wp.polygon[0].z);
      for (let i = 1; i < wp.polygon.length; i++) {
        shape.lineTo(wp.polygon[i].x, wp.polygon[i].z);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, -0.01, 0);
      return geo;
    });
  }, [waterPolygons]);

  return (
    <group>
      {geos.map((geo, i) => (
        <mesh key={i} geometry={geo} receiveShadow>
          <meshStandardMaterial color="#4a7c8f" roughness={0.15} metalness={0.1} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function CultureScene({
  gridSize,
  tileSize,
  roads,
  buildings,
  waterPolygons,
  bots,
  latestMessages,
  onGroundClick,
}: CultureSceneProps) {
  const mapSize = (gridSize * tileSize) / 2;

  return (
    <div className="w-full h-full overflow-hidden">
      <Canvas
        shadows
        camera={{ position: [0, mapSize * 1.2, mapSize * 1.4], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#dce8f0" }}
      >
        <Suspense fallback={null}>
          <SkyDome mapSize={mapSize} />

          {/* Lighting */}
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

          <fog attach="fog" args={["#dce8f0", mapSize * 5, mapSize * 12]} />

          {/* Scene elements */}
          <Ground size={mapSize} onGroundClick={onGroundClick} />
          {roads && roads.length > 0 && <PolylineRoads roads={roads} />}
          {waterPolygons && waterPolygons.length > 0 && <WaterBodies waterPolygons={waterPolygons} />}
          <Buildings tiles={[]} gridSize={gridSize} tileSize={tileSize} osmBuildings={buildings} />
          <Bots bots={bots} latestMessages={latestMessages} />

          {/* Camera controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxPolarAngle={Math.PI / 2}
            minPolarAngle={0}
            minDistance={mapSize * 0.3}
            maxDistance={mapSize * 5}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
