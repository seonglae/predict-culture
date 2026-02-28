"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AnimatePresence, motion } from "framer-motion";
import { Header } from "@/components/ui/Header";
import { WaveField } from "@/components/ui/WaveField";
import { ScreenEffectsProvider, useScreenEffects } from "@/components/arena/ScreenEffects";
import { NameEntryModal } from "@/components/arena/NameEntryModal";
import { Matchmaking } from "@/components/arena/Matchmaking";
import { BattleScene } from "@/components/arena/BattleScene";
import { BattleResult } from "@/components/arena/BattleResult";
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

      const pid = await registerOrGet({ name, browserId: fingerprint });
      setPlayerId(pid);

      const bid = await createBattle({ playerId: pid, difficulty: diff });
      setBattleId(bid);

      setPhase("matchmaking");
    },
    [fingerprint, registerOrGet, createBattle]
  );

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
    flash(200);
    shake(12, 600);

    setTimeout(async () => {
      await completeBattle({ battleId });
      setPhase("results");
    }, 1500);
  }, [battleId, completeBattle, flash, shake]);

  const handlePlayAgain = useCallback(() => {
    setBattleId(null);
    setMyPrediction(null);
    cityRef.current = null;
    setPhase("name_entry");
  }, []);

  const buildResults = () => {
    if (!battle || !predictions || battle.status !== "completed") return [];

    return battle.playerIds.map((pid: Id<"players">, i: number) => {
      const pred = predictions.find((p: any) => p.playerId === pid);
      return {
        name: pid === playerId ? playerName : `Player ${i + 1}`,
        score: pred?.score ?? 0,
        distanceScore: pred?.distanceScore ?? 0,
        timingScore: pred?.timingScore ?? 0,
        eloChange: 0,
        elo: 1500,
        isAI: false,
        isYou: pid === playerId,
        placement: i,
      };
    });
  };

  const buildPredictionMarkers = () => {
    if (!predictions) return [];
    return predictions.map((p: any, i: number) => ({
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

  const showWaveField = phase === "name_entry" || phase === "results";
  const showHeader = phase !== "simulation" && phase !== "matchmaking";

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
                    className="text-[56px] md:text-[96px] lg:text-[120px] leading-[0.85] tracking-[0.04em] text-foreground/90 select-none font-bold"
                    style={{ fontFamily: "var(--font-display), sans-serif" }}
                  >
                    PREDICT
                    <br />
                    <span className="text-foreground/40">
                      DRIVE
                    </span>
                  </h1>
                </motion.div>

                <motion.p
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-[13px] text-foreground/30 tracking-[0.35em] uppercase mt-6 font-mono"
                >
                  observe &middot; predict &middot; collapse
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
              />
            </motion.div>
          )}

          {phase === "results" && (
            <BattleResult
              key="results"
              results={buildResults()}
              onPlayAgain={handlePlayAgain}
            />
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
