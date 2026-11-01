"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TAVLE_VINDU } from "./openTavleVindu";
import { tekst } from "./tekst";
import { useHideCursor } from "./useHideCursor";
import { usePresentasjon } from "./usePresentasjon";
import { useWakeLock } from "./useWakeLock";
import "./storskjerm.css";

/** Samler tavlevisningen (`?visning=tavle`) for storskjerm-ruta: skjuler
 * pekeren, holder skjermen våken og lar F veksle fullskjerm. Returnerer om
 * siden er i tavlevisning (brukes til rot-klassen `presentasjon`). */
export function useTavlevisning(): boolean {
  const presentasjon = usePresentasjon();
  useHideCursor(presentasjon);
  useWakeLock(presentasjon);
  useEffect(() => {
    if (!presentasjon) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [presentasjon]);
  return presentasjon;
}

/** Liten «Avslutt storskjerm»-knapp, usynlig til hover. Går ut av fullskjerm;
 * i eget skjerm-vindu lukkes vinduet, ellers går vi tilbake til vertssiden. */
export function AvsluttTavle({ hostHref }: { hostHref: string }) {
  const router = useRouter();
  const avslutt = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if (window.name === TAVLE_VINDU && window.opener) window.close();
    else router.push(hostHref);
  };
  return (
    <button
      type="button"
      className="storskjerm-btn presentasjon-avslutt"
      onClick={avslutt}
    >
      {tekst.tavle.avslutt}
    </button>
  );
}
