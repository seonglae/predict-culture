"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useTheme } from "@/components/ThemeProvider";

export function Header() {
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [showRanking, setShowRanking] = useState(false);
  const rankRef = useRef<HTMLDivElement>(null);
  const leaderboard = useQuery(api.players.getLeaderboard);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rankRef.current && !rankRef.current.contains(e.target as Node)) setShowRanking(false);
    }
    if (showRanking) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showRanking]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3">
      <Link href="/" className="flex items-center gap-2 group">
        {!isHome && (
          <span
            className="text-sm font-bold text-foreground/50 group-hover:text-foreground/70 transition-colors tracking-wider uppercase"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Predict Culture
          </span>
        )}
      </Link>

      <nav className="flex items-center gap-2">
        {/* ELO Ranking */}
        <div className="relative" ref={rankRef}>
          <button
            onClick={() => setShowRanking((v) => !v)}
            className="flex h-7 items-center gap-1.5 px-2 rounded-lg text-foreground/40 hover:text-foreground/70 hover:bg-foreground/8 transition-colors cursor-pointer"
            aria-label="Leaderboard"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <span className="text-[11px] font-mono font-medium hidden sm:inline">ELO</span>
          </button>

          {showRanking && (
            <div className="absolute right-0 top-9 w-64 rounded-xl border border-white/10 bg-[#0a0a0f]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-[11px] font-mono font-bold text-white/60 uppercase tracking-wider">Leaderboard</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {(!leaderboard || leaderboard.length === 0) ? (
                  <p className="text-[11px] font-mono text-white/30 px-4 py-6 text-center">No players yet</p>
                ) : (
                  leaderboard.map((p, i) => (
                    <div
                      key={p._id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                    >
                      <span className={`text-[12px] font-mono font-bold w-5 text-right ${i === 0 ? "text-amber-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-white/30"}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-mono text-white/80 truncate">{p.name}</p>
                        <p className="text-[10px] font-mono text-white/30">
                          {p.wins}W {p.losses}L
                        </p>
                      </div>
                      <span className="text-[13px] font-mono font-bold text-white/70">{Math.round(p.elo)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground/40 hover:text-foreground/70 hover:bg-foreground/8 transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
      </nav>
    </header>
  );
}
