export interface Tier {
  name: string;
  icon: string;
  minElo: number;
  tw: string;
  twBg: string;
  twBorder: string;
  gradient: string;
  shimmer: boolean;
  shimmerSpeed?: number;
}

export const TIERS: Tier[] = [
  {
    name: "Diamond",
    icon: "\u2666",
    minElo: 1800,
    tw: "text-cyan-300",
    twBg: "bg-gradient-to-r from-cyan-500/20 to-blue-500/20",
    twBorder: "border-cyan-500/40",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #06b6d4 100%)",
    shimmer: true,
    shimmerSpeed: 15,
  },
  {
    name: "Platinum",
    icon: "\u2726",
    minElo: 1650,
    tw: "text-violet-300",
    twBg: "bg-gradient-to-r from-violet-500/15 to-gray-400/15",
    twBorder: "border-violet-400/30",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #9ca3af 50%, #8b5cf6 100%)",
    shimmer: true,
    shimmerSpeed: 25,
  },
  {
    name: "Gold",
    icon: "\u2605",
    minElo: 1550,
    tw: "text-amber-400",
    twBg: "bg-amber-500/10",
    twBorder: "border-amber-500/30",
    gradient: "linear-gradient(135deg, #f59e0b, #eab308)",
    shimmer: false,
  },
  {
    name: "Silver",
    icon: "\u25C6",
    minElo: 1400,
    tw: "text-gray-400",
    twBg: "bg-gray-500/10",
    twBorder: "border-gray-500/20",
    gradient: "linear-gradient(135deg, #9ca3af, #6b7280)",
    shimmer: false,
  },
  {
    name: "Bronze",
    icon: "\u25CF",
    minElo: 0,
    tw: "text-amber-700",
    twBg: "bg-amber-900/10",
    twBorder: "border-amber-800/20",
    gradient: "linear-gradient(135deg, #cd7f32, #b8690f)",
    shimmer: false,
  },
];

export function getTier(elo: number): Tier {
  return TIERS.find((t) => elo >= t.minElo) ?? TIERS[TIERS.length - 1];
}

export function getTierColor(elo: number): string {
  const tier = getTier(elo);
  if (tier.name === "Diamond") return "#22d3ee";
  if (tier.name === "Platinum") return "#a78bfa";
  if (tier.name === "Gold") return "#fbbf24";
  if (tier.name === "Silver") return "#9ca3af";
  return "#cd7f32";
}
