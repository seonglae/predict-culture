"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

interface GeoGlobeProps {
  radius?: number;
  /** Spin speed (radians/sec). Set 0 to stop. */
  spinSpeed?: number;
  /** City lat/lon markers */
  cities?: { lat: number; lon: number; selected?: boolean }[];
  /** External ref to control rotation */
  groupRef?: React.RefObject<THREE.Group | null>;
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Convert GeoJSON MultiPolygon/Polygon rings into line segments on sphere */
function geoToLineGeometry(
  geoFeatures: GeoJSON.Feature[],
  radius: number
): THREE.BufferGeometry {
  const points: number[] = [];

  for (const feature of geoFeatures) {
    const geom = feature.geometry;
    let rings: number[][][] = [];

    if (geom.type === "Polygon") {
      rings = geom.coordinates;
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        rings.push(...poly);
      }
    }

    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        const v1 = latLonToVec3(lat1, lon1, radius);
        const v2 = latLonToVec3(lat2, lon2, radius);
        points.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3)
  );
  return geometry;
}

/** Latitude/longitude grid lines */
function createGridGeometry(radius: number): THREE.BufferGeometry {
  const points: number[] = [];
  const step = 30; // degrees between grid lines
  const segments = 72;

  // Latitude lines
  for (let lat = -60; lat <= 60; lat += step) {
    for (let i = 0; i < segments; i++) {
      const lon1 = (i / segments) * 360 - 180;
      const lon2 = ((i + 1) / segments) * 360 - 180;
      const v1 = latLonToVec3(lat, lon1, radius);
      const v2 = latLonToVec3(lat, lon2, radius);
      points.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    }
  }

  // Longitude lines
  for (let lon = -180; lon < 180; lon += step) {
    for (let i = 0; i < segments; i++) {
      const lat1 = (i / segments) * 180 - 90;
      const lat2 = ((i + 1) / segments) * 180 - 90;
      const v1 = latLonToVec3(lat1, lon, radius);
      const v2 = latLonToVec3(lat2, lon, radius);
      points.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3)
  );
  return geometry;
}

export function GeoGlobe({
  radius = 1.5,
  spinSpeed = 0.3,
  cities = [],
  groupRef: externalRef,
}: GeoGlobeProps) {
  const internalRef = useRef<THREE.Group>(null);
  const ref = externalRef ?? internalRef;
  const [borderGeom, setBorderGeom] = useState<THREE.BufferGeometry | null>(
    null
  );

  const gridGeom = useMemo(() => createGridGeometry(radius + 0.002), [radius]);

  // Load TopoJSON and convert to line geometry
  useEffect(() => {
    let cancelled = false;
    fetch("/geo/countries-110m.json")
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (cancelled) return;
        const countries = topojson.feature(
          topo,
          topo.objects.countries as GeometryCollection
        );
        const geom = geoToLineGeometry(
          (countries as GeoJSON.FeatureCollection).features,
          radius + 0.003
        );
        setBorderGeom(geom);
      });
    return () => {
      cancelled = true;
    };
  }, [radius]);

  useFrame((_, delta) => {
    if (ref.current && spinSpeed !== 0) {
      ref.current.rotation.y += delta * spinSpeed;
    }
  });

  const cityPositions = useMemo(
    () =>
      cities.map((c) => ({
        pos: latLonToVec3(c.lat, c.lon, radius + 0.015),
        selected: c.selected ?? false,
      })),
    [cities, radius]
  );

  return (
    <group ref={ref}>
      {/* Ocean sphere */}
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color="#060d1a" />
      </mesh>

      {/* Country borders */}
      {borderGeom && (
        <lineSegments geometry={borderGeom}>
          <lineBasicMaterial color="#00c9b0" transparent opacity={0.35} />
        </lineSegments>
      )}

      {/* Grid lines */}
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color="#1a3a4a" transparent opacity={0.2} />
      </lineSegments>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[radius * 1.04, 48, 48]} />
        <meshBasicMaterial
          color="#0088cc"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </mesh>

      {/* City dots */}
      {cityPositions.map((c, i) => (
        <mesh key={i} position={c.pos}>
          <sphereGeometry args={[c.selected ? 0.03 : 0.02, 8, 8]} />
          <meshBasicMaterial
            color={c.selected ? "#00e5c7" : "#4a9eff"}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export { latLonToVec3 };
