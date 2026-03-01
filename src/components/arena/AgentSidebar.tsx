"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AgentSidebarProps {
  battleId: Id<"battles">;
}

const ICON_MAP: Record<string, string> = {
  thinking: "~",
  tool_call: ">",
  tool_result: "<",
  prediction: "!",
};

const COLOR_MAP: Record<string, string> = {
  thinking: "text-blue-400",
  tool_call: "text-amber-400",
  tool_result: "text-emerald-400",
  prediction: "text-rose-400",
};

const BG_MAP: Record<string, string> = {
  thinking: "border-blue-500/20",
  tool_call: "border-amber-500/20",
  tool_result: "border-emerald-500/20",
  prediction: "border-rose-500/20 bg-rose-500/5",
};

export function AgentSidebar({ battleId }: AgentSidebarProps) {
  const logs = useQuery(api.battles.getAgentLogs, { battleId }) ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="h-full flex flex-col bg-black/60 backdrop-blur-md border-l border-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[13px] font-mono font-medium text-white/80 tracking-wide">
          Mistral Agent
        </span>
        <span className="text-[10px] font-mono text-white/30 ml-auto">
          {logs.length > 0 ? `${logs.length} steps` : "initializing..."}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 scrollbar-thin">
        <AnimatePresence initial={false}>
          {logs.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[11px] font-mono text-white/20 text-center py-8"
            >
              waiting for agent...
            </motion.div>
          )}
          {logs.map((log, i) => (
            <motion.div
              key={log._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className={`rounded-lg border px-3 py-2 ${BG_MAP[log.type] ?? "border-white/10"}`}
            >
              <div className="flex items-start gap-2">
                <span className={`text-[11px] font-mono font-bold shrink-0 mt-0.5 ${COLOR_MAP[log.type] ?? "text-white/40"}`}>
                  {ICON_MAP[log.type] ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  {log.toolName && (
                    <div className="text-[10px] font-mono text-white/40 mb-0.5">
                      {log.toolName}
                      {log.toolArgs && (
                        <span className="text-white/20 ml-1">
                          ({log.toolArgs.length > 60 ? log.toolArgs.slice(0, 60) + "..." : log.toolArgs})
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] font-mono text-white/70 leading-relaxed break-words whitespace-pre-wrap">
                    {log.content.length > 300 ? log.content.slice(0, 300) + "..." : log.content}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
