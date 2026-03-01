#!/usr/bin/env bash
# Generate robotic/futuristic voice clips using ElevenLabs + ffmpeg post-processing.
#
# Usage:
#   ELEVENLABS_API_KEY=your_key ./scripts/generate-voice.sh
#
# Prerequisites:
#   - ffmpeg installed (brew install ffmpeg)
#   - ElevenLabs API key with v3 model access
#
# Output: public/audio/*.mp3

set -euo pipefail

API_KEY="${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY}"
VOICE_ID="SOYHLrjzK2X1ezoPC6cr"  # Harry — deep, clear
OUTPUT_DIR="public/audio"
TEMP_DIR=$(mktemp -d)

mkdir -p "$OUTPUT_DIR"

# Lines to generate
declare -A LINES
LINES[finding_opponent]="Scanning for opponent... standby."
LINES[match_found]="Target acquired. Engage."
LINES[collision_detected]="Impact detected. Collision confirmed."
LINES[victory]="Superior prediction. You win."
LINES[defeat]="Prediction failed. Recalibrate."
LINES[draw]="Inconclusive. Stalemate."
LINES[predict_now]="Mark your prediction. Time is limited."
LINES[simulation_start]="Simulation initiated. Observe traffic patterns."

# Robotic ffmpeg filter chain — futuristic, cold, processed
FILTER="asetrate=44100*0.8,\
equalizer=f=150:g=6,\
equalizer=f=3000:g=4,\
acompressor=threshold=-15dB:ratio=8:attack=5:release=50,\
highpass=f=80,\
aecho=0.8:0.5:30:0.3,\
chorus=0.5:0.9:50|60:0.4|0.32:0.25|0.4:2|1.3,\
alimiter=limit=0.95"

for key in "${!LINES[@]}"; do
  echo "Generating: $key"
  text="${LINES[$key]}"
  raw_file="$TEMP_DIR/${key}_raw.mp3"
  out_file="$OUTPUT_DIR/${key}.mp3"

  # ElevenLabs API call
  curl -s -X POST \
    "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \
    -H "xi-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"$text\",
      \"model_id\": \"eleven_multilingual_v2\",
      \"voice_settings\": {
        \"stability\": 0.15,
        \"similarity_boost\": 0.1,
        \"style\": 0.8,
        \"use_speaker_boost\": true
      }
    }" \
    --output "$raw_file"

  # ffmpeg post-processing — robotic/futuristic filter
  ffmpeg -y -i "$raw_file" \
    -af "$FILTER" \
    -ar 44100 -ac 1 -b:a 128k \
    "$out_file" 2>/dev/null

  echo "  -> $out_file"
  sleep 0.5  # rate limiting
done

rm -rf "$TEMP_DIR"
echo "Done! Generated ${#LINES[@]} voice clips in $OUTPUT_DIR/"
