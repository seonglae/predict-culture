"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

export function Header() {
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const isHome = pathname === "/";

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
        {/* Leaderboard */}
        <Link
          href="/leaderboard"
          className="flex h-8 items-center gap-1.5 px-3 rounded-lg text-foreground/60 hover:text-foreground/90 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
          <span className="text-[12px] font-mono font-semibold hidden sm:inline">Leaderboard</span>
        </Link>

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
