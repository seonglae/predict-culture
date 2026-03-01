import {
  type SceneConfig,
  type VehicleSpawn,
  type VehicleFrame,
  type SimulationFrame,
  type SimulationResult,
  type TileType,
  type Tile,
  type RoadSegment,
} from "./types";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RoadEdge {
  roadIdx: number;
  forward: boolean;
  length: number;
  otherJunction: number;
}

interface Junction {
  x: number;
  z: number;
  edges: RoadEdge[];
}

function buildRoadGraph(roads: RoadSegment[]) {
  const SNAP = 1.5;
  const junctions: Junction[] = [];
  const roadLengths: number[] = [];

  for (const road of roads) {
    let len = 0;
    for (let i = 1; i < road.points.length; i++) {
      const dx = road.points[i].x - road.points[i - 1].x;
      const dz = road.points[i].z - road.points[i - 1].z;
      len += Math.sqrt(dx * dx + dz * dz);
    }
    roadLengths.push(len);
  }

  function getJunction(x: number, z: number): number {
    for (let i = 0; i < junctions.length; i++) {
      const dx = junctions[i].x - x;
      const dz = junctions[i].z - z;
      if (dx * dx + dz * dz < SNAP * SNAP) return i;
    }
    junctions.push({ x, z, edges: [] });
    return junctions.length - 1;
  }

  for (let ri = 0; ri < roads.length; ri++) {
    const pts = roads[ri].points;
    if (pts.length < 2 || roadLengths[ri] < 0.5) continue;
    const jStart = getJunction(pts[0].x, pts[0].z);
    const jEnd = getJunction(pts[pts.length - 1].x, pts[pts.length - 1].z);
    junctions[jStart].edges.push({ roadIdx: ri, forward: true, length: roadLengths[ri], otherJunction: jEnd });
    junctions[jEnd].edges.push({ roadIdx: ri, forward: false, length: roadLengths[ri], otherJunction: jStart });
  }

  return { junctions, roadLengths };
}

function computeVertexNormals(pts: { x: number; z: number }[]) {
  const normals: { x: number; z: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    let nx = 0, nz = 0, count = 0;
    if (i > 0) {
      const dx = pts[i].x - pts[i - 1].x;
      const dz = pts[i].z - pts[i - 1].z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.001) { nx += -dz / len; nz += dx / len; count++; }
    }
    if (i < pts.length - 1) {
      const dx = pts[i + 1].x - pts[i].x;
      const dz = pts[i + 1].z - pts[i].z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.001) { nx += -dz / len; nz += dx / len; count++; }
    }
    if (count > 0) { nx /= count; nz /= count; }
    const nlen = Math.sqrt(nx * nx + nz * nz);
    normals.push(nlen > 0.001 ? { x: nx / nlen, z: nz / nlen } : { x: 0, z: 0 });
  }
  return normals;
}

const normalCache = new Map<RoadSegment, { fwd: { x: number; z: number }[]; rev: { x: number; z: number }[] }>();

function getRoadNormals(road: RoadSegment) {
  let cached = normalCache.get(road);
  if (cached) return cached;
  const fwd = computeVertexNormals(road.points);
  const rev = computeVertexNormals([...road.points].reverse());
  cached = { fwd, rev };
  normalCache.set(road, cached);
  return cached;
}

function interpolateRoad(road: RoadSegment, dist: number, forward: boolean, laneOffset: number = 0) {
  const pts = road.points;
  if (pts.length < 2) return { x: pts[0].x, z: pts[0].z, heading: 0 };

  const ordered = forward ? pts : [...pts].reverse();
  const normals = forward ? getRoadNormals(road).fwd : getRoadNormals(road).rev;
  let remaining = dist;

  for (let i = 0; i < ordered.length - 1; i++) {
    const dx = ordered[i + 1].x - ordered[i].x;
    const dz = ordered[i + 1].z - ordered[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      const cx = ordered[i].x + dx * t;
      const cz = ordered[i].z + dz * t;
      const heading = Math.atan2(dx, -dz);
      const nx = normals[i].x * (1 - t) + normals[i + 1].x * t;
      const nz = normals[i].z * (1 - t) + normals[i + 1].z * t;
      return { x: cx + nx * laneOffset, z: cz + nz * laneOffset, heading };
    }
    remaining -= segLen;
  }

  const last = ordered[ordered.length - 1];
  const prev = ordered[ordered.length - 2];
  const lastN = normals[normals.length - 1];
  return {
    x: last.x + lastN.x * laneOffset,
    z: last.z + lastN.z * laneOffset,
    heading: Math.atan2(last.x - prev.x, -(last.z - prev.z)),
  };
}

interface VehicleSim {
  id: string;
  roadIdx: number;
  forward: boolean;
  dist: number;
  speed: number;
  maxSpeed: number;
  laneOffset: number;
  width: number;
  length: number;
  aggressiveness: number;
  state: "driving" | "crashed";
  x: number;
  z: number;
  heading: number;
  flying: boolean;
  altitude: number;
}

const SIZES: Record<string, { w: number; l: number }> = {
  car: { w: 0.55, l: 1.2 },
  truck: { w: 0.65, l: 1.8 },
  bus: { w: 0.7, l: 2.4 },
  motorcycle: { w: 0.25, l: 0.8 },
};

export function runSimulation(
  scene: SceneConfig,
  seed: number,
  durationSeconds: number = 45,
  fps: number = 60,
  recordEvery: number = 6
): SimulationResult | null {
  const rng = mulberry32(seed + 12345);
  const dt = 1 / fps;
  const totalSteps = Math.ceil(durationSeconds * fps);
  const roads = scene.roads;

  if (!roads || roads.length === 0) {
    return runTileGridSimulation(scene, seed, durationSeconds, fps, recordEvery);
  }

  const { junctions, roadLengths } = buildRoadGraph(roads);
  const mapRadius = scene.mapRadius;

  const vehicles: VehicleSim[] = [];

  for (const v of scene.vehicles) {
    if (v.flying) {
      const sz = SIZES[v.type] ?? { w: 0.7, l: 1.4 };
      vehicles.push({
        id: v.id, roadIdx: -1, forward: true, dist: 0,
        speed: v.speed, maxSpeed: v.speed, laneOffset: 0,
        width: sz.w, length: sz.l, aggressiveness: v.aggressiveness,
        state: "driving", x: v.x, z: v.z, heading: v.heading,
        flying: true, altitude: v.altitude ?? 8,
      });
      continue;
    }

    let bestRoad = -1;
    let bestDistSq = Infinity;
    for (let ri = 0; ri < roads.length; ri++) {
      for (const p of roads[ri].points) {
        const d2 = (p.x - v.x) ** 2 + (p.z - v.z) ** 2;
        if (d2 < bestDistSq) { bestDistSq = d2; bestRoad = ri; }
      }
    }
    if (bestRoad < 0) continue;

    const sz = SIZES[v.type] ?? { w: 0.7, l: 1.4 };
    const forward = rng() > 0.5;
    const roadLen = roadLengths[bestRoad];
    const roadW = roads[bestRoad].width;
    const halfW = roadW / 2;
    const numLanes = Math.max(1, Math.round(halfW / 1.5));
    const laneWidth = halfW / numLanes;
    const laneIdx = Math.floor(rng() * numLanes);
    const laneCenterOffset = (laneIdx + 0.5) * laneWidth;

    vehicles.push({
      id: v.id, roadIdx: bestRoad, forward,
      dist: Math.max(2, Math.min(roadLen - 2, rng() * roadLen)),
      speed: v.speed, maxSpeed: v.speed,
      laneOffset: laneCenterOffset,
      width: sz.w, length: sz.l, aggressiveness: v.aggressiveness,
      state: "driving", x: 0, z: 0, heading: 0,
      flying: false, altitude: 0,
    });
  }

  for (const v of vehicles) {
    if (!v.flying) updateVehiclePosition(v, roads);
  }

  // Push apart overlapping vehicles
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < vehicles.length; i++) {
      if (vehicles[i].flying) continue;
      for (let j = i + 1; j < vehicles.length; j++) {
        if (vehicles[j].flying) continue;
        if (vehicles[i].roadIdx === vehicles[j].roadIdx) {
          const dDist = Math.abs(vehicles[i].dist - vehicles[j].dist);
          if (dDist < 5) {
            if (vehicles[i].dist < vehicles[j].dist) {
              vehicles[i].dist -= 3; vehicles[j].dist += 3;
            } else {
              vehicles[i].dist += 3; vehicles[j].dist -= 3;
            }
            const rl = roadLengths[vehicles[i].roadIdx];
            vehicles[i].dist = Math.max(1, Math.min(rl - 1, vehicles[i].dist));
            vehicles[j].dist = Math.max(1, Math.min(rl - 1, vehicles[j].dist));
          }
          continue;
        }
        const d2 = (vehicles[j].x - vehicles[i].x) ** 2 + (vehicles[j].z - vehicles[i].z) ** 2;
        if (d2 < 4) {
          vehicles[j].dist += 5;
          const rl = roadLengths[vehicles[j].roadIdx];
          if (vehicles[j].dist > rl - 1) vehicles[j].dist = rl * 0.5;
        }
      }
    }
    for (const v of vehicles) {
      if (!v.flying) updateVehiclePosition(v, roads);
    }
  }

  // Gradual spawning: double by 10s
  const initialCount = vehicles.length;
  const targetCount = initialCount * 2;
  const spawnInterval = fps * 2;
  let nextSpawnStep = spawnInterval;
  let spawnedExtra = 0;
  const spawnBatchSize = Math.max(1, Math.ceil((targetCount - initialCount) / 5));
  let nextVehicleId = initialCount;

  const frames: SimulationFrame[] = [];
  let accidentPoint: { x: number; z: number } | null = null;
  let accidentTime = 0;
  let accidentFrame = 0;

  for (let step = 0; step < totalSteps; step++) {
    const time = step * dt;

    // Gradual spawn
    if (step >= nextSpawnStep && time < 10 && spawnedExtra < targetCount - initialCount) {
      for (let si = 0; si < spawnBatchSize && spawnedExtra < targetCount - initialCount; si++) {
        const ri = Math.floor(rng() * roads.length);
        const road = roads[ri];
        if (road.points.length < 2) continue;
        const roadLen = roadLengths[ri];
        if (roadLen < 3) continue;
        const dist = 2 + rng() * (roadLen - 4);
        const forward = rng() > 0.5;
        let tooClose = false;
        for (const ov of vehicles) {
          if (ov.roadIdx === ri && ov.forward === forward && Math.abs(ov.dist - dist) < 3) {
            tooClose = true; break;
          }
        }
        if (tooClose) continue;
        const vType = rng() > 0.7 ? "truck" : rng() > 0.5 ? "motorcycle" : "car";
        const vSz = SIZES[vType] ?? { w: 0.55, l: 1.2 };
        const spawnRoadW = road.width;
        const spawnHalfW = spawnRoadW / 2;
        const spawnNumLanes = Math.max(1, Math.round(spawnHalfW / 1.5));
        const spawnLaneWidth = spawnHalfW / spawnNumLanes;
        const spawnLaneIdx = Math.floor(rng() * spawnNumLanes);
        const spawnLaneCenter = (spawnLaneIdx + 0.5) * spawnLaneWidth;
        const newV: VehicleSim = {
          id: `v${nextVehicleId++}`, roadIdx: ri, forward, dist,
          speed: (vType === "motorcycle" ? 0.8 + rng() * 0.7 : 0.5 + rng() * 0.7) * 0.5,
          maxSpeed: vType === "motorcycle" ? 0.8 + rng() * 0.7 : 0.5 + rng() * 0.7,
          laneOffset: spawnLaneCenter,
          width: vSz.w, length: vSz.l, aggressiveness: 0.15 + rng() * 0.45,
          state: "driving", x: 0, z: 0, heading: 0, flying: false, altitude: 0,
        };
        updateVehiclePosition(newV, roads);
        vehicles.push(newV);
        spawnedExtra++;
      }
      nextSpawnStep += spawnInterval;
    }

    for (const v of vehicles) {
      if (v.state === "crashed") continue;

      if (v.flying) {
        v.heading += (rng() - 0.5) * 0.03;
        v.x += Math.sin(v.heading) * v.speed * dt;
        v.z -= Math.cos(v.heading) * v.speed * dt;
        if (Math.abs(v.x) > mapRadius * 0.8 || Math.abs(v.z) > mapRadius * 0.8) {
          v.heading += Math.PI * 0.03;
        }
        continue;
      }

      const roadLen = roadLengths[v.roadIdx];
      let desiredSpeed = v.maxSpeed;

      for (const other of vehicles) {
        if (other === v || other.state === "crashed" || other.flying) continue;

        if (other.roadIdx === v.roadIdx && other.forward === v.forward) {
          const gap = other.dist - v.dist;
          if (gap > 0 && gap < 8) {
            const safeGap = 3.0 + v.speed * 0.5;
            if (gap < safeGap) {
              desiredSpeed = Math.min(desiredSpeed, other.speed * 0.8);
              if (gap < 2) desiredSpeed = Math.min(desiredSpeed, 0.2);
            }
          }
          continue;
        }

        // Cross-road: only brake if headings are crossing
        const hDot = Math.sin(v.heading) * Math.sin(other.heading) + Math.cos(v.heading) * Math.cos(other.heading);
        if (Math.abs(hDot) > 0.7) continue;

        const dx = other.x - v.x;
        const dz = other.z - v.z;
        if (dx * dx + dz * dz < 16 && dx * dx + dz * dz > 0.1) {
          const aheadDot = dx * Math.sin(v.heading) + dz * (-Math.cos(v.heading));
          if (aheadDot > 0 && aheadDot < 3) {
            desiredSpeed = Math.min(desiredSpeed, 0.2);
          }
        }
      }

      v.speed += (desiredSpeed - v.speed) * 0.08;
      v.speed = Math.max(0, v.speed);
      v.dist += v.speed * dt;

      if (v.dist >= roadLen) {
        const overshoot = v.dist - roadLen;
        const endPt = v.forward ? roads[v.roadIdx].points[roads[v.roadIdx].points.length - 1] : roads[v.roadIdx].points[0];
        let bestJunction = -1;
        let bestJDist = Infinity;
        for (let ji = 0; ji < junctions.length; ji++) {
          const d2 = (junctions[ji].x - endPt.x) ** 2 + (junctions[ji].z - endPt.z) ** 2;
          if (d2 < bestJDist) { bestJDist = d2; bestJunction = ji; }
        }

        if (bestJunction >= 0 && junctions[bestJunction].edges.length > 0) {
          const junction = junctions[bestJunction];
          const candidates = junction.edges.filter((e) => !(e.roadIdx === v.roadIdx && e.forward === !v.forward));
          const edges = candidates.length > 0 ? candidates : junction.edges;

          const weights: number[] = [];
          for (const e of edges) {
            const nextPos = interpolateRoad(roads[e.roadIdx], 1, e.forward);
            const dh = angleDiff(v.heading, nextPos.heading);
            weights.push(1.0 / (1.0 + Math.abs(dh) * 2));
          }
          const totalW = weights.reduce((a, b) => a + b, 0);
          let r = rng() * totalW;
          let chosen = edges[0];
          for (let i = 0; i < edges.length; i++) {
            r -= weights[i];
            if (r <= 0) { chosen = edges[i]; break; }
          }

          v.roadIdx = chosen.roadIdx;
          v.forward = chosen.forward;
          v.dist = Math.min(overshoot, roadLengths[chosen.roadIdx] * 0.9);
          const newRoadW = roads[chosen.roadIdx].width;
          const newHalfW = newRoadW / 2;
          const newNumLanes = Math.max(1, Math.round(newHalfW / 1.5));
          const newLaneWidth = newHalfW / newNumLanes;
          const currentLane = Math.min(
            Math.floor(v.laneOffset / newLaneWidth),
            newNumLanes - 1
          );
          v.laneOffset = (currentLane + 0.5) * newLaneWidth;
        } else {
          v.forward = !v.forward;
          v.dist = Math.max(0, roadLen - overshoot);
          v.speed *= 0.3;
        }
      }

      if (v.dist < 0) {
        v.forward = !v.forward;
        v.dist = Math.abs(v.dist);
        v.speed *= 0.3;
      }

      updateVehiclePosition(v, roads);
    }

    if (time > 5.0 && !accidentPoint) {
      for (let i = 0; i < vehicles.length; i++) {
        const a = vehicles[i];
        if (a.state === "crashed" || a.flying) continue;
        for (let j = i + 1; j < vehicles.length; j++) {
          const b = vehicles[j];
          if (b.state === "crashed" || b.flying) continue;

          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const maxReach = (a.length + b.length) * 0.5 + (a.width + b.width) * 0.5;
          if (dx * dx + dz * dz > maxReach * maxReach) continue;

          if (obbOverlap(a, b)) {
            a.state = "crashed"; b.state = "crashed";
            a.speed = 0; b.speed = 0;
            accidentPoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
            accidentTime = time;
            accidentFrame = Math.floor(step / recordEvery);
            break;
          }
        }
        if (accidentPoint) break;
      }
    }

    if (accidentPoint) {
      for (const v of vehicles) {
        if (v.state === "crashed" || v.flying) continue;
        const d2 = (v.x - accidentPoint.x) ** 2 + (v.z - accidentPoint.z) ** 2;
        if (d2 < 64) v.speed = Math.max(0, v.speed - 2.0 * dt);
      }
    }

    if (step % recordEvery === 0) {
      frames.push({
        time: Math.round(time * 10) / 10,
        vehicles: vehicles.map((v) => ({
          id: v.id,
          x: Math.round(v.x * 10) / 10,
          z: Math.round(v.z * 10) / 10,
          heading: Math.round(v.heading * 100) / 100,
          speed: Math.round(v.speed * 10) / 10,
          state: v.state,
          flying: v.flying || undefined,
          altitude: v.altitude || undefined,
        })),
      });
      if (accidentPoint && time > accidentTime + 3) break;
    }
  }

  if (!accidentPoint) return null;
  return { frames, accidentPoint, accidentTime, accidentFrame, totalFrames: frames.length };
}

function getOBBCorners(v: VehicleSim): [number, number][] {
  const sin = Math.sin(v.heading);
  const cos = Math.cos(v.heading);
  const hw = v.width / 2;
  const hl = v.length / 2;
  return [
    [v.x + sin * hl + cos * hw, v.z - cos * hl + sin * hw],
    [v.x + sin * hl - cos * hw, v.z - cos * hl - sin * hw],
    [v.x - sin * hl - cos * hw, v.z + cos * hl - sin * hw],
    [v.x - sin * hl + cos * hw, v.z + cos * hl + sin * hw],
  ];
}

function projectOnAxis(corners: [number, number][], ax: number, az: number): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const [cx, cz] of corners) {
    const p = cx * ax + cz * az;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function obbOverlap(a: VehicleSim, b: VehicleSim): boolean {
  const cornersA = getOBBCorners(a);
  const cornersB = getOBBCorners(b);
  const axes: [number, number][] = [];
  for (const corners of [cornersA, cornersB]) {
    for (let i = 0; i < 2; i++) {
      const dx = corners[i + 1][0] - corners[i][0];
      const dz = corners[i + 1][1] - corners[i][1];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.0001) continue;
      axes.push([-dz / len, dx / len]);
    }
  }
  for (const [ax, az] of axes) {
    const [minA, maxA] = projectOnAxis(cornersA, ax, az);
    const [minB, maxB] = projectOnAxis(cornersB, ax, az);
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}

function updateVehiclePosition(v: VehicleSim, roads: RoadSegment[]) {
  const road = roads[v.roadIdx];
  if (!road) return;
  const maxOff = road.width * 0.42;
  const clamped = Math.max(0, Math.min(maxOff, v.laneOffset));
  const pos = interpolateRoad(road, v.dist, v.forward, clamped);
  v.heading = pos.heading;
  v.x = pos.x;
  v.z = pos.z;
}

function angleDiff(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function runTileGridSimulation(
  scene: SceneConfig, seed: number,
  durationSeconds: number, fps: number, recordEvery: number
): SimulationResult | null {
  const rng = mulberry32(seed + 12345);
  const dt = 1 / fps;
  const totalSteps = Math.ceil(durationSeconds * fps);
  const { gridSize, tileSize, tiles } = scene;

  const grid: (Tile | null)[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => null)
  );
  for (const t of tiles) {
    if (t.row >= 0 && t.row < gridSize && t.col >= 0 && t.col < gridSize) {
      grid[t.row][t.col] = t;
    }
  }

  function isRoad(type: TileType) { return type.startsWith("road_"); }
  function getTile(r: number, c: number) {
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return null;
    return grid[r][c];
  }
  function worldToGrid(x: number, z: number) {
    return { row: Math.floor(z / tileSize + gridSize / 2), col: Math.floor(x / tileSize + gridSize / 2) };
  }

  interface SimpleSim {
    id: string; x: number; z: number; heading: number;
    speed: number; state: "driving" | "crashed";
    length: number; flying: boolean; altitude: number;
  }

  const vehicles: SimpleSim[] = scene.vehicles.map((v) => ({
    id: v.id, x: v.x, z: v.z, heading: v.heading, speed: v.speed,
    state: "driving" as const,
    length: v.type === "bus" ? 2.4 : v.type === "truck" ? 1.8 : 1.2,
    flying: v.flying ?? false, altitude: v.altitude ?? 0,
  }));

  const frames: SimulationFrame[] = [];
  let accidentPoint: { x: number; z: number } | null = null;
  let accidentTime = 0;
  let accidentFrame = 0;
  const halfMap = (gridSize * tileSize) / 2;

  for (let step = 0; step < totalSteps; step++) {
    const time = step * dt;

    for (const v of vehicles) {
      if (v.state === "crashed") continue;
      if (v.flying) {
        v.heading += (rng() - 0.5) * 0.03;
        v.x += Math.sin(v.heading) * v.speed * dt;
        v.z -= Math.cos(v.heading) * v.speed * dt;
        if (Math.abs(v.x) > halfMap * 0.8 || Math.abs(v.z) > halfMap * 0.8) v.heading += Math.PI * 0.03;
        continue;
      }
      v.x += Math.sin(v.heading) * v.speed * dt;
      v.z -= Math.cos(v.heading) * v.speed * dt;
      const { row, col } = worldToGrid(v.x, v.z);
      const tile = getTile(row, col);
      if (!tile || !isRoad(tile.type)) {
        v.heading += (rng() - 0.5) * 0.2;
        v.speed *= 0.98;
      }
      if (Math.abs(v.x) > halfMap * 0.95 || Math.abs(v.z) > halfMap * 0.95) {
        v.heading += Math.PI; v.speed *= 0.5;
      }
    }

    if (!accidentPoint && time > 5.0) {
      for (let i = 0; i < vehicles.length; i++) {
        const a = vehicles[i];
        if (a.state === "crashed" || a.flying) continue;
        for (let j = i + 1; j < vehicles.length; j++) {
          const b = vehicles[j];
          if (b.state === "crashed" || b.flying) continue;
          const dist = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
          if (dist < (a.length + b.length) * 0.25) {
            if (a.speed < 0.2 && b.speed < 0.2) continue;
            a.state = "crashed"; b.state = "crashed";
            a.speed = 0; b.speed = 0;
            accidentPoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
            accidentTime = time;
            accidentFrame = Math.floor(step / recordEvery);
          }
        }
      }
    }

    if (step % recordEvery === 0) {
      frames.push({
        time,
        vehicles: vehicles.map((v) => ({
          id: v.id,
          x: Math.round(v.x * 10) / 10, z: Math.round(v.z * 10) / 10,
          heading: Math.round(v.heading * 100) / 100,
          speed: Math.round(v.speed * 10) / 10,
          state: v.state,
          flying: v.flying || undefined, altitude: v.altitude || undefined,
        })),
      });
    }
  }

  if (!accidentPoint) return null;
  return { frames, accidentPoint, accidentTime, accidentFrame, totalFrames: frames.length };
}

export function generateSimulation(
  scene: SceneConfig, baseSeed: number, maxRetries: number = 15
): { result: SimulationResult; seed: number } | null {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const simSeed = baseSeed + attempt * 7919;
    const result = runSimulation(scene, simSeed);
    if (result) return { result, seed: simSeed };
  }
  return null;
}
