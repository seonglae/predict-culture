"use client";

/**
 * Dark, mechanical, low-frequency sound design.
 * All sounds route through a shared reverb bus for cohesive atmosphere.
 */

let audioCtx: AudioContext | null = null;
let reverbNode: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Build impulse response for dark plate reverb */
function buildReverb(ctx: AudioContext): ConvolverNode {
  const rate = ctx.sampleRate;
  const length = rate * 2.5; // 2.5s reverb tail
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const decay = Math.exp(-t * 3.5);
      const lpDecay = Math.exp(-t * 6);
      data[i] = (Math.random() * 2 - 1) * decay * (0.4 + 0.6 * lpDecay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/** Get shared reverb send bus */
function getReverb(): { dry: AudioNode; wet: GainNode } {
  const ctx = getCtx();
  if (!reverbNode) {
    reverbNode = buildReverb(ctx);
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.3;
    reverbNode.connect(reverbGain);
    reverbGain.connect(ctx.destination);
  }
  return { dry: ctx.destination, wet: reverbGain! };
}

// City name → audio file key mapping
const CITY_AUDIO_MAP: Record<string, string> = {
  "New York": "new_york",
  "London": "london",
  "Paris": "paris",
  "Tokyo": "tokyo",
  "Singapore": "singapore",
  "Los Angeles": "los_angeles",
  "San Francisco": "san_francisco",
};

/**
 * Play pre-recorded city voice clip (ElevenLabs + ffmpeg processed).
 * Returns a stop handle.
 */
export function playCityVoice(cityName: string): { stop: () => void } {
  const key = CITY_AUDIO_MAP[cityName];
  if (!key) return { stop: () => {} };

  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(`/audio/city_${key}.mp3`);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch {
    // silent fail
  }
  return {
    stop: () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    },
  };
}

export function warmUpAudio() {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    getReverb();
  } catch {
    // silent fail
  }
}

/**
 * Vehicle collision — short heavy impact. No screech/whistle.
 */
export function playCrash() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Heavy bass thud
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(55, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + 0.3);
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.4);

    // Metal crunch — short noise burst, low-passed
    const crunchBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const crunchData = crunchBuf.getChannelData(0);
    for (let i = 0; i < crunchData.length; i++) {
      crunchData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    }
    const crunch = ctx.createBufferSource();
    crunch.buffer = crunchBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    const crunchGain = ctx.createGain();
    crunchGain.gain.value = 0.4;
    crunch.connect(lp);
    lp.connect(crunchGain);
    crunchGain.connect(ctx.destination);
    crunch.start(now);
  } catch {
    // silent fail
  }
}

/**
 * Tire screech — low-mid filtered noise, gritty
 */
export function playTireScreech() {
  try {
    const ctx = getCtx();
    const { dry } = getReverb();
    const now = ctx.currentTime;
    const len = 0.5;

    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.2));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(800, now);
    bp.frequency.exponentialRampToValueAtTime(400, now + len);
    bp.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + len);

    noise.connect(bp);
    bp.connect(gain);
    gain.connect(dry);
    gain.connect(reverbNode!);
    noise.start(now);
  } catch {
    // silent fail
  }
}

/**
 * Battle BGM — city traffic ambience: engine hum, road noise, occasional honks.
 * Returns stop() handle.
 */
export function playBattleBGM(): { stop: () => void } {
  const nodes: { osc?: OscillatorNode; gain: GainNode; src?: AudioBufferSourceNode }[] = [];

  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Layer 1: Engine idle rumble — low frequency drone
    const engine = ctx.createOscillator();
    const engineGain = ctx.createGain();
    engine.type = "sawtooth";
    engine.frequency.value = 42;
    const engineLP = ctx.createBiquadFilter();
    engineLP.type = "lowpass";
    engineLP.frequency.value = 100;
    engineGain.gain.setValueAtTime(0, now);
    engineGain.gain.linearRampToValueAtTime(0.05, now + 2);
    engine.connect(engineLP);
    engineLP.connect(engineGain);
    engineGain.connect(ctx.destination);
    engine.start(now);
    nodes.push({ osc: engine, gain: engineGain });

    // Layer 2: Road/tire noise — filtered broadband noise, continuous
    const roadDur = 120;
    const roadBuf = ctx.createBuffer(1, ctx.sampleRate * roadDur, ctx.sampleRate);
    const roadData = roadBuf.getChannelData(0);
    for (let i = 0; i < roadData.length; i++) {
      const t = i / ctx.sampleRate;
      // Slow amplitude variation for realism
      const mod = 0.6 + 0.4 * Math.sin(t * 0.15) * Math.sin(t * 0.07);
      roadData[i] = (Math.random() * 2 - 1) * 0.02 * mod;
    }
    const roadSrc = ctx.createBufferSource();
    roadSrc.buffer = roadBuf;
    const roadLP = ctx.createBiquadFilter();
    roadLP.type = "lowpass";
    roadLP.frequency.value = 800;
    const roadHP = ctx.createBiquadFilter();
    roadHP.type = "highpass";
    roadHP.frequency.value = 60;
    const roadGain = ctx.createGain();
    roadGain.gain.setValueAtTime(0, now);
    roadGain.gain.linearRampToValueAtTime(1, now + 3);
    roadSrc.connect(roadHP);
    roadHP.connect(roadLP);
    roadLP.connect(roadGain);
    roadGain.connect(ctx.destination);
    roadSrc.start(now);
    nodes.push({ src: roadSrc, gain: roadGain });

    // Layer 3: Distant engine pass-bys — slow sweeping filtered noise
    const passDur = 120;
    const passBuf = ctx.createBuffer(1, ctx.sampleRate * passDur, ctx.sampleRate);
    const passData = passBuf.getChannelData(0);
    for (let i = 0; i < passData.length; i++) {
      const t = i / ctx.sampleRate;
      // Intermittent "whoosh" patterns
      const whoosh = Math.max(0, Math.sin(t * 0.5) * Math.sin(t * 0.23));
      passData[i] = (Math.random() * 2 - 1) * 0.015 * whoosh;
    }
    const passSrc = ctx.createBufferSource();
    passSrc.buffer = passBuf;
    const passLP = ctx.createBiquadFilter();
    passLP.type = "bandpass";
    passLP.frequency.value = 200;
    passLP.Q.value = 0.5;
    const passGain = ctx.createGain();
    passGain.gain.setValueAtTime(0, now);
    passGain.gain.linearRampToValueAtTime(1, now + 4);
    passSrc.connect(passLP);
    passLP.connect(passGain);
    passGain.connect(ctx.destination);
    passSrc.start(now);
    nodes.push({ src: passSrc, gain: passGain });

  } catch {
    // silent fail
  }

  return {
    stop: () => {
      try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        for (const node of nodes) {
          node.gain.gain.cancelScheduledValues(now);
          node.gain.gain.linearRampToValueAtTime(0, now + 0.5);
          if (node.osc) node.osc.stop(now + 0.6);
          if (node.src) node.src.stop(now + 0.6);
        }
      } catch {
        // silent fail
      }
    },
  };
}

/**
 * Matchmaking ambient — continuous low mechanical hum ("위이잉").
 * Runs indefinitely until stop() is called.
 */
export function playMatchmakingAmbient(): { stop: () => void } {
  const nodes: { osc?: OscillatorNode; gain: GainNode }[] = [];
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Continuous deep mechanical hum
    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.type = "sawtooth";
    hum.frequency.value = 38;
    const humLP = ctx.createBiquadFilter();
    humLP.type = "lowpass";
    humLP.frequency.value = 120;
    humGain.gain.setValueAtTime(0, now);
    humGain.gain.linearRampToValueAtTime(0.04, now + 1);
    // No scheduled fadeout — runs until stop()
    hum.connect(humLP);
    humLP.connect(humGain);
    humGain.connect(ctx.destination);
    hum.start(now);
    nodes.push({ osc: hum, gain: humGain });

    // Slow LFO throb for gentle pulsing character
    const throb = ctx.createOscillator();
    const throbGain = ctx.createGain();
    throb.type = "sine";
    throb.frequency.value = 28;
    const throbLP = ctx.createBiquadFilter();
    throbLP.type = "lowpass";
    throbLP.frequency.value = 80;
    throbGain.gain.setValueAtTime(0, now);
    throbGain.gain.linearRampToValueAtTime(0.03, now + 2);
    // Amplitude modulation for pulse effect
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.3;
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(throbGain.gain);
    throb.connect(throbLP);
    throbLP.connect(throbGain);
    throbGain.connect(ctx.destination);
    throb.start(now);
    lfo.start(now);
    // No stop scheduled — runs until stop()
    nodes.push({ osc: throb, gain: throbGain });
  } catch {
    // silent fail
  }

  return {
    stop: () => {
      try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        for (const node of nodes) {
          node.gain.gain.cancelScheduledValues(now);
          node.gain.gain.linearRampToValueAtTime(0, now + 0.3);
          if (node.osc) node.osc.stop(now + 0.4);
        }
      } catch {
        // silent fail
      }
    },
  };
}
