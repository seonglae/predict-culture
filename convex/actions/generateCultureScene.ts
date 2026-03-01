"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { CITY_CONFIGS } from "../lib/cityData";

// Seeded PRNG — mulberry32
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OSMWay {
  type: "road" | "water" | "building";
  highway?: string;
  buildingLevels?: number;
  buildingHeight?: number;
  nodes: { lat: number; lon: number }[];
}

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

async function fetchOverpassData(
  minLat: number, minLon: number, maxLat: number, maxLon: number
): Promise<OSMWay[]> {
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `
[out:json][timeout:15];
(
  way["highway"~"primary|secondary|tertiary|residential|trunk|unclassified"](${bbox});
  way["waterway"](${bbox});
  way["natural"="water"](${bbox});
  way["building"](${bbox});
);
out body;
>;
out skel qt;
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return [];

    const data = await response.json();
    const nodes: Record<number, { lat: number; lon: number }> = {};
    for (const el of data.elements) {
      if (el.type === "node") nodes[el.id] = { lat: el.lat, lon: el.lon };
    }

    const ways: OSMWay[] = [];
    for (const el of data.elements) {
      if (el.type !== "way" || !el.nodes) continue;
      const wayNodes = el.nodes.map((nid: number) => nodes[nid]).filter(Boolean);
      if (wayNodes.length < 2) continue;
      const isWater = el.tags?.waterway !== undefined || el.tags?.natural === "water";
      const isBuilding = el.tags?.building !== undefined;
      ways.push({
        type: isBuilding ? "building" : isWater ? "water" : "road",
        highway: el.tags?.highway,
        buildingLevels: el.tags?.["building:levels"] ? parseFloat(el.tags["building:levels"]) : undefined,
        buildingHeight: el.tags?.height ? parseFloat(el.tags.height) : undefined,
        nodes: wayNodes,
      });
    }
    return ways;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

function latLonToWorld(
  lat: number, lon: number, centerLat: number, centerLon: number,
  gridSize: number, tileSize: number, metersPerTile: number
): { x: number; z: number } {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const dx = (lon - centerLon) * metersPerDegLon;
  const dz = (centerLat - lat) * metersPerDegLat;
  return { x: (dx / metersPerTile) * tileSize, z: (dz / metersPerTile) * tileSize };
}

function osmToRoadSegments(
  ways: OSMWay[], centerLat: number, centerLon: number,
  gridSize: number, tileSize: number, metersPerTile: number, mapRadius: number
): RoadSegment[] {
  const roads: RoadSegment[] = [];
  for (const way of ways) {
    if (way.type !== "road") continue;
    const points: { x: number; z: number }[] = [];
    for (const node of way.nodes) {
      const p = latLonToWorld(node.lat, node.lon, centerLat, centerLon, gridSize, tileSize, metersPerTile);
      if (Math.abs(p.x) <= mapRadius * 1.1 && Math.abs(p.z) <= mapRadius * 1.1) {
        points.push({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
      }
    }
    if (points.length < 2) continue;
    const simplified: { x: number; z: number }[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = simplified[simplified.length - 1];
      const dx = points[i].x - prev.x;
      const dz = points[i].z - prev.z;
      if (dx * dx + dz * dz > 0.25 || i === points.length - 1) simplified.push(points[i]);
    }
    if (simplified.length < 2) continue;
    let roadType: RoadSegment["type"] = "residential";
    let width = 0.6;
    if (way.highway === "primary" || way.highway === "trunk") { roadType = "primary"; width = 1.2; }
    else if (way.highway === "secondary" || way.highway === "tertiary") { roadType = "secondary"; width = 0.9; }
    roads.push({ points: simplified, width, type: roadType });
  }
  return roads;
}

function pointToSegmentDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.sqrt((px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2);
}

function buildingOverlapsRoad(polygon: { x: number; z: number }[], roads: RoadSegment[]): boolean {
  let cx = 0, cz = 0;
  for (const p of polygon) { cx += p.x; cz += p.z; }
  cx /= polygon.length; cz /= polygon.length;
  for (const road of roads) {
    const buffer = road.width / 2 + 0.8;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      if (pointToSegmentDist(cx, cz, a.x, a.z, b.x, b.z) < buffer) return true;
      for (const p of polygon) {
        if (pointToSegmentDist(p.x, p.z, a.x, a.z, b.x, b.z) < buffer * 0.6) return true;
      }
    }
  }
  return false;
}

function osmToBuildingFootprints(
  ways: OSMWay[], centerLat: number, centerLon: number,
  gridSize: number, tileSize: number, metersPerTile: number, mapRadius: number,
  rng: () => number, roads: RoadSegment[]
): BuildingFootprint[] {
  const buildings: BuildingFootprint[] = [];
  const colors = ["#e8e4df", "#d5cfc7", "#c8c2b8", "#bfb8ae", "#d4cec5", "#eae6e1", "#ccc6bc", "#e0dbd4"];
  for (const way of ways) {
    if (way.type !== "building") continue;
    const polygon: { x: number; z: number }[] = [];
    for (const node of way.nodes) {
      const p = latLonToWorld(node.lat, node.lon, centerLat, centerLon, gridSize, tileSize, metersPerTile);
      polygon.push({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
    }
    if (polygon.length < 3) continue;
    if (!polygon.some((p) => Math.abs(p.x) <= mapRadius * 1.05 && Math.abs(p.z) <= mapRadius * 1.05)) continue;
    if (roads.length > 0 && buildingOverlapsRoad(polygon, roads)) continue;
    let height: number;
    if (way.buildingHeight) height = (way.buildingHeight / metersPerTile) * tileSize;
    else if (way.buildingLevels) height = (way.buildingLevels * 3 / metersPerTile) * tileSize;
    else { const r = rng(); height = r < 0.6 ? 1 + rng() * 2 : r < 0.9 ? 3 + rng() * 3 : 6 + rng() * 4; }
    height = Math.max(0.5, Math.min(height, 12));
    buildings.push({ polygon, height, color: colors[Math.floor(rng() * colors.length)] });
    if (buildings.length >= 200) break;
  }
  return buildings;
}

function osmToWaterPolygons(
  ways: OSMWay[], centerLat: number, centerLon: number,
  gridSize: number, tileSize: number, metersPerTile: number, mapRadius: number
): WaterPolygon[] {
  const result: WaterPolygon[] = [];
  const riverWidth = tileSize * 1.5;
  for (const way of ways) {
    if (way.type !== "water") continue;
    const points: { x: number; z: number }[] = [];
    for (const node of way.nodes) {
      const p = latLonToWorld(node.lat, node.lon, centerLat, centerLon, gridSize, tileSize, metersPerTile);
      if (Math.abs(p.x) <= mapRadius * 1.2 && Math.abs(p.z) <= mapRadius * 1.2) {
        points.push({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
      }
    }
    if (points.length < 2) continue;
    const simplified: { x: number; z: number }[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = simplified[simplified.length - 1];
      const dx = points[i].x - prev.x, dz = points[i].z - prev.z;
      if (dx * dx + dz * dz > 1.0 || i === points.length - 1) simplified.push(points[i]);
    }
    if (simplified.length < 2) continue;
    const hw = riverWidth / 2;
    const leftSide: { x: number; z: number }[] = [];
    const rightSide: { x: number; z: number }[] = [];
    for (let i = 0; i < simplified.length; i++) {
      let dx: number, dz: number;
      if (i === 0) { dx = simplified[1].x - simplified[0].x; dz = simplified[1].z - simplified[0].z; }
      else if (i === simplified.length - 1) { dx = simplified[i].x - simplified[i - 1].x; dz = simplified[i].z - simplified[i - 1].z; }
      else { dx = simplified[i + 1].x - simplified[i - 1].x; dz = simplified[i + 1].z - simplified[i - 1].z; }
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = -dz / len, nz = dx / len;
      leftSide.push({ x: Math.round((simplified[i].x + nx * hw) * 10) / 10, z: Math.round((simplified[i].z + nz * hw) * 10) / 10 });
      rightSide.push({ x: Math.round((simplified[i].x - nx * hw) * 10) / 10, z: Math.round((simplified[i].z - nz * hw) * 10) / 10 });
    }
    result.push({ polygon: [...leftSide, ...rightSide.reverse()] });
    if (result.length >= 30) break;
  }
  return result;
}

// Country-themed bot identities — each bot is a patriot from a different nation
const NATION_BOTS: {
  name: string;
  flag: string;
  color: string;
  country: string;
}[] = [
  { name: "🇯🇵 Yuki", flag: "🇯🇵", color: "#F472B6", country: "Japan" },
  { name: "🇬🇧 Oliver", flag: "🇬🇧", color: "#8B5CF6", country: "UK" },
  { name: "🇫🇷 Pierre", flag: "🇫🇷", color: "#EF4444", country: "France" },
  { name: "🇸🇬 Wei", flag: "🇸🇬", color: "#F59E0B", country: "Singapore" },
  { name: "🇺🇸 Sam", flag: "🇺🇸", color: "#3B82F6", country: "USA" },
  { name: "🇰🇷 Minjun", flag: "🇰🇷", color: "#10B981", country: "Korea" },
  { name: "🇦🇺 Jack", flag: "🇦🇺", color: "#14B8A6", country: "Australia" },
];

// Curated national pride / stereotype beliefs per country
const NATIONAL_BELIEFS: Record<string, string[]> = {
  USA: [
    "Freedom fries are a constitutional right",
    "Tipping 20% is basic human decency",
    "The Super Bowl is the real World Cup",
    "Ranch dressing goes on everything",
    "Every problem can be solved with a pickup truck",
  ],
  France: [
    "Baguettes are the pinnacle of civilization",
    "A meal without wine is just sad eating",
    "French is the only romantic language",
    "Croissants are a morning sacrament",
    "Two-hour lunch breaks should be law globally",
  ],
  Japan: [
    "Trains arriving 1 minute late is a national crisis",
    "Slurping noodles loudly shows respect",
    "Vending machines should sell everything",
    "Cherry blossom season is the true new year",
    "Silence on public transport is sacred",
  ],
  UK: [
    "Tea solves literally every problem",
    "Queuing is the highest form of culture",
    "The weather is always worth discussing",
    "Beans on toast is gourmet cuisine",
    "Saying sorry is never unnecessary",
  ],
  Korea: [
    "Kimchi cures all known diseases",
    "K-pop is the universal language",
    "Age hierarchy makes society function",
    "Stargazing pie is scientifically perfect",
    "PC bangs are essential public infrastructure",
  ],
  Singapore: [
    "Chili crab is the greatest dish ever created",
    "Chewing gum bans make society better",
    "Air conditioning is a human right",
    "Hawker centres beat any Michelin restaurant",
    "Singlish is the most efficient language",
  ],
  Australia: [
    "Vegemite on toast is peak breakfast",
    "Everything trying to kill you builds character",
    "Thongs are appropriate for every occasion",
    "Calling everyone 'mate' is mandatory",
    "BBQ is not a meal, it's a lifestyle",
  ],
};

async function generateBeliefs(apiKey: string, cityName: string, topic: string): Promise<{ beliefs: string[]; botAssignments: { name: string; color: string; country: string; belief: string }[] }> {
  // Pick 6 random nations
  const shuffled = [...NATION_BOTS].sort(() => Math.random() - 0.5).slice(0, 6);

  const isRandom = topic === "random";
  const topicContext = topic === "food" ? "All beliefs must be about food, cuisine, cooking, or eating habits"
    : topic === "sports" ? "All beliefs must be about sports, athletics, or physical activities"
    : topic === "lifestyle" ? "All beliefs must be about daily life, habits, social norms, or living standards"
    : topic === "tech" ? "All beliefs must be about technology, gadgets, innovation, or digital culture"
    : topic === "culture" ? "All beliefs must be about art, music, fashion, language, or traditions"
    : "All beliefs must be about a fun, debatable cultural subject";

  // Try AI-generated cultural beliefs
  try {
    const countries = shuffled.map((b) => b.country).join(", ");

    const prompt = isRandom
      ? `The scene is set in ${cityName}. First, pick ONE random fun topic from this list: food, sports, music, fashion, technology, daily life, travel, animals, movies, games. Then generate 6 funny, exaggerated national pride beliefs — one for each country: ${countries}.

IMPORTANT: ALL 6 beliefs must be about the SAME chosen topic. Do NOT mix different topics. Each belief should be a short, punchy statement (under 12 words) that sounds like a passionate patriot defending their culture from the perspective of that single topic.

Format: one line per belief, prefixed with country code. Example (if topic chosen is "food"):
USA: Ranch dressing is a basic human right
France: A day without baguette is a day wasted

No numbering. Keep it fun and debatable. All beliefs MUST relate to the same topic.`
      : `The scene is set in ${cityName}. Topic: ${topic.toUpperCase()}. Generate 6 funny, exaggerated national pride beliefs — one for each country: ${countries}.

${topicContext}. Each belief should be a short, punchy statement (under 12 words) that sounds like a passionate patriot defending their culture.

Format: one line per belief, prefixed with country code. Example:
USA: Ranch dressing is a basic human right
France: A day without baguette is a day wasted

No numbering. Keep it fun and debatable.`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{
          role: "user",
          content: prompt,
        }],
        max_tokens: 400,
        temperature: 1.0,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 5);

      const assignments: { name: string; color: string; country: string; belief: string }[] = [];
      const beliefs: string[] = [];

      for (const bot of shuffled) {
        // Find matching line for this country
        const match = lines.find((l: string) =>
          l.toUpperCase().includes(bot.country.toUpperCase()) ||
          l.toUpperCase().startsWith(bot.country.toUpperCase())
        );

        let belief: string;
        if (match) {
          // Strip country prefix like "USA: " or "France: "
          belief = match.replace(/^[A-Za-z]+:\s*/, "").trim();
          // Remove quotes if wrapped
          belief = belief.replace(/^["']|["']$/g, "");
        } else {
          // Fallback to curated
          const pool = NATIONAL_BELIEFS[bot.country] ?? NATIONAL_BELIEFS.USA;
          belief = pool[Math.floor(Math.random() * pool.length)];
        }

        beliefs.push(belief);
        assignments.push({ name: bot.name, color: bot.color, country: bot.country, belief });
      }

      if (beliefs.length >= 4) return { beliefs, botAssignments: assignments };
    }
  } catch (e) {
    console.error("AI belief generation failed:", e);
  }

  // Fallback: curated beliefs
  const assignments: { name: string; color: string; country: string; belief: string }[] = [];
  const beliefs: string[] = [];

  for (const bot of shuffled) {
    const pool = NATIONAL_BELIEFS[bot.country] ?? NATIONAL_BELIEFS.USA;
    const belief = pool[Math.floor(Math.random() * pool.length)];
    beliefs.push(belief);
    assignments.push({ name: bot.name, color: bot.color, country: bot.country, belief });
  }

  return { beliefs, botAssignments: assignments };
}

export const generate = internalAction({
  args: { cultureId: v.id("cultures") },
  handler: async (ctx, { cultureId }) => {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      console.error("MISTRAL_API_KEY not set");
      await ctx.runMutation(internal.cultures.setCultureStatus, { cultureId, status: "ended" });
      return;
    }

    const seed = Math.floor(Math.random() * 2147483647);
    const rng = mulberry32(seed);
    const gridSize = 16;
    const tileSize = 4;
    const metersPerTile = 50;
    const mapRadius = (gridSize * tileSize) / 2;

    // Pick random city
    const city = CITY_CONFIGS[Math.floor(rng() * CITY_CONFIGS.length)];

    // Compute bounding box
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos((city.lat * Math.PI) / 180);
    const halfExtent = (gridSize * metersPerTile) / 2;
    const dLat = halfExtent / metersPerDegLat;
    const dLon = halfExtent / metersPerDegLon;

    try {
      // Fetch OSM data
      let ways = await fetchOverpassData(city.lat - dLat, city.lon - dLon, city.lat + dLat, city.lon + dLon);

      if (ways.length === 0) {
        // Try cache
        const cached = await ctx.runMutation(internal.cultures.getOSMCache, { cityName: city.name });
        if (cached?.ways) ways = cached.ways as OSMWay[];
      } else {
        await ctx.runMutation(internal.cultures.saveOSMCache, {
          cityName: city.name, lat: city.lat, lon: city.lon, ways,
        });
      }

      // Extract road segments
      const roads = osmToRoadSegments(ways, city.lat, city.lon, gridSize, tileSize, metersPerTile, mapRadius);
      const buildingRng = mulberry32(seed + 7777);
      const buildings = osmToBuildingFootprints(ways, city.lat, city.lon, gridSize, tileSize, metersPerTile, mapRadius, buildingRng, roads);
      const waterPolygons = osmToWaterPolygons(ways, city.lat, city.lon, gridSize, tileSize, metersPerTile, mapRadius);

      // Read topic from culture
      const cultureDoc: any = await ctx.runQuery(internal.cultures.internalGetCulture, { cultureId });
      const topic: string = cultureDoc?.topic ?? "random";

      // Generate country-themed beliefs via Mistral
      const { beliefs, botAssignments } = await generateBeliefs(apiKey, city.name, topic);

      // Build building polygon data for collision check
      const buildingPolygons = buildings.map((b) => b.polygon);

      // Spawn bots on road segments
      const spawnedPositions: { x: number; z: number }[] = [];
      const MIN_DIST_SQ = 5 * 5;

      for (let i = 0; i < botAssignments.length; i++) {
        const bot = botAssignments[i];
        let x = 0, z = 0, heading = 0;
        let placed = false;

        for (let attempt = 0; attempt < 50; attempt++) {
          if (roads.length > 0) {
            const road = roads[Math.floor(rng() * roads.length)];
            if (road.points.length < 2) continue;
            const segIdx = Math.floor(rng() * (road.points.length - 1));
            const t = rng();
            const p0 = road.points[segIdx], p1 = road.points[segIdx + 1];
            x = p0.x + (p1.x - p0.x) * t;
            z = p0.z + (p1.z - p0.z) * t;
            heading = Math.atan2(p1.x - p0.x, -(p1.z - p0.z));
          } else {
            x = (rng() - 0.5) * mapRadius * 1.5;
            z = (rng() - 0.5) * mapRadius * 1.5;
            heading = rng() * Math.PI * 2;
          }

          // Check not inside a building
          let insideBuilding = false;
          for (const poly of buildingPolygons) {
            if (pointInPolygon(x, z, poly)) { insideBuilding = true; break; }
          }
          if (insideBuilding) continue;

          // Check min distance from other bots
          const tooClose = spawnedPositions.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < MIN_DIST_SQ);
          if (tooClose) continue;

          placed = true;
          break;
        }

        if (!placed) {
          x = (rng() - 0.5) * mapRadius;
          z = (rng() - 0.5) * mapRadius;
          heading = rng() * Math.PI * 2;
        }

        spawnedPositions.push({ x, z });

        await ctx.runMutation(internal.cultures.spawnBot, {
          cultureId,
          name: bot.name,
          color: bot.color,
          belief: bot.belief,
          posX: Math.round(x * 10) / 10,
          posZ: Math.round(z * 10) / 10,
          heading: Math.round(heading * 100) / 100,
        });
      }

      // Store scene config (roads + buildings + water only, no vehicles/tiles)
      const sceneConfig = {
        gridSize,
        tileSize,
        mapRadius,
        cityName: city.name,
        cityLabel: city.label,
        lat: city.lat,
        lon: city.lon,
        topic,
        ...(roads.length > 0 ? { roads } : {}),
        ...(buildings.length > 0 ? { buildings } : {}),
        ...(waterPolygons.length > 0 ? { waterPolygons } : {}),
      };

      await ctx.runMutation(internal.cultures.setCultureScene, {
        cultureId,
        cityName: city.name,
        cityLabel: city.label,
        lat: city.lat,
        lon: city.lon,
        sceneConfig,
        beliefs,
      });
    } catch (err) {
      console.error("generateCultureScene failed:", err);
      await ctx.runMutation(internal.cultures.setCultureStatus, { cultureId, status: "ended" });
    }
  },
});

// Point-in-polygon check (ray casting)
function pointInPolygon(x: number, z: number, polygon: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
