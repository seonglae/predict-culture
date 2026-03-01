"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { useVoiceInput } from "@/hooks/useVoiceInput";

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
  cultureId?: Id<"cultures">;
  enabled?: boolean;
}

type Tab = "chat" | "beliefs" | "trace";

export function CultureSidebar({ bots, messages, cultureId, enabled = true }: CultureSidebarProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const [chatInput, setChatInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const addUserMessage = useMutation(api.cultures.addUserMessage);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (collapsed) return;
    if (tab === "chat") {
      const container = scrollContainerRef.current;
      if (container) {
        requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
      }
    }
  }, [messages.length, tab, collapsed]);

  const botColorMap = new Map(bots.map((b) => [b._id, b.color]));

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !cultureId) return;
    const text = chatInput.trim();
    setChatInput("");
    await addUserMessage({ cultureId, content: text, posX: 0, posZ: 0 });
  }, [chatInput, cultureId, addUserMessage]);

  const handleVoiceTranscript = useCallback(
    async (text: string) => {
      if (!cultureId) return;
      await addUserMessage({ cultureId, content: text, posX: 0, posZ: 0 });
    },
    [cultureId, addUserMessage]
  );

  const { isRecording, startRecording, stopRecording } = useVoiceInput({
    onTranscript: handleVoiceTranscript,
  });

  return (
    <>
      {/* Mobile toggle — hamburger style */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="md:hidden fixed top-4 right-4 z-[200] h-10 px-3 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 flex items-center gap-2 text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
        aria-label="Toggle sidebar"
      >
        {collapsed ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span className="text-[11px] font-mono font-medium">Chat</span>
          </>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </button>

      <div className={`h-full flex flex-col bg-[#06060c] border-l border-white/[0.06] overflow-hidden
        fixed md:relative inset-0 md:inset-auto z-40 transition-transform duration-200
        ${collapsed ? "translate-x-full md:translate-x-0" : "translate-x-0"}`}
      >
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
        <button
          onClick={() => setTab("trace")}
          className={`flex-1 px-4 py-2.5 text-[12px] font-mono font-medium tracking-wide transition-colors ${
            tab === "trace" ? "text-white/90 border-b-2 border-white/40" : "text-white/40 hover:text-white/60"
          }`}
        >
          Trace
        </button>
      </div>

      {/* Tab content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-thin">
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
              {messages.filter((m) => m.type !== "move" && m.type !== "think").map((msg) => {
                const senderColor = botColorMap.get(msg.senderId) ?? "#888";
                const isBeliefChange = msg.type === "belief_change";
                const isSystem = msg.type === "system";
                const isUser = msg.senderId === "user";

                return (
                  <motion.div
                    key={msg._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`rounded-lg border px-3 py-2 ${
                      isBeliefChange
                        ? "border-white/15 bg-white/[0.04]"
                        : isSystem
                        ? "border-white/8 bg-white/[0.03]"
                        : isUser
                        ? "border-white/15 bg-white/[0.06]"
                        : "border-white/8 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: isUser ? "#fff" : isSystem ? "#666" : senderColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-mono font-bold mb-0.5 flex items-center gap-1">
                          <span className={isUser ? "text-white/90" : isSystem ? "text-white/40" : "text-white/60"}>
                            {msg.senderName}
                          </span>
                          {isBeliefChange && <span className="text-white/30 ml-1">changed belief</span>}
                        </div>
                        <p className={`text-[11px] font-mono leading-relaxed break-words whitespace-pre-wrap ${
                          isBeliefChange ? "text-white/50" : "text-white/70"
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
              const changeMessages = messages.filter(
                (m) => m.type === "belief_change" && m.senderId === bot._id
              );
              const pastBeliefs: string[] = [bot.originalBelief];
              for (const cm of changeMessages) {
                const match = cm.content.match(/now believes: "([^"]+)"/);
                if (match) pastBeliefs.push(match[1]);
              }
              const history = pastBeliefs.filter((b, i) => i === 0 || b !== pastBeliefs[i - 1]);
              const allOld = history.slice(0, -1);

              return (
                <div
                  key={bot._id}
                  className="rounded-lg border border-white/8 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bot.color }} />
                    <span className="text-[11px] font-mono font-bold text-white/70">
                      {bot.name}
                    </span>
                    <span className="text-[9px] font-mono text-white/20 ml-auto">{bot.state}</span>
                  </div>
                  {allOld.map((b, i) => (
                    <p key={i} className="text-[10px] font-mono text-white/20 line-through border-b border-white/[0.04] pb-1 mb-1">
                      &quot;{b}&quot;
                    </p>
                  ))}
                  <p className="text-[12px] font-mono text-white/70">
                    &quot;{bot.belief}&quot;
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {tab === "trace" && (
          <div className="px-3 py-2 space-y-1">
            {messages.length === 0 && (
              <div className="text-[11px] font-mono text-white/20 text-center py-8">
                waiting for agent actions...
              </div>
            )}
            {messages
              .filter((m) => m.senderId !== "user" && m.senderId !== "system")
              .map((msg) => {
                const senderColor = botColorMap.get(msg.senderId) ?? "#888";
                const isThink = msg.type === "think";
                const isBeliefChange = msg.type === "belief_change";
                const isSpeech = msg.type === "speech";

                // Determine action icon
                const isMove = msg.type === "move";
                const icon = isMove ? "🚶" : isThink ? "💭" : isBeliefChange ? "🔄" : isSpeech ? "💬" : "•";
                const label = isMove ? "move_to" : isThink ? "think" : isBeliefChange ? "change_belief" : isSpeech ? "speech" : msg.type;

                return (
                  <div
                    key={msg._id}
                    className="border-l-2 pl-2.5 py-1.5"
                    style={{ borderColor: senderColor + "40" }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px]">{icon}</span>
                      <span className="text-[9px] font-mono text-white/40">{msg.senderName}</span>
                      <span className="text-[8px] font-mono text-white/20 px-1 py-0.5 rounded bg-white/[0.04]">{label}</span>
                    </div>
                    <p className={`text-[10px] font-mono leading-relaxed break-words whitespace-pre-wrap ${
                      isThink ? "text-white/30 italic" : isBeliefChange ? "text-white/50" : "text-white/50"
                    }`}>
                      {msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content}
                    </p>
                  </div>
                );
              })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Chat input + recording — bottom of sidebar */}
      {tab === "chat" && enabled && cultureId && (
        <div className="shrink-0 border-t border-white/[0.06] px-3 py-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-[12px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
            />
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              className={`px-3 py-2 rounded-lg border text-[14px] transition-colors cursor-pointer ${
                isRecording
                  ? "border-red-500/40 bg-red-500/20 text-red-400"
                  : "border-white/10 bg-white/[0.04] text-white/40 hover:text-white/60 hover:bg-white/[0.08]"
              }`}
              title="Hold to record"
            >
              {isRecording ? "●" : "🎤"}
            </button>
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="px-3 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-[12px] font-mono text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
    </>
  );
}
