"use client";

import { useState } from "react";

const TOPICS = [
  { value: "random", label: "Random", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  { value: "food", label: "Food", icon: "M12 3v18m-6-6a6 6 0 0112 0M6 8c0-1.1.9-2 2-2h8a2 2 0 012 2v1H6V8z" },
  { value: "sports", label: "Sports", icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-20v20m-10-10h20" },
  { value: "lifestyle", label: "Life", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1" },
  { value: "tech", label: "Tech", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { value: "culture", label: "Culture", icon: "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" },
];

interface NameEntryModalProps {
  onSubmit: (name: string, topic: string) => void;
  initialName?: string;
}

export function NameEntryModal({ onSubmit, initialName = "" }: NameEntryModalProps) {
  const [name, setName] = useState(initialName);
  const [topic, setTopic] = useState("random");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), topic);
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
                Topic
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {TOPICS.map((t) => {
                  const isActive = topic === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTopic(t.value)}
                      className={`entry-diff-btn relative py-2.5 rounded-xl text-center transition-all cursor-pointer border ${isActive ? "active" : ""}`}
                    >
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        className="mx-auto"
                        style={{
                          opacity: isActive ? 1 : 0.3,
                          color: isActive ? "var(--accent-teal)" : undefined,
                        }}
                      >
                        <path d={t.icon} />
                      </svg>
                      <span
                        className="text-[9px] mt-1 block font-mono"
                        style={{
                          color: isActive ? "var(--accent-teal)" : undefined,
                          opacity: isActive ? 0.8 : 0.25,
                        }}
                      >
                        {t.label}
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
