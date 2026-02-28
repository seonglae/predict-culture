"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";

// Simplex noise — compact 2D implementation
class SimplexNoise {
  private perm: Uint8Array;
  private grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];

  constructor(seed: number = 0) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const gi = this.perm[ii + this.perm[jj]] % 12;
      n0 = t0 * t0 * (this.grad3[gi][0] * x0 + this.grad3[gi][1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const gi = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
      n1 = t1 * t1 * (this.grad3[gi][0] * x1 + this.grad3[gi][1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const gi = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
      n2 = t2 * t2 * (this.grad3[gi][0] * x2 + this.grad3[gi][1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  fbm(x: number, y: number, octaves: number = 4): number {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += this.noise2D(x * freq, y * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return val / max;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  sat: number;
  light: number;
  size: number;
  layer: number;
}

export function WaveField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const themeRef = useRef(isDark);
  const flushRef = useRef(false);

  // Detect theme change → schedule immediate background flush
  if (themeRef.current !== isDark) {
    themeRef.current = isDark;
    flushRef.current = true;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const noise1 = new SimplexNoise(42);
    const noise2 = new SimplexNoise(137);

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    let mouseX = width / 2;
    let mouseY = height / 2;
    let mouseActive = false;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      mouseActive = true;
    };
    const onLeave = () => { mouseActive = false; };

    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    // Palette — teal, violet, rose, cyan
    const huePool = [168, 172, 176, 255, 262, 270, 320, 328, 190, 195];

    const COUNT = 4000;
    const particles: Particle[] = [];

    const spawn = (layer: number): Particle => {
      const hue = huePool[Math.floor(Math.random() * huePool.length)];
      const maxLife = 300 + Math.random() * 500;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: 0,
        life: Math.random() * maxLife,
        maxLife,
        hue,
        sat: 55 + Math.random() * 35,
        light: layer === 0 ? 15 + Math.random() * 12 : layer === 1 ? 28 + Math.random() * 18 : 45 + Math.random() * 25,
        size: layer === 0 ? 1.8 + Math.random() * 1.2 : layer === 1 ? 1 + Math.random() * 0.8 : 0.4 + Math.random() * 0.8,
        layer,
      };
    };

    // 3 layers: background (dim/large), mid (flow), foreground (bright/small)
    for (let i = 0; i < COUNT; i++) {
      const layer = i < 1000 ? 0 : i < 3000 ? 1 : 2;
      particles.push(spawn(layer));
    }

    let time = 0;
    const FLOW_SCALE = 0.0018;
    const FLOW_SCALE_2 = 0.0035;
    const TIME_SCALE = 0.0006;

    const animate = () => {
      time++;
      const t = time * TIME_SCALE;
      const dark = themeRef.current;

      // Instant background flush on theme change
      if (flushRef.current) {
        flushRef.current = false;
        ctx.fillStyle = dark ? "#06060c" : "#f8f7f4";
        ctx.fillRect(0, 0, width, height);
      }

      // Fade trail
      ctx.fillStyle = dark ? "rgba(6, 6, 12, 0.045)" : "rgba(248, 247, 244, 0.08)";
      ctx.fillRect(0, 0, width, height);

      for (const p of particles) {
        p.life++;
        if (p.life > p.maxLife) {
          Object.assign(p, spawn(p.layer));
          p.life = 0;
          continue;
        }

        // Flow field from noise
        const layerSpeed = p.layer === 0 ? 0.6 : p.layer === 1 ? 1.1 : 1.8;
        const scale = p.layer === 0 ? FLOW_SCALE * 0.6 : p.layer === 1 ? FLOW_SCALE : FLOW_SCALE_2;

        const n1 = noise1.fbm(p.x * scale, p.y * scale + t, 3);
        const n2 = noise2.fbm(p.x * scale + t * 0.4, p.y * scale, 3);

        // Wave interference — standing wave pattern
        const wave1 = Math.sin(p.x * 0.006 + t * 1.8) * Math.cos(p.y * 0.005 - t * 1.2);
        const wave2 = Math.sin((p.x + p.y) * 0.004 + t * 0.9) * 0.4;
        const wave = (wave1 + wave2) * 0.4;

        const angle = n1 * Math.PI * 2 + wave;
        const mag = (0.4 + Math.abs(n2) * 0.6) * layerSpeed;

        p.vx += Math.cos(angle) * mag * 0.12;
        p.vy += Math.sin(angle) * mag * 0.12;

        // Mouse repulsion
        if (mouseActive) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const distSq = dx * dx + dy * dy;
          const radius = 180;
          if (distSq < radius * radius && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const force = ((radius - dist) / radius) * 0.6;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        // Damping
        p.vx *= 0.94;
        p.vy *= 0.94;

        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < -10) p.x += width + 20;
        if (p.x > width + 10) p.x -= width + 20;
        if (p.y < -10) p.y += height + 20;
        if (p.y > height + 10) p.y -= height + 20;

        // Life alpha (fade in/out)
        const lr = p.life / p.maxLife;
        const fadeIn = Math.min(lr * 6, 1);
        const fadeOut = lr > 0.75 ? Math.max(1 - (lr - 0.75) / 0.25, 0) : 1;
        const alpha = fadeIn * fadeOut;

        // Speed-based brightness
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const brightness = Math.min(p.light + speed * 10, 82);

        // Draw trail line + head
        if (speed > 0.3) {
          const trailLen = Math.min(speed * 4, 12);
          const nx = p.vx / speed;
          const ny = p.vy / speed;
          ctx.beginPath();
          ctx.moveTo(p.x - nx * trailLen, p.y - ny * trailLen);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `hsla(${p.hue}, ${p.sat}%, ${brightness}%, ${alpha * 0.35})`;
          ctx.lineWidth = p.size * 0.6;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + speed * 0.15), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${dark ? brightness : Math.max(10, brightness - 30)}%, ${alpha * (dark ? 0.65 : 0.45)})`;
        ctx.fill();
      }

      // Crackling static — jagged discharge lines
      if (Math.random() < 0.04) {
        const cx = Math.random() * width;
        const cy = Math.random() * height;
        const hue = huePool[Math.floor(Math.random() * huePool.length)];
        const len = 15 + Math.random() * 50;
        const baseAngle = Math.random() * Math.PI * 2;
        const segs = 3 + Math.floor(Math.random() * 5);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        let px = cx, py = cy;
        for (let s = 0; s < segs; s++) {
          const segLen = len / segs;
          px += Math.cos(baseAngle + (Math.random() - 0.5) * 2) * segLen;
          py += Math.sin(baseAngle + (Math.random() - 0.5) * 2) * segLen;
          ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `hsla(${hue}, 75%, 60%, ${0.15 + Math.random() * 0.25})`;
        ctx.lineWidth = 0.4 + Math.random() * 0.8;
        ctx.stroke();
      }

      // Bright cluster flashes
      if (Math.random() < 0.025) {
        const cx = Math.random() * width;
        const cy = Math.random() * height;
        const hue = huePool[Math.floor(Math.random() * huePool.length)];
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * 25;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.3 + Math.random() * 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${0.2 + Math.random() * 0.35})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    // Initial fill
    ctx.fillStyle = themeRef.current ? "#06060c" : "#f8f7f4";
    ctx.fillRect(0, 0, width * dpr, height * dpr);

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
    />
  );
}
