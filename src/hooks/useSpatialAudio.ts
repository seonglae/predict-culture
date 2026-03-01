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

// Map bot names to ElevenLabs voice IDs (using default voices)
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
  listenerPos: { x: number; z: number },
  enabled: boolean = true
) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processedIdsRef = useRef(new Set<string>());
  const botVoiceMap = useRef(new Map<string, string>());

  // Assign voices to bots
  useEffect(() => {
    bots.forEach((bot, i) => {
      if (!botVoiceMap.current.has(bot._id)) {
        botVoiceMap.current.set(bot._id, VOICE_IDS[i % VOICE_IDS.length]);
      }
    });
  }, [bots]);

  // Init AudioContext on first interaction
  const ensureAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Play spatial TTS for a message
  const playSpatialTTS = useCallback(async (msg: SpatialMessage) => {
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
    if (!apiKey) return;

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
          text: msg.content.slice(0, 200), // limit text length
          model_id: "eleven_turbo_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (!response.ok) return;

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Create spatial audio source
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "exponential";
      panner.refDistance = 5;
      panner.maxDistance = 50;
      panner.rolloffFactor = 1.5;
      panner.setPosition(msg.posX, 0, msg.posZ);

      // Update listener position
      if (ctx.listener.positionX) {
        ctx.listener.positionX.value = listenerPos.x;
        ctx.listener.positionY.value = 5;
        ctx.listener.positionZ.value = listenerPos.z;
      }

      const gain = ctx.createGain();
      gain.gain.value = 0.6;

      source.connect(panner).connect(gain).connect(ctx.destination);
      source.start();
    } catch (err) {
      console.error("Spatial TTS error:", err);
    }
  }, [ensureAudioCtx, listenerPos]);

  // Watch for new speech messages — fire-and-forget, multiple simultaneous sources
  useEffect(() => {
    if (!enabled) return;

    for (const msg of messages) {
      if (msg.type !== "speech") continue;
      if (msg.senderId === "user") continue;
      if (processedIdsRef.current.has(msg._id)) continue;
      if (Date.now() - msg.createdAt > 10000) continue; // skip old messages

      processedIdsRef.current.add(msg._id);
      // Fire-and-forget — don't await, don't block other audio
      playSpatialTTS(msg).catch(() => {});
    }

    // Cleanup old processed IDs
    if (processedIdsRef.current.size > 200) {
      const arr = Array.from(processedIdsRef.current);
      processedIdsRef.current = new Set(arr.slice(-100));
    }
  }, [messages, enabled, playSpatialTTS]);

  // Cleanup
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);
}
