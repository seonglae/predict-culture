"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import earcut from "earcut";

interface GeoGlobeProps {
  radius?: number;
  spinSpeed?: number;
  groupRef?: React.RefObject<THREE.Group | null>;
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = lon * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.cos(theta)
  );
}

/** Convert GeoJSON polygons to filled triangulated mesh on sphere */
function geoToFillGeometry(
  geoFeatures: GeoJSON.Feature[],
  radius: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const feature of geoFeatures) {
    const geom = feature.geometry;
    let polygons: number[][][][] = [];

    if (geom.type === "Polygon") {
      polygons = [geom.coordinates];
    } else if (geom.type === "MultiPolygon") {
      polygons = geom.coordinates;
    }

    for (const polygon of polygons) {
      const outerRing = polygon[0];
      const holes = polygon.slice(1);

      const coords: number[] = [];
      const holeIndices: number[] = [];

      const outerLen =
        outerRing[0][0] === outerRing[outerRing.length - 1][0] &&
        outerRing[0][1] === outerRing[outerRing.length - 1][1]
          ? outerRing.length - 1
          : outerRing.length;

      for (let i = 0; i < outerLen; i++) {
        coords.push(outerRing[i][0], outerRing[i][1]);
      }

      for (const hole of holes) {
        holeIndices.push(coords.length / 2);
        const holeLen =
          hole[0][0] === hole[hole.length - 1][0] &&
          hole[0][1] === hole[hole.length - 1][1]
            ? hole.length - 1
            : hole.length;
        for (let i = 0; i < holeLen; i++) {
          coords.push(hole[i][0], hole[i][1]);
        }
      }

      const indices = earcut(coords, holeIndices.length > 0 ? holeIndices : undefined, 2);

      for (const idx of indices) {
        const lon = coords[idx * 2];
        const lat = coords[idx * 2 + 1];
        const v = latLonToVec3(lat, lon, radius);
        const n = v.clone().normalize();
        positions.push(v.x, v.y, v.z);
        normals.push(n.x, n.y, n.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

/** Convert GeoJSON polygons into border line segments on sphere */
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
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}


export function GeoGlobe({
  radius = 1.5,
  spinSpeed = 0.3,
  groupRef: externalRef,
}: GeoGlobeProps) {
  const internalRef = useRef<THREE.Group>(null);
  const ref = externalRef ?? internalRef;
  const [landFillGeom, setLandFillGeom] = useState<THREE.BufferGeometry | null>(null);
  const [borderGeom, setBorderGeom] = useState<THREE.BufferGeometry | null>(null);
  const [urbanFillGeom, setUrbanFillGeom] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Filled land masses
    fetch("/geo/land-50m.json")
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (cancelled) return;
        const land = topojson.feature(topo, topo.objects.land as GeometryCollection);
        const geom = geoToFillGeometry(
          (land as GeoJSON.FeatureCollection).features,
          radius + 0.001
        );
        setLandFillGeom(geom);
      });

    // Country border lines
    fetch("/geo/countries-50m.json")
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

    // Urban area fills for 7 cities
    fetch("/geo/urban-areas.json")
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        const geom = geoToFillGeometry(fc.features, radius + 0.004);
        setUrbanFillGeom(geom);
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

  return (
    <group ref={ref}>
      {/* Ocean sphere — dark, no grid */}
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color="#020810" />
      </mesh>

      {/* Filled land masses */}
      {landFillGeom && (
        <mesh geometry={landFillGeom}>
          <meshBasicMaterial
            color="#0a1a28"
            transparent
            opacity={0.95}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* City urban areas */}
      {urbanFillGeom && (
        <mesh geometry={urbanFillGeom}>
          <meshBasicMaterial
            color="#00e5c7"
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Country borders */}
      {borderGeom && (
        <lineSegments geometry={borderGeom}>
          <lineBasicMaterial color="#00c9b0" transparent opacity={0.2} />
        </lineSegments>
      )}

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[radius * 1.025, 48, 48]} />
        <meshBasicMaterial
          color="#0077aa"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </mesh>

    </group>
  );
}

export { latLonToVec3 };
