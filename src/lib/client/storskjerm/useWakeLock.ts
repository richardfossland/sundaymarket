"use client";

import { useEffect } from "react";

interface SentinelLike {
  release: () => Promise<void>;
}

/** Holder skjermen våken mens `enabled` (projektor/TV skal ikke dimme midt i
 * en runde). Leasen frigis av nettleseren når fanen skjules, så vi henter
 * den på nytt når fanen blir synlig igjen. Feiler stille uten støtte. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: SentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await (
          navigator as unknown as {
            wakeLock: { request: (t: "screen") => Promise<SentinelLike> };
          }
        ).wakeLock.request("screen");
        if (cancelled) void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        // Nektet (lavt batteri, ikke synlig) — ikke kritisk.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
