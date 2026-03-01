# Predict Culture

AI culture propagation simulation where autonomous bots debate beliefs in real 3D cities powered by Mistral AI.

**Live Demo:** [predictculture.vercel.app](https://predictculture.vercel.app)

## What is this?

Bots with randomly generated cultural beliefs (e.g., "pineapple on pizza is sacred") walk around real OpenStreetMap cities, approach each other, and debate using Mistral AI. Each bot has a country identity and national pride. Users predict which belief will dominate, then watch the culture war unfold in real-time 3D.

### Game Flow

1. **Enter name** — Your country flag is auto-detected via geolocation
2. **Matchmaking** — Join a room (up to 10 players), a random city is loaded from OSM
3. **Predict** — Type your prediction or pick a bot's belief you think will win
4. **Watch** — Bots autonomously walk, talk, and persuade each other via Mistral AI tool-calling
5. **Results** — On-device semantic similarity scoring (ONNX embeddings) + Glicko-2 ELO rating

## Architecture

```
Browser                          Server
┌─────────────────────┐          ┌──────────────────────┐
│  Next.js 16 + R3F   │◄────────►│  Convex (real-time)  │
│  Three.js 3D scene  │ websocket│  Schema + Mutations  │
│  Framer Motion UI   │          │  Live Queries        │
│                     │          ├──────────────────────┤
│  On-device ONNX     │          │  Mistral AI Actions  │
│  (transformers.js)  │          │  - Bot agent loop    │
│  WebGPU/WASM        │          │  - Belief generation │
│                     │          │  - Scene generation  │
│  Web Speech API TTS │          │  - Voxtral STT       │
│  MediaRecorder STT  │          │  - OSM data fetch    │
└─────────────────────┘          └──────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| 3D Rendering | Three.js, React Three Fiber, drei |
| Backend | Convex (real-time database + serverless actions) |
| AI Agent | Mistral AI (`mistral-small-latest`) with function calling |
| Speech-to-Text | Voxtral (`voxtral-mini-latest`) via `/api/stt` |
| Text-to-Speech | Browser Web Speech API (SpeechSynthesis) |
| Embeddings | `Xenova/all-MiniLM-L6-v2` ONNX via `@huggingface/transformers`, WebGPU/WASM |
| Map Data | OpenStreetMap Overpass API (roads, buildings, water) |
| Rating System | Glicko-2 (player vs house) |
| Geolocation | Vercel `x-vercel-ip-country` header |
| UI | Tailwind CSS 4, Framer Motion |
| Deployment | Vercel (frontend) + Convex Cloud (backend) |

## Key Features

### AI Bot Agent Loop
Each bot runs a round-robin turn via Mistral AI with 5 tools:
- `move_to(x, z)` — Walk toward other bots (collision avoidance with buildings + bot overlap nudging)
- `speech(message, target?)` — Persuade nearby bots (proximity-based, 15-unit range)
- `think(thought)` — Internal reasoning (visible in Trace tab)
- `get_state()` — See all bots' beliefs and positions
- `change_belief(new_belief, reason)` — Switch belief when persuaded

### On-Device Semantic Similarity
Predictions are scored client-side using `Xenova/all-MiniLM-L6-v2` ONNX model:
- WebGPU acceleration when available, WASM fallback
- Cosine similarity between user prediction embedding and all bot final belief embeddings
- No server round-trip for scoring

### Real-Time 3D City
- OpenStreetMap data rendered as 3D polyline roads, extruded buildings, water bodies
- Procedural bot models (RoundedBox body + sphere head + eyes)
- Speech bubbles floating above bots
- Orbit camera controls (top-down only, 20-60 degree polar range)

### Sidebar
- **Chat** — All speech messages (move/think filtered to Trace only)
- **Beliefs** — Live belief state per bot with change history
- **Trace** — Full agent decision log (move, think, speech, change_belief)

## Project Structure

```
src/
├── app/                        # Next.js routes
│   ├── api/geo/route.ts        # Country flag from IP
│   ├── api/stt/route.ts        # Voxtral speech-to-text
│   └── leaderboard/page.tsx    # ELO leaderboard page
├── components/
│   ├── arena/ArenaPage.tsx     # Main game page (phase state machine)
│   ├── scene/CultureScene.tsx  # 3D city scene
│   ├── scene/Bots.tsx          # Bot 3D models + animation
│   └── culture/CultureSidebar.tsx  # Chat/Beliefs/Trace tabs
├── hooks/
│   ├── useVoiceInput.ts        # Hold-to-talk MediaRecorder
│   └── useSpatialAudio.ts      # TTS via Web Speech API
└── lib/
    ├── embeddings.ts           # On-device ONNX similarity
    ├── elo.ts → convex/lib/    # Glicko-2 rating
    └── sfx.ts                  # Sound effects

convex/
├── schema.ts                   # players, cultures, bots, cultureMessages, ratingHistory
├── cultures.ts                 # Room joining, game lifecycle, predictions
├── players.ts                  # Glicko-2 rating CRUD
├── actions/
│   ├── cultureAgent.ts         # Mistral AI bot agent loop
│   └── generateCultureScene.ts # OSM fetch + bot spawn + belief generation
└── lib/
    ├── elo.ts                  # Glicko-2 algorithm
    └── cityData.ts             # City configs (Paris, Tokyo, NYC, etc.)
```

## Setup

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.local.example .env.local
# MISTRAL_API_KEY=your_mistral_key
# NEXT_PUBLIC_CONVEX_URL=your_convex_url

# Start Convex backend
npx convex dev

# Start Next.js frontend
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|------------|
| `MISTRAL_API_KEY` | Mistral AI API key (bot agents + STT) |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |
| `NEXT_PUBLIC_ELEVENLABS_API_KEY` | (Optional) ElevenLabs TTS — falls back to Web Speech API |

## License

MIT
