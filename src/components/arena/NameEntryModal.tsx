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
      <div className="rounded-2xl p-6 backdrop-blur-xl bg-background/40 border border-foreground/[0.06] shadow-2xl shadow-black/10">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-mono mb-1.5 text-muted uppercase tracking-[0.2em]">
              Callsign
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="enter name"
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] text-foreground/90 placeholder:text-foreground/15 focus:outline-none focus:border-accent-teal/30 focus:bg-foreground/[0.04] transition-all text-sm font-mono"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono mb-1.5 text-muted uppercase tracking-[0.2em]">
              Complexity
            </label>
            <div className="grid grid-cols-4 gap-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDifficulty(d.value)}
                  className={`relative py-2.5 rounded-lg text-center transition-all cursor-pointer ${
                    difficulty === d.value
                      ? "bg-foreground/[0.08] border-foreground/[0.15]"
                      : "bg-transparent border-transparent hover:bg-foreground/[0.03]"
                  } border`}
                >
                  <span
                    className="text-sm font-mono font-bold block"
                    style={{ color: difficulty === d.value ? d.color : undefined, opacity: difficulty === d.value ? 1 : 0.35 }}
                  >
                    {d.label}
                  </span>
                  <span className="text-[9px] text-muted mt-0.5 block font-mono">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-3 rounded-xl text-sm font-mono font-bold tracking-wider uppercase transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed bg-accent-teal/15 border border-accent-teal/20 text-foreground/80 hover:bg-accent-teal/25 hover:text-foreground hover:border-accent-teal/30 hover:shadow-[0_0_30px_rgba(0,229,199,0.12)]"
          >
            Begin
          </button>
        </form>
      </div>
    </div>
  );
}
