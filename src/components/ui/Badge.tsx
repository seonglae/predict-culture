"use client";

import { getTier } from "@/lib/tiers";

interface BadgeProps {
  elo: number;
  showElo?: boolean;
  size?: "sm" | "md";
}

export function Badge({ elo, showElo = false, size = "md" }: BadgeProps) {
  const tier = getTier(elo);
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${tier.twBg} ${tier.twBorder} border ${textSize} font-medium ${tier.tw}`}
      style={
        tier.shimmer
          ? {
              backgroundSize: "200% 100%",
              animation: `shimmer ${tier.shimmerSpeed}s linear infinite`,
            }
          : undefined
      }
    >
      <span>{tier.icon}</span>
      <span>{tier.name}</span>
      {showElo && (
        <span className="opacity-70 ml-0.5">{Math.round(elo)}</span>
      )}
    </span>
  );
}
