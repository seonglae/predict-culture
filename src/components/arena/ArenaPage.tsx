"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Header } from "@/components/ui/Header";
import { WaveField } from "@/components/ui/WaveField";
import { ScreenEffectsProvider, useScreenEffects } from "@/components/arena/ScreenEffects";
import { NameEntryModal } from "@/components/arena/NameEntryModal";
import { Matchmaking } from "@/components/arena/Matchmaking";
import { BattleScene } from "@/components/arena/BattleScene";
import { BattleResult } from "@/components/arena/BattleResult";
import { GlobeMini } from "@/components/arena/GlobeMini";
import { AgentSidebar } from "@/components/arena/AgentSidebar";
import { useBrowserFingerprint } from "@/hooks/useBrowserFingerprint";
import { useTheme } from "@/components/ThemeProvider";

type Phase = "name_entry" | "matchmaking" | "simulation" | "results";
type Difficulty = "easy" | "normal" | "hard" | "hell";

const PREDICTION_COLORS = ["#00e5c7", "#f472b6", "#8b5cf6"];

function ArenaContent() {
  const fingerprint = useBrowserFingerprint();

  const [phase, setPhase] = useState<Phase>("name_entry");
  const [playerName, setPlayerName] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [battleId, setBattleId] = useState<Id<"battles"> | null>(null);
  const [myPrediction, setMyPrediction] = useState<{ x: number; z: number } | null>(null);
  const cityRef = useRef<string | null>(null);

  const { flash, shake } = useScreenEffects();

  const registerOrGet = useMutation(api.players.registerOrGet);
  const createBattle = useMutation(api.battles.createBattle);
  const submitPrediction = useMutation(api.predictions.submitPrediction);
  const completeBattle = useMutation(api.battles.completeBattle);

  const battle = useQuery(
    api.battles.getBattle,
    battleId ? { battleId } : "skip"
  );
  const predictions = useQuery(
    api.predictions.getPredictions,
    battleId ? { battleId } : "skip"
  );
  const ratingChanges = useQuery(
    api.battles.getBattleRatingChanges,
    battleId ? { battleId } : "skip"
  );
  const existingPlayer = useQuery(
    api.players.getByBrowserId,
    fingerprint ? { browserId: fingerprint } : "skip"
  );

  useEffect(() => {
    if (existingPlayer && !playerName) {
      setPlayerName(existingPlayer.name);
    }
  }, [existingPlayer, playerName]);

  // Lock city synchronously on first read — ref, not state, no async delay
  const rawCityName = battle?.cityName as string | undefined;
  if (rawCityName && !cityRef.current) {
    cityRef.current = rawCityName;
  }
  const city = cityRef.current;

  const opponentFound = !!(
    city &&
    battle &&
    (battle.status === "simulating" || battle.status === "active" || battle.status === "completed")
  );

  const handleNameSubmit = useCallback(
    async (name: string, diff: Difficulty) => {
      if (!fingerprint) return;

      setPlayerName(name);
      setDifficulty(diff);

      try {
        const pid = await registerOrGet({ name, browserId: fingerprint });
        setPlayerId(pid);

        const bid = await createBattle({ playerId: pid, difficulty: diff });
        setBattleId(bid);

        setPhase("matchmaking");
      } catch (err) {
        console.error("Failed to start battle:", err);
        toast.error("Failed to start battle. Please try again.");
        setPhase("name_entry");
      }
    },
    [fingerprint, registerOrGet, createBattle]
  );

  // Detect cancelled/failed battles — auto-retry
  const retryCountRef = useRef(0);
  useEffect(() => {
    if (!battle) return;
    if (battle.status === "cancelled" && (phase === "matchmaking" || phase === "simulation")) {
      if (retryCountRef.current >= 2) {
        toast.error("Failed after multiple retries. Going home.");
        retryCountRef.current = 0;
        setBattleId(null);
        cityRef.current = null;
        setPhase("name_entry");
        return;
      }
      retryCountRef.current++;
      toast.error("Map generation failed. Retrying...");
      // Auto-retry: create a new battle
      if (playerId) {
        setBattleId(null);
        cityRef.current = null;
        createBattle({ playerId, difficulty }).then((bid) => {
          setBattleId(bid);
        }).catch(() => {
          toast.error("Retry failed. Going home.");
          setPhase("name_entry");
        });
      }
    }
  }, [battle, phase, playerId, difficulty, createBattle]);

  // Matchmaking timeout — if stuck for 30s, reset to name entry
  useEffect(() => {
    if (phase !== "matchmaking") return;
    const timeout = setTimeout(() => {
      toast.error("Connection timed out. Please try again.");
      setBattleId(null);
      cityRef.current = null;
      setPhase("name_entry");
    }, 30000);
    return () => clearTimeout(timeout);
  }, [phase]);

  const handlePrediction = useCallback(
    async (point: { x: number; z: number }, time: number) => {
      if (!battleId || !playerId) return;
      setMyPrediction(point);
      await submitPrediction({
        battleId,
        playerId,
        coordinates: point,
        predictionTime: time,
      });
    },
    [battleId, playerId, submitPrediction]
  );

  const handleSimulationComplete = useCallback(async () => {
    if (!battleId) return;
    setTimeout(async () => {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        );
        await Promise.race([completeBattle({ battleId }), timeout]);
      } catch (err) {
        console.error("Failed to complete battle:", err);
        toast.error("Failed to save results.");
      }
      setPhase("results");
    }, 1000);
  }, [battleId, completeBattle]);

  const handlePlayAgain = useCallback(() => {
    setBattleId(null);
    setMyPrediction(null);
    cityRef.current = null;
    setPhase("name_entry");
  }, []);

  const buildResults = () => {
    if (!battle || !predictions || battle.status !== "completed") return [];

    const results = battle.playerIds.map((pid: Id<"players">, i: number) => {
      const pred = predictions.find((p: any) => p.playerId === pid);
      const ratingChange = ratingChanges?.find((r: any) => r.playerId === pid);
      return {
        name: pid === playerId ? playerName : `Player ${i + 1}`,
        score: pred?.score ?? 0,
        distanceScore: pred?.distanceScore ?? 0,
        timingScore: pred?.timingScore ?? 0,
        eloChange: ratingChange ? Math.round(ratingChange.eloAfter - ratingChange.eloBefore) : 0,
        elo: ratingChange ? Math.round(ratingChange.eloAfter) : 1500,
        isAI: false,
        isYou: pid === playerId,
        placement: ratingChange?.placement ?? i,
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results;
  };

  const buildPredictionMarkers = () => {
    if (!predictions) return [];
    // Before crash: only show the user's own prediction
    // After crash (results): show all predictions
    const showAll = battle?.status === "completed";
    return predictions
      .filter((p: any) => showAll || p.playerId === playerId)
      .map((p: any, i: number) => ({
        x: p.coordinates.x,
        z: p.coordinates.z,
        color: PREDICTION_COLORS[i % PREDICTION_COLORS.length],
        label: p.playerId === playerId ? "You" : `P${i + 1}`,
      }));
  };

  const handleFlyComplete = useCallback(() => {
    if (battle?.status === "active") {
      setPhase("simulation");
    } else {
      // Data not ready yet — wait a bit then transition
      setTimeout(() => setPhase("simulation"), 500);
    }
  }, [battle]);

  const sceneConfig = battle?.sceneConfig as any;
  const simulationData = battle?.simulationData as any[];
  const cityLabel = battle?.cityLabel as string | undefined;

  const showWaveField = phase === "name_entry";
  const showHeader = phase !== "simulation" && phase !== "matchmaking" && phase !== "results";

  return (
    <div className="min-h-screen flex flex-col">
      {showWaveField && <WaveField />}
      {showHeader && <Header />}

      <main className={`flex-1 relative z-10 ${showHeader ? "pt-16" : ""}`}>
        <AnimatePresence mode="wait">
          {phase === "name_entry" && (
            <div
              key="name-entry"
              className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]"
            >
              {/* Hero */}
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
                      {"CHAOS".split("").map((ch, i) => (
                        <span key={i} className={`chaos-letter chaos-letter-${i}`}>{ch}</span>
                      ))}
                    </span>
                  </h1>
                  <style jsx>{`
                    .chaos-wrapper {
                      display: inline-flex;
                      position: relative;
                      cursor: default;
                    }

                    /* Default: plain text, no glaze */
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

                    /* Hover: full chaos mode */
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
                  observe &middot; intuition &middot; prediction
                </motion.p>
              </div>

              <NameEntryModal
                onSubmit={handleNameSubmit}
                initialName={existingPlayer?.name ?? ""}
              />
            </div>
          )}

          {phase === "matchmaking" && (
            <Matchmaking
              key="matchmaking"
              opponentFound={opponentFound}
              selectedCity={city ?? "New York"}
              onFlyComplete={handleFlyComplete}
            />
          )}

          {phase === "simulation" && sceneConfig && simulationData && battle && (
            <motion.div
              key="simulation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-screen"
            >
              <BattleScene
                tiles={sceneConfig.tiles}
                gridSize={sceneConfig.gridSize}
                tileSize={sceneConfig.tileSize}
                vehicles={sceneConfig.vehicles}
                frames={simulationData}
                accidentTime={battle.accidentTime ?? 10}
                accidentFrame={battle.accidentFrame ?? 0}
                accidentPoint={battle.accidentPoint ?? { x: 0, z: 0 }}
                onPrediction={handlePrediction}
                onSimulationComplete={handleSimulationComplete}
                predictions={buildPredictionMarkers()}
                showAccident={battle.status === "completed"}
                cityName={city ?? undefined}
                cityLabel={cityLabel}
                roads={sceneConfig.roads}
                buildings={sceneConfig.buildings}
                waterPolygons={sceneConfig.waterPolygons}
                flash={flash}
                shake={shake}
                lat={sceneConfig.lat}
                lon={sceneConfig.lon}
                battleId={battleId ?? undefined}
              />
            </motion.div>
          )}

          {phase === "results" && (
            <div key="results" className="flex w-full h-screen">
              <div className="relative flex-1 h-full">
                {sceneConfig && (
                  <GlobeMini
                    cityName={city ?? undefined}
                    cityLabel={cityLabel}
                    lat={sceneConfig.lat}
                    lon={sceneConfig.lon}
                    roads={sceneConfig.roads}
                    tiles={sceneConfig.tiles}
                    gridSize={sceneConfig.gridSize}
                    tileSize={sceneConfig.tileSize}
                  />
                )}
                <BattleResult
                  results={buildResults()}
                  onPlayAgain={handlePlayAgain}
                />
              </div>
              {battleId && (
                <div className="w-[320px] h-full shrink-0">
                  <AgentSidebar battleId={battleId} />
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function ArenaPage() {
  return (
    <ScreenEffectsProvider>
      <ArenaContent />
    </ScreenEffectsProvider>
  );
}
