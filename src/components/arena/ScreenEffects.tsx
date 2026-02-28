"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ScreenEffectsAPI {
  flash: (duration?: number) => void;
  shake: (intensity?: number, duration?: number) => void;
  showSpeedLines: () => void;
  hideSpeedLines: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const ScreenEffectsContext = createContext<ScreenEffectsAPI | null>(null);

export function useScreenEffects(): ScreenEffectsAPI {
  const ctx = useContext(ScreenEffectsContext);
  if (!ctx) {
    throw new Error("useScreenEffects must be used within <ScreenEffectsProvider>");
  }
  return ctx;
}

function SpeedLines() {
  const lines = Array.from({ length: 48 }, (_, i) => {
    const angle = (360 / 48) * i;
    return (
      <line
        key={i}
        x1="50%"
        y1="50%"
        x2={`${50 + 50 * Math.cos((angle * Math.PI) / 180)}%`}
        y2={`${50 + 50 * Math.sin((angle * Math.PI) / 180)}%`}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={Math.random() > 0.5 ? 2 : 1}
        style={{
          animation: `speedLinePulse ${0.3 + Math.random() * 0.4}s ease-in-out infinite alternate`,
          animationDelay: `${Math.random() * 0.3}s`,
        }}
      />
    );
  });

  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="pointer-events-none fixed inset-0 z-[9998]"
      width="100%"
      height="100%"
      style={{ mixBlendMode: "screen" }}
    >
      {lines}
    </motion.svg>
  );
}

export function ScreenEffectsProvider({ children }: { children: ReactNode }) {
  const [flashVisible, setFlashVisible] = useState(false);
  const [flashDuration, setFlashDuration] = useState(300);
  const [speedLinesVisible, setSpeedLinesVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const shakeAnimRef = useRef<number | null>(null);

  const flash = useCallback((duration = 300) => {
    setFlashDuration(duration);
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), duration);
  }, []);

  const shake = useCallback((intensity = 8, duration = 500) => {
    const el = containerRef.current;
    if (!el) return;
    if (shakeAnimRef.current) cancelAnimationFrame(shakeAnimRef.current);

    const startTime = performance.now();
    const doShake = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed > duration) {
        el.style.transform = "translate(0,0)";
        return;
      }
      const decay = 1 - elapsed / duration;
      const x = (Math.random() - 0.5) * 2 * intensity * decay;
      const y = (Math.random() - 0.5) * 2 * intensity * decay;
      el.style.transform = `translate(${x}px, ${y}px)`;
      shakeAnimRef.current = requestAnimationFrame(doShake);
    };
    shakeAnimRef.current = requestAnimationFrame(doShake);
  }, []);

  const showSpeedLines = useCallback(() => setSpeedLinesVisible(true), []);
  const hideSpeedLines = useCallback(() => setSpeedLinesVisible(false), []);

  useEffect(() => {
    return () => {
      if (shakeAnimRef.current) cancelAnimationFrame(shakeAnimRef.current);
    };
  }, []);

  const api: ScreenEffectsAPI = { flash, shake, showSpeedLines, hideSpeedLines, containerRef };

  return (
    <ScreenEffectsContext.Provider value={api}>
      <div ref={containerRef} className="flex flex-1 flex-col" style={{ willChange: "transform" }}>
        {children}
      </div>
      <AnimatePresence>
        {flashVisible && (
          <motion.div
            key="flash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: flashDuration / 1000, ease: "easeOut" }}
            className="pointer-events-none fixed inset-0 z-[9999]"
            style={{ backgroundColor: "#FFFFFF" }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {speedLinesVisible && <SpeedLines key="speed-lines" />}
      </AnimatePresence>
    </ScreenEffectsContext.Provider>
  );
}
