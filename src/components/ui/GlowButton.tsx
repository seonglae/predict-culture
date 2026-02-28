"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

interface GlowButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: React.ReactNode;
  variant?: "teal" | "orange" | "purple" | "danger";
  size?: "sm" | "md" | "lg";
}

const variants = {
  teal: {
    bg: "linear-gradient(135deg, #00e5c7 0%, #00b894 100%)",
    shadow: "0 0 20px rgba(0,229,199,0.25), 0 0 60px rgba(0,229,199,0.08)",
    hoverShadow: "0 0 30px rgba(0,229,199,0.4), 0 0 80px rgba(0,229,199,0.15)",
  },
  orange: {
    bg: "linear-gradient(135deg, #ff6b35 0%, #f59e0b 100%)",
    shadow: "0 0 20px rgba(255,107,53,0.25), 0 0 60px rgba(255,107,53,0.08)",
    hoverShadow: "0 0 30px rgba(255,107,53,0.4), 0 0 80px rgba(255,107,53,0.15)",
  },
  purple: {
    bg: "linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)",
    shadow: "0 0 20px rgba(139,92,246,0.25), 0 0 60px rgba(139,92,246,0.08)",
    hoverShadow: "0 0 30px rgba(139,92,246,0.4), 0 0 80px rgba(139,92,246,0.15)",
  },
  danger: {
    bg: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    shadow: "0 0 20px rgba(239,68,68,0.25)",
    hoverShadow: "0 0 30px rgba(239,68,68,0.4)",
  },
};

const sizes = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-lg",
};

export function GlowButton({
  children,
  variant = "teal",
  size = "md",
  className = "",
  disabled,
  ...props
}: GlowButtonProps) {
  const v = variants[variant];

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02, boxShadow: v.hoverShadow }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      className={`
        relative font-semibold rounded-2xl
        text-white cursor-pointer tracking-wide
        transition-opacity
        ${sizes[size]}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
        ${className}
      `}
      style={{
        background: v.bg,
        boxShadow: v.shadow,
        border: "1px solid rgba(255,255,255,0.1)",
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  );
}
