import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { audioBase64 } = await req.json();
  if (!audioBase64) {
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  try {
    // Use Mistral's Pixtral/audio endpoint for STT
    // Voxtral endpoint: POST with audio data
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const blob = new Blob([audioBuffer], { type: "audio/webm" });

    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    formData.append("model", "voxtral-mini-latest");

    // Try Mistral audio transcription API
    const response = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({ transcript: data.text ?? "" });
    }

    // Fallback: use Web Speech API suggestion (client-side)
    // Return empty transcript to not block the UI
    return NextResponse.json({ transcript: "" });
  } catch (err) {
    console.error("STT error:", err);
    return NextResponse.json({ transcript: "" });
  }
}
