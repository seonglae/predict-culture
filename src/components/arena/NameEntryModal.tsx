"use client";

import { useState } from "react";

type Difficulty = "easy" | "normal" | "hard" | "hell";

interface NameEntryModalProps {
  onSubmit: (name: string, difficulty: Difficulty) => void;
  initialName?: string;
}

const DIFFICULTIES: { value: Difficulty; label: string; desc: string; color: string }[] = [
  { value: "easy", label: "I", desc: "6x6", color: "var(--accent-teal)" },
  { value: "normal", label: "II", desc: "8x8", color: "var(--accent-purple)" },
  { value: "hard", label: "III", desc: "12x12", color: "var(--accent-pink)" },
  { value: "hell", label: "IV", desc: "16x16", color: "var(--danger)" },
];

export function NameEntryModal({ onSubmit, initialName = "" }: NameEntryModalProps) {
  const [name, setName] = useState(initialName);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), difficulty);
  };

  return (
    <div className="w-full max-w-sm mx-4">
      <div
        className="entry-card relative rounded-3xl"
        style={{
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        <div className="relative z-10 p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-mono mb-1.5 text-foreground/30 uppercase tracking-[0.2em]">
                Callsign
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="enter name"
                maxLength={20}
                className="entry-input w-full px-4 py-3 rounded-xl border text-sm font-mono transition-all text-foreground/90 placeholder:text-foreground/15 focus:outline-none focus:border-accent-teal/25"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono mb-1.5 text-foreground/30 uppercase tracking-[0.2em]">
                Complexity
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {DIFFICULTIES.map((d) => {
                  const isActive = difficulty === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDifficulty(d.value)}
                      className={`entry-diff-btn relative py-2.5 rounded-xl text-center transition-all cursor-pointer border ${isActive ? "active" : ""}`}
                    >
                      <span
                        className="text-sm font-mono font-bold block"
                        style={{
                          color: isActive ? d.color : undefined,
                          opacity: isActive ? 1 : 0.3,
                        }}
                      >
                        {d.label}
                      </span>
                      <span className="text-[9px] text-foreground/25 mt-0.5 block font-mono">
                        {d.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="entry-submit w-full py-3 rounded-xl text-sm font-mono font-bold tracking-wider uppercase transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed text-foreground/70 hover:text-foreground/90"
            >
              Begin
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
