"use client";

import { useEffect, useRef, useCallback } from "react";

interface SpatialMessage {
  _id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: string;
  posX: number;
  posZ: number;
  createdAt: number;
}

interface BotData {
  _id: string;
  name: string;
  color: string;
}

// Distinct voice configs per bot slot
const VOICE_CONFIGS: { pitch: number; rate: number }[] = [
  { pitch: 0.8, rate: 0.95 },
  { pitch: 1.2, rate: 1.0 },
  { pitch: 0.9, rate: 1.05 },
  { pitch: 1.1, rate: 0.9 },
  { pitch: 1.0, rate: 1.1 },
  { pitch: 0.7, rate: 0.85 },
  { pitch: 1.3, rate: 1.0 },
  { pitch: 0.85, rate: 0.95 },
];

export function useSpatialAudio(
  messages: SpatialMessage[],
  bots: BotData[],
  _listenerPos: { x: number; z: number },
  enabled: boolean = true
) {
  const processedIdsRef = useRef(new Set<string>());
  const botIndexMap = useRef(new Map<string, number>());
  const queueRef = useRef<SpatialMessage[]>([]);
  const playingRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Assign voice index to bots
  useEffect(() => {
    bots.forEach((bot, i) => {
      if (!botIndexMap.current.has(bot._id)) {
        botIndexMap.current.set(bot._id, i);
      }
    });
  }, [bots]);

  // Cache available voices
  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = speechSynthesis.getVoices();
    };
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const speakTTS = useCallback((msg: SpatialMessage): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === "undefined") {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(msg.content.slice(0, 200));
      const idx = botIndexMap.current.get(msg.senderId) ?? 0;
      const cfg = VOICE_CONFIGS[idx % VOICE_CONFIGS.length];

      // Try to pick a distinct voice per bot from available voices
      const voices = voicesRef.current;
      const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
      if (englishVoices.length > 0) {
        utterance.voice = englishVoices[idx % englishVoices.length];
      }

      utterance.pitch = cfg.pitch;
      utterance.rate = cfg.rate;
      utterance.volume = 0.7;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      speechSynthesis.speak(utterance);
    });
  }, []);

  // Process queue sequentially
  const processQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;

    while (queueRef.current.length > 0) {
      const msg = queueRef.current.shift()!;
      await speakTTS(msg);
    }

    playingRef.current = false;
  }, [speakTTS]);

  // Watch for new speech messages
  useEffect(() => {
    if (!enabled) return;

    for (const msg of messages) {
      if (msg.type !== "speech") continue;
      if (msg.senderId === "user" || msg.senderId === "system") continue;
      if (processedIdsRef.current.has(msg._id)) continue;
      if (Date.now() - msg.createdAt > 15000) continue;

      processedIdsRef.current.add(msg._id);
      queueRef.current.push(msg);
    }

    processQueue().catch(() => {});

    // Cleanup old IDs
    if (processedIdsRef.current.size > 200) {
      const arr = Array.from(processedIdsRef.current);
      processedIdsRef.current = new Set(arr.slice(-100));
    }
  }, [messages, enabled, processQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.cancel();
      }
    };
  }, []);
}
