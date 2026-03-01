"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Header } from "@/components/ui/Header";
import { WaveField } from "@/components/ui/WaveField";
import { NameEntryModal } from "@/components/arena/NameEntryModal";
import { Matchmaking } from "@/components/arena/Matchmaking";
import { CultureScene } from "@/components/scene/CultureScene";
import { CultureSidebar } from "@/components/culture/CultureSidebar";
import { GlobeMini } from "@/components/arena/GlobeMini";
import { useSpatialAudio } from "@/hooks/useSpatialAudio";
import { warmUpAudio, playCityVoice, playMatchmakingAmbient, playBattleBGM } from "@/lib/sfx";

type Phase = "name_entry" | "matchmaking" | "pick_belief" | "running" | "ended";

function ArenaContent() {
  const [phase, setPhase] = useState<Phase>("name_entry");
  const [cultureId, setCultureId] = useState<Id<"cultures"> | null>(null);
  const [userPos] = useState({ x: 0, z: 0 });
  const [predictionText, setPredictionText] = useState("");

  const createCulture = useMutation(api.cultures.createCulture);
  const submitPrediction = useMutation(api.cultures.submitPrediction);

  const culture = useQuery(api.cultures.getCulture, cultureId ? { cultureId } : "skip");
  const bots = useQuery(api.cultures.getBots, cultureId ? { cultureId } : "skip") ?? [];
  const messages = useQuery(api.cultures.getMessages, cultureId ? { cultureId } : "skip") ?? [];

  const beliefs = culture?.beliefs as string[] | undefined;
  const sceneConfig = culture?.sceneConfig as any;
  const cityName = culture?.cityName as string | undefined;

  const sceneReady = !!(culture && (culture.status === "pick_belief" || culture.status === "running" || culture.status === "ended"));

  useEffect(() => {
    if (!culture) return;
    const s = culture.status;
    if (s === "running") setPhase("running");
    else if (s === "ended") setPhase("ended");
  }, [culture?.status]);

  // Audio handles
  const matchAudioRef = useRef<{ stop: () => void } | null>(null);
  const bgmRef = useRef<{ stop: () => void } | null>(null);

  // Spatial audio
  useSpatialAudio(messages as any[], bots as any[], userPos, phase === "running");

  // Phase-based audio
  useEffect(() => {
    if (phase === "matchmaking") {
      matchAudioRef.current = playMatchmakingAmbient();
    } else {
      matchAudioRef.current?.stop();
      matchAudioRef.current = null;
    }
    if (phase === "running") {
      bgmRef.current = playBattleBGM();
    } else {
      bgmRef.current?.stop();
      bgmRef.current = null;
    }
    return () => {
      matchAudioRef.current?.stop();
      bgmRef.current?.stop();
    };
  }, [phase]);

  // City voice when city is found
  useEffect(() => {
    if (cityName && phase === "matchmaking") {
      playCityVoice(cityName);
    }
  }, [cityName, phase]);

  const handleNameSubmit = useCallback(
    async (name: string, topic: string) => {
      try {
        warmUpAudio();
        const id = await createCulture({ topic });
        setCultureId(id);
        setPhase("matchmaking");
      } catch (err) {
        console.error("Failed to start:", err);
        toast.error("Failed to start. Please try again.");
      }
    },
    [createCulture]
  );

  const handleFlyComplete = useCallback(() => {
    setPhase("pick_belief");
  }, []);

  const handlePrediction = useCallback(
    async (belief: string) => {
      if (!cultureId) return;
      await submitPrediction({ cultureId, prediction: belief });
    },
    [cultureId, submitPrediction]
  );

  const handlePlayAgain = useCallback(() => {
    setCultureId(null);
    setPhase("name_entry");
  }, []);

  // Latest speech for bubbles
  const latestMessages = messages
    .filter((m) => m.type === "speech")
    .slice(-20)
    .map((m) => ({ senderId: m.senderId, content: m.content, createdAt: m.createdAt }));

  const showWaveField = phase === "name_entry";
  const showHeader = phase === "name_entry";

  return (
    <div className="min-h-screen flex flex-col">
      {showWaveField && <WaveField />}
      {showHeader && <Header />}

      <main className={`flex-1 relative z-10 ${showHeader ? "pt-16" : ""}`}>
        <AnimatePresence mode="wait">
          {/* Name entry */}
          {phase === "name_entry" && (
            <div
              key="name-entry"
              className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]"
            >
              <div className="text-center mb-12 px-4">
                <motion.div
                  initial={{ y: -30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h1
                    className="text-[56px] md:text-[96px] lg:text-[120px] leading-[0.85] tracking-[0.04em] select-none font-bold"
                    style={{ fontFamily: "var(--font-display), sans-serif" }}
                  >
                    <span className="chaos-wrapper">
                      {"PREDICT".split("").map((ch, i) => (
                        <span key={`p${i}`} className={`chaos-letter chaos-letter-${i % 5}`}>{ch}</span>
                      ))}
                    </span>
                    <br />
                    <span className="chaos-wrapper chaos-only">
                      {"CULTURE".split("").map((ch, i) => (
                        <span key={i} className={`chaos-letter chaos-letter-${i % 5}`}>{ch}</span>
                      ))}
                    </span>
                  </h1>
                  <style jsx>{`
                    .chaos-wrapper {
                      display: inline-flex;
                      position: relative;
                      cursor: default;
                    }
                    .chaos-letter {
                      display: inline-block;
                      background-image: none;
                      -webkit-background-clip: text;
                      -webkit-text-fill-color: currentColor;
                      animation: none;
                      transition: filter 0.3s ease;
                      filter: none;
                      will-change: transform, filter, background-image;
                    }
                    .chaos-wrapper:hover .chaos-letter {
                      background-size: 400% 400%;
                      animation: chaos-color 2s linear infinite,
                                 chaos-jitter 0.12s ease-in-out infinite alternate;
                    }
                    .chaos-wrapper:hover .chaos-letter-0 {
                      background-image: linear-gradient(130deg, #ff3366, #ff6633, #ffcc33, #ff3366);
                      animation-delay: 0s, 0s;
                      animation-duration: 2.2s, 0.12s;
                    }
                    .chaos-wrapper:hover .chaos-letter-1 {
                      background-image: linear-gradient(130deg, #33ffcc, #3366ff, #cc33ff, #33ffcc);
                      animation-delay: -0.4s, -0.03s;
                      animation-duration: 2.8s, 0.18s;
                    }
                    .chaos-wrapper:hover .chaos-letter-2 {
                      background-image: linear-gradient(130deg, #ffcc00, #ff0066, #9933ff, #ffcc00);
                      animation-delay: -0.8s, -0.06s;
                      animation-duration: 1.9s, 0.14s;
                    }
                    .chaos-wrapper:hover .chaos-letter-3 {
                      background-image: linear-gradient(130deg, #00ffaa, #ff3399, #3399ff, #00ffaa);
                      animation-delay: -1.2s, -0.09s;
                      animation-duration: 3.1s, 0.16s;
                    }
                    .chaos-wrapper:hover .chaos-letter-4 {
                      background-image: linear-gradient(130deg, #ff6600, #cc00ff, #00ccff, #ff6600);
                      animation-delay: -1.6s, -0.12s;
                      animation-duration: 2.5s, 0.2s;
                    }
                    @keyframes chaos-color {
                      0% { background-position: 0% 50%; filter: drop-shadow(0 0 6px rgba(255,50,100,0.4)); }
                      25% { background-position: 100% 50%; filter: drop-shadow(0 0 10px rgba(100,50,255,0.5)); }
                      50% { background-position: 50% 100%; filter: drop-shadow(0 0 6px rgba(50,255,200,0.4)); }
                      75% { background-position: 0% 0%; filter: drop-shadow(0 0 12px rgba(255,200,50,0.5)); }
                      100% { background-position: 0% 50%; filter: drop-shadow(0 0 6px rgba(255,50,100,0.4)); }
                    }
                    @keyframes chaos-jitter {
                      0% { transform: translate(0, 0) rotate(0deg) scale(1); }
                      20% { transform: translate(-1px, 1px) rotate(-0.5deg) scale(1.01); }
                      40% { transform: translate(1px, -1px) rotate(0.8deg) scale(0.99); }
                      60% { transform: translate(-0.5px, -1px) rotate(-0.3deg) scale(1.02); }
                      80% { transform: translate(1px, 0.5px) rotate(0.6deg) scale(0.98); }
                      100% { transform: translate(-1px, 1px) rotate(-0.7deg) scale(1.01); }
                    }
                  `}</style>
                </motion.div>

                <motion.p
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-[13px] text-foreground/30 tracking-[0.35em] uppercase mt-6 font-mono"
                >
                  predict &middot; observe &middot; score
                </motion.p>
              </div>

              <NameEntryModal onSubmit={handleNameSubmit} />
            </div>
          )}

          {/* Globe matchmaking transition */}
          {phase === "matchmaking" && (
            <Matchmaking
              key="matchmaking"
              opponentFound={sceneReady}
              selectedCity={cityName ?? "Paris"}
              onFlyComplete={handleFlyComplete}
            />
          )}

          {/* Prediction phase — click a belief to predict the winner */}
          {phase === "pick_belief" && sceneConfig && (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full h-screen"
            >
              {/* 3D scene behind */}
              <CultureScene
                gridSize={sceneConfig.gridSize}
                tileSize={sceneConfig.tileSize}
                roads={sceneConfig.roads}
                buildings={sceneConfig.buildings}
                waterPolygons={sceneConfig.waterPolygons}
                bots={bots}
                latestMessages={latestMessages}
              />

              {/* Overlay UI */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] px-4 overflow-y-auto py-8 z-50">
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="flex items-center gap-3 mb-2"
                >
                  <h2
                    className="text-2xl md:text-4xl font-bold text-center text-white"
                    style={{ fontFamily: "var(--font-display), sans-serif" }}
                  >
                    Submit Your Prediction
                  </h2>
                  <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[11px] font-mono text-white/50">
                    {culture?.topic ?? "random"}
                  </span>
                </motion.div>
                <p className="text-[13px] font-mono text-white/40 mb-6 text-center">
                  What will happen? Type your prediction or pick a belief below.
                </p>

                {/* Prediction text input */}
                <motion.form
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="w-full max-w-xl mb-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (predictionText.trim()) handlePrediction(predictionText.trim());
                  }}
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={predictionText}
                      onChange={(e) => setPredictionText(e.target.value)}
                      placeholder="e.g. &quot;All bots will believe pineapple is sacred&quot;"
                      className="flex-1 px-4 py-3 rounded-xl border border-white/20 bg-black/50 backdrop-blur-sm text-[14px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-white/40 transition-colors"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!predictionText.trim()}
                      className="px-5 py-3 rounded-xl bg-white/15 border border-white/20 text-[13px] font-mono font-bold text-white hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Submit
                    </button>
                  </div>
                </motion.form>

                {/* Quick pick — belief cards */}
                <p className="text-[11px] font-mono text-white/25 mb-3 uppercase tracking-wider">or pick a belief</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full mb-6">
                  {beliefs?.map((belief, i) => {
                    const matchingBot = bots.find((b) => b.belief === belief);
                    const botColor = matchingBot?.color ?? "#888";
                    return (
                      <motion.button
                        key={i}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.15 + 0.1 * i }}
                        onClick={() => handlePrediction(belief)}
                        className="px-5 py-4 rounded-xl border text-left hover:brightness-125 transition-all group cursor-pointer"
                        style={{ backgroundColor: botColor + "25", borderColor: botColor + "50" }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: botColor }} />
                          <p className="text-[10px] font-mono" style={{ color: botColor }}>
                            {matchingBot?.name ?? `Bot ${i + 1}`}
                          </p>
                        </div>
                        <p className="text-[14px] font-mono text-white/80 group-hover:text-white">
                          &quot;{belief}&quot;
                        </p>
                      </motion.button>
                    );
                  })}
                </div>

                {/* All bots with their beliefs */}
                <div className="flex flex-wrap gap-2 justify-center max-w-xl">
                  {bots.map((bot) => (
                    <span
                      key={bot._id}
                      className="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium"
                      style={{ backgroundColor: bot.color + "20", borderColor: bot.color + "40", color: bot.color, border: `1px solid ${bot.color}40` }}
                    >
                      {bot.name}: &quot;{bot.belief}&quot;
                    </span>
                  ))}
                </div>

              </div>
            </motion.div>
          )}

          {/* Running — observer mode with minimap */}
          {phase === "running" && sceneConfig && (
            <motion.div
              key="running"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full h-screen"
            >
              <div className="relative flex-1 h-full">
                <CultureScene
                  gridSize={sceneConfig.gridSize}
                  tileSize={sceneConfig.tileSize}
                  roads={sceneConfig.roads}
                  buildings={sceneConfig.buildings}
                  waterPolygons={sceneConfig.waterPolygons}
                  bots={bots}
                  latestMessages={latestMessages}
                />

                {/* Minimap — top left */}
                <GlobeMini
                  cityName={sceneConfig.cityName ?? cityName}
                  cityLabel={sceneConfig.cityLabel}
                  lat={sceneConfig.lat}
                  lon={sceneConfig.lon}
                  roads={sceneConfig.roads}
                  gridSize={sceneConfig.gridSize}
                  tileSize={sceneConfig.tileSize}
                />

                {/* Timer — top center */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
                  <GameTimer
                    startedAt={culture?.gameStartedAt ?? 0}
                    duration={culture?.gameDuration ?? 90000}
                  />
                </div>

              </div>

              <div className="w-[320px] h-full shrink-0">
                <CultureSidebar
                  bots={bots}
                  messages={messages}
                />
              </div>
            </motion.div>
          )}

          {/* Ended — show prediction result */}
          {phase === "ended" && (
            <motion.div
              key="ended"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full h-screen"
            >
              <div className="relative flex-1 h-full">
                {sceneConfig && (
                  <>
                    <CultureScene
                      gridSize={sceneConfig.gridSize}
                      tileSize={sceneConfig.tileSize}
                      roads={sceneConfig.roads}
                      buildings={sceneConfig.buildings}
                      waterPolygons={sceneConfig.waterPolygons}
                      bots={bots}
                      latestMessages={latestMessages}
                    />
                    <GlobeMini
                      cityName={sceneConfig.cityName ?? cityName}
                      cityLabel={sceneConfig.cityLabel}
                      lat={sceneConfig.lat}
                      lon={sceneConfig.lon}
                      roads={sceneConfig.roads}
                      gridSize={sceneConfig.gridSize}
                      tileSize={sceneConfig.tileSize}
                    />
                  </>
                )}

                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-black/80 border border-white/20 rounded-2xl px-10 py-8 text-center max-w-md"
                  >
                    <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "var(--font-display), sans-serif" }}>
                      Game Over
                    </h2>

                    {/* Result summary */}
                    {culture?.resultSummary && (
                      <p className="text-[12px] font-mono text-white/50 mb-4">
                        {culture.resultSummary}
                      </p>
                    )}

                    <div className="text-5xl font-bold text-emerald-400 font-mono my-4">
                      {culture?.finalScore ?? 0}
                    </div>
                    <p className="text-[12px] font-mono text-white/40 mb-6">prediction score</p>

                    <div className="space-y-2 mb-6 text-left">
                      <div className="flex justify-between text-[12px] font-mono">
                        <span className="text-white/50">Your prediction</span>
                        <span className="text-violet-300 max-w-[180px] text-right truncate">
                          &quot;{culture?.userPrediction ?? "—"}&quot;
                        </span>
                      </div>
                      <div className="flex justify-between text-[12px] font-mono">
                        <span className="text-white/50">Bots with your pick</span>
                        <span className="text-white/80">
                          {culture?.userPrediction ? bots.filter((b) => b.belief === culture.userPrediction).length : 0}/{bots.length}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handlePlayAgain}
                      className="px-6 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-mono text-sm hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      Play Again
                    </button>
                  </motion.div>
                </div>
              </div>

              <div className="w-[320px] h-full shrink-0">
                <CultureSidebar
                  bots={bots}
                  messages={messages}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function GameTimer({ startedAt, duration }: { startedAt: number; duration: number }) {
  const [remaining, setRemaining] = useState(duration);
  useEffect(() => {
    const interval = setInterval(() => setRemaining(Math.max(0, duration - (Date.now() - startedAt))), 1000);
    return () => clearInterval(interval);
  }, [startedAt, duration]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return (
    <span className={`text-[18px] font-mono font-bold ${remaining < 30000 ? "text-red-400" : "text-white/80"}`}>
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export default function ArenaPage() {
  return <ArenaContent />;
}
