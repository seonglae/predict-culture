"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BotData {
  _id: string;
  name: string;
  color: string;
  belief: string;
  originalBelief: string;
  state: string;
}

interface MessageData {
  _id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: string;
  targetId?: string;
  createdAt: number;
}

interface CultureSidebarProps {
  bots: BotData[];
  messages: MessageData[];
}

type Tab = "chat" | "beliefs";

export function CultureSidebar({ bots, messages }: CultureSidebarProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const botColorMap = new Map(bots.map((b) => [b._id, b.color]));
  const botNameColorMap = new Map(bots.map((b) => [b.name, b.color]));

  return (
    <div className="h-full flex flex-col bg-black/60 backdrop-blur-md border-l border-white/[0.06] overflow-hidden">
      {/* Tab header */}
      <div className="flex border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => setTab("chat")}
          className={`flex-1 px-4 py-2.5 text-[12px] font-mono font-medium tracking-wide transition-colors ${
            tab === "chat" ? "text-white/90 border-b-2 border-white/40" : "text-white/40 hover:text-white/60"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setTab("beliefs")}
          className={`flex-1 px-4 py-2.5 text-[12px] font-mono font-medium tracking-wide transition-colors ${
            tab === "beliefs" ? "text-white/90 border-b-2 border-white/40" : "text-white/40 hover:text-white/60"
          }`}
        >
          Beliefs
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "chat" && (
          <div className="px-3 py-2 space-y-1.5">
            <AnimatePresence initial={false}>
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] font-mono text-white/20 text-center py-8"
                >
                  waiting for conversation...
                </motion.div>
              )}
              {messages.map((msg) => {
                const senderColor = msg.senderId === "user"
                  ? "#00e5c7"
                  : msg.senderId === "system"
                  ? "#888"
                  : botColorMap.get(msg.senderId) ?? "#888";

                const isThink = msg.type === "think";
                const isBeliefChange = msg.type === "belief_change";
                const isSystem = msg.type === "system";
                const isPrivate = !!msg.targetId;
                const targetColor = msg.targetId ? (botNameColorMap.get(msg.targetId) ?? "#aaa") : null;

                return (
                  <motion.div
                    key={msg._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`rounded-lg border px-3 py-2 ${
                      isBeliefChange
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : isSystem
                        ? "border-white/10 bg-white/5"
                        : isThink
                        ? "border-white/5 bg-white/[0.02]"
                        : isPrivate
                        ? "border-white/8 bg-white/[0.02]"
                        : "border-white/10"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: senderColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-mono font-bold mb-0.5 flex items-center gap-1 flex-wrap">
                          <span style={{ color: senderColor }}>{msg.senderName}</span>
                          {isPrivate && targetColor && (
                            <>
                              <span className="text-white/20">→</span>
                              <span style={{ color: targetColor }}>{msg.targetId}</span>
                              <span className="text-[8px] text-white/15 ml-1">DM</span>
                            </>
                          )}
                          {!isPrivate && !isThink && !isSystem && !isBeliefChange && (
                            <span className="text-[8px] text-white/15 ml-1">nearby</span>
                          )}
                          {isThink && <span className="text-white/20 ml-1">(thinking)</span>}
                        </div>
                        <p className={`text-[11px] font-mono leading-relaxed break-words whitespace-pre-wrap ${
                          isThink ? "text-white/30 italic" : "text-white/70"
                        }`}>
                          {msg.content.length > 300 ? msg.content.slice(0, 300) + "..." : msg.content}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}

        {tab === "beliefs" && (
          <div className="px-3 py-2 space-y-3">
            {bots.map((bot) => {
              // Build full belief history: original → changes → current
              const changeMessages = messages.filter(
                (m) => m.type === "belief_change" && m.senderId === bot._id
              );
              // Extract belief strings from change messages (pattern: 'now believes: "X"')
              const pastBeliefs: string[] = [bot.originalBelief];
              for (const cm of changeMessages) {
                const match = cm.content.match(/now believes: "([^"]+)"/);
                if (match) pastBeliefs.push(match[1]);
              }
              // Deduplicate consecutive same beliefs
              const history = pastBeliefs.filter((b, i) => i === 0 || b !== pastBeliefs[i - 1]);
              // Current belief is always the last
              const allOld = history.slice(0, -1);
              const hasChanges = allOld.length > 0 || bot.belief !== bot.originalBelief;

              return (
                <div
                  key={bot._id}
                  className={`rounded-lg border px-3 py-2.5 ${
                    hasChanges ? "border-yellow-500/20 bg-yellow-500/5" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bot.color }} />
                    <span className="text-[11px] font-mono font-bold" style={{ color: bot.color }}>
                      {bot.name}
                    </span>
                    <span className="text-[9px] font-mono text-white/20 ml-auto">{bot.state}</span>
                  </div>
                  {/* Past beliefs — each with strikethrough */}
                  {allOld.map((b, i) => (
                    <p key={i} className="text-[10px] font-mono text-white/25 line-through border-b border-white/[0.04] pb-1 mb-1">
                      &quot;{b}&quot;
                    </p>
                  ))}
                  {/* Current belief */}
                  <p className="text-[12px] font-mono text-white/80">
                    &quot;{bot.belief}&quot;
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
