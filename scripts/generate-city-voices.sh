#!/usr/bin/env bash
# Generate robotic city name voice clips using ElevenLabs + ffmpeg post-processing.
#
# Usage:
#   ELEVENLABS_API_KEY=your_key ./scripts/generate-city-voices.sh
#
# Prerequisites:
#   - ffmpeg installed (brew install ffmpeg)
#   - ElevenLabs API key
#
# Output: public/audio/city_*.mp3

set -euo pipefail

API_KEY="${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY}"
VOICE_ID="SOYHLrjzK2X1ezoPC6cr"  # Harry — deep, clear
OUTPUT_DIR="public/audio"
TEMP_DIR=$(mktemp -d)

mkdir -p "$OUTPUT_DIR"

# City names — spoken as cold, robotic announcements
KEYS="new_york london paris tokyo singapore los_angeles san_francisco"
text_new_york="New York. Times Square."
text_london="London. Trafalgar Square."
text_paris="Paris. Rue de Rivoli."
text_tokyo="Tokyo. Shibuya Crossing."
text_singapore="Singapore. Marina Bay."
text_los_angeles="Los Angeles. Downtown."
text_san_francisco="San Francisco. Union Square."

# Robotic ffmpeg filter — pitch down, bass boost, echo, compression
FILTER="asetrate=44100*0.85,\
equalizer=f=150:g=5,\
equalizer=f=2500:g=3,\
acompressor=threshold=-15dB:ratio=8:attack=5:release=50,\
highpass=f=80,\
aecho=0.8:0.4:25:0.25,\
chorus=0.5:0.9:50|60:0.4|0.32:0.25|0.4:2|1.3,\
alimiter=limit=0.95"

for key in $KEYS; do
  echo "Generating: $key"
  varname="text_${key}"
  text="${!varname}"
  raw_file="$TEMP_DIR/${key}_raw.mp3"
  out_file="$OUTPUT_DIR/city_${key}.mp3"

  # Skip if already exists
  if [[ -f "$out_file" ]]; then
    echo "  -> Already exists, skipping"
    continue
  fi

  # ElevenLabs API call
  curl -s -X POST \
    "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \
    -H "xi-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"$text\",
      \"model_id\": \"eleven_multilingual_v2\",
      \"voice_settings\": {
        \"stability\": 0.2,
        \"similarity_boost\": 0.15,
        \"style\": 0.7,
        \"use_speaker_boost\": true
      }
    }" \
    --output "$raw_file"

  # Check if we got valid audio (not an error JSON)
  if file "$raw_file" | grep -q "text"; then
    echo "  -> ERROR: API returned text, not audio. Check API key/quota."
    cat "$raw_file"
    continue
  fi

  # ffmpeg post-processing — robotic/futuristic filter
  ffmpeg -y -i "$raw_file" \
    -af "$FILTER" \
    -ar 44100 -ac 1 -b:a 128k \
    "$out_file" 2>/dev/null

  echo "  -> $out_file"
  sleep 0.5  # rate limiting
done

rm -rf "$TEMP_DIR"
echo "Done! Generated city voice clips in $OUTPUT_DIR/"
