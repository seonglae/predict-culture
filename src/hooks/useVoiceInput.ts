"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
}

// Extend Window for webkitSpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const usedBrowserSTT = useRef(false);

  const startRecording = useCallback(async () => {
    usedBrowserSTT.current = false;

    // Try browser SpeechRecognition first (instant, free, no API)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const text = event.results[0]?.[0]?.transcript;
          if (text?.trim()) {
            usedBrowserSTT.current = true;
            onTranscript(text.trim());
          }
        };
        recognition.onerror = () => {};
        recognition.onend = () => setIsRecording(false);

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
        return;
      } catch {
        // Fall through to MediaRecorder + server STT
      }
    }

    // Fallback: MediaRecorder → server-side Voxtral STT
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (usedBrowserSTT.current) return;

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) return;

        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        try {
          const res = await fetch("/api/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: base64 }),
          });
          if (res.ok) {
            const { transcript } = await res.json();
            if (transcript?.trim()) onTranscript(transcript.trim());
          }
        } catch (err) {
          console.error("STT failed:", err);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    // Stop browser SpeechRecognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    // Stop MediaRecorder
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return { isRecording, startRecording, stopRecording };
}
