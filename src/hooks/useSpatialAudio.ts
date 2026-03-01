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

// ElevenLabs voice IDs
const VOICE_IDS = [
  "21m00Tcm4TlvDq8ikWAM", // Rachel
  "AZnzlk1XvdvUeBnXmlld", // Domi
  "EXAVITQu4vr4xnSDxMaL", // Bella
  "ErXwobaYiN019PkySvjV", // Antoni
  "MF3mGyEYCl7XYWbV9V6O", // Elli
  "TxGEqnHWrfWFTfGW9XjX", // Josh
  "VR6AewLTigWG4xSOukaG", // Arnold
  "pNInz6obpgDQGcFmaJgB", // Adam
];

export function useSpatialAudio(
  messages: SpatialMessage[],
  bots: BotData[],
  _listenerPos: { x: number; z: number },
  enabled: boolean = true
) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processedIdsRef = useRef(new Set<string>());
  const botVoiceMap = useRef(new Map<string, string>());
  const queueRef = useRef<SpatialMessage[]>([]);
  const playingRef = useRef(false);

  // Assign voices to bots
  useEffect(() => {
    bots.forEach((bot, i) => {
      if (!botVoiceMap.current.has(bot._id)) {
        botVoiceMap.current.set(bot._id, VOICE_IDS[i % VOICE_IDS.length]);
      }
    });
  }, [bots]);

  const ensureAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Play TTS — no spatial panner, just direct output so everything is audible
  const playTTS = useCallback(async (msg: SpatialMessage) => {
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.warn("ElevenLabs: NEXT_PUBLIC_ELEVENLABS_API_KEY not set");
      return;
    }

    const voiceId = botVoiceMap.current.get(msg.senderId) ?? VOICE_IDS[0];
    const ctx = ensureAudioCtx();

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: msg.content.slice(0, 150),
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (!response.ok) {
        if (response.status !== 401) console.warn("ElevenLabs TTS:", response.status);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gain = ctx.createGain();
      gain.gain.value = 0.7;

      source.connect(gain).connect(ctx.destination);
      source.start();

      // Wait for playback to finish before next in queue
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    } catch (err) {
      console.error("TTS error:", err);
    }
  }, [ensureAudioCtx]);

  // Process queue sequentially so voices don't overlap too much
  const processQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;

    while (queueRef.current.length > 0) {
      const msg = queueRef.current.shift()!;
      await playTTS(msg);
    }

    playingRef.current = false;
  }, [playTTS]);

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

    // Fire off queue processing (non-blocking)
    processQueue().catch(() => {});

    // Cleanup old IDs
    if (processedIdsRef.current.size > 200) {
      const arr = Array.from(processedIdsRef.current);
      processedIdsRef.current = new Set(arr.slice(-100));
    }
  }, [messages, enabled, processQueue]);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);
}
