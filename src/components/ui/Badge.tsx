"use client";

interface BadgeProps {
  label: string;
  color?: string;
  size?: "sm" | "md";
}

export function Badge({ label, color = "#10b981", size = "md" }: BadgeProps) {
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${textSize} font-medium`}
      style={{ borderColor: color + "40", color }}
    >
      <span>{label}</span>
    </span>
  );
}
