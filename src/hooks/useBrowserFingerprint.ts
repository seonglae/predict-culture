"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "crash-arena-ip";

export function useBrowserFingerprint(): string | null {
  const [ip, setIp] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setIp(stored);
    }

    // Always fetch fresh IP (updates stored value if changed)
    fetch("/api/ip")
      .then((res) => res.json())
      .then((data) => {
        if (data.ip && data.ip !== "unknown") {
          localStorage.setItem(STORAGE_KEY, data.ip);
          setIp(data.ip);
        } else if (!stored) {
          // Fallback: generate a random ID
          const fallback = `anon-${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem(STORAGE_KEY, fallback);
          setIp(fallback);
        }
      })
      .catch(() => {
        if (!stored) {
          const fallback = `anon-${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem(STORAGE_KEY, fallback);
          setIp(fallback);
        }
      });
  }, []);

  return ip;
}
