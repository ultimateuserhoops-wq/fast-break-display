import { useCallback, useEffect, useState } from "react";

// Display-side toggles for an OBS scoreboard (no shared DB state needed — these live on the
// machine running OBS): press H (or the on-screen button) to hide/show the shot clock, F to
// toggle fullscreen. The hidden state persists per court so it survives a scene reload. Hiding
// only affects the 24s shot clock — useful when a separate device is running it.
export function useObsToggles(courtId: string) {
  const key = `bdc_hideshot_${courtId}`;
  const [hideShot, setHideShot] = useState(() => typeof window !== "undefined" && localStorage.getItem(key) === "1");
  const toggleShot = useCallback(() => {
    setHideShot((v) => { const n = !v; try { localStorage.setItem(key, n ? "1" : "0"); } catch { /* ignore */ } return n; });
  }, [key]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "h" || e.key === "H") {
        toggleShot();
      } else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleShot]);
  return { hideShot, toggleShot };
}

// Ordinal period label that understands overtime (Q5+ → OT, OT2, …).
export function periodLabel(q: number): string {
  if (q >= 5) return q === 5 ? "OT" : `OT${q - 4}`;
  return ["", "1ST", "2ND", "3RD", "4TH"][q] ?? `${q}TH`;
}
