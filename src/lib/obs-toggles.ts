import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Shot-clock visibility toggle for an OBS scoreboard — press H (or an on-screen button, on either
// the display itself OR the control panel) to hide/show the 24s shot clock. Useful when a separate
// device is running the shot clock and you don't want it duplicated on the main display.
//
// The control panel and the OBS display are usually DIFFERENT machines, so this can't be plain
// localStorage (a click on the control laptop would never reach the display PC). It rides the same
// per-court storage-JSON signal + instant local pub/sub + stale-write guard as team possession
// (see possession.ts) — whichever device toggles it, every device polling this court picks it up.
const BUCKET = "team-photos";
const PREFIX = "shotvis";
const filePath = (courtId: string) => `${PREFIX}/${courtId}.json`;

const cache = new Map<string, boolean>(); // true = hidden
const lastSetTs = new Map<string, number>();
const subs = new Map<string, Set<(hidden: boolean) => void>>();

function notify(courtId: string, hidden: boolean) {
  cache.set(courtId, hidden);
  subs.get(courtId)?.forEach((fn) => fn(hidden));
}

async function writeHidden(courtId: string, hidden: boolean) {
  const ts = Date.now();
  lastSetTs.set(courtId, ts);
  notify(courtId, hidden); // instant on this device
  try {
    const body = new Blob([JSON.stringify({ hidden, ts })], { type: "application/json" });
    const { error } = await supabase.storage.from(BUCKET).upload(filePath(courtId), body, { upsert: true, contentType: "application/json" });
    if (error) throw error;
  } catch { /* offline / storage hiccup — local state already reflects it */ }
}

// Cross-device state + toggle only — no keyboard bindings. Use this on the CONTROL panel (a
// button next to the shot clock), where H/F would otherwise collide with the panel's own hotkeys
// (e.g. "f" is already "reset shot clock to 14s" there).
export function useShotClockVisible(courtId: string, pollMs = 1500) {
  const [hideShot, setHideShot] = useState(() => cache.get(courtId) ?? false);

  const toggleShot = useCallback(() => {
    const next = !(cache.get(courtId) ?? hideShot);
    writeHidden(courtId, next);
  }, [courtId, hideShot]);

  useEffect(() => {
    let active = true;
    let set = subs.get(courtId);
    if (!set) { set = new Set(); subs.set(courtId, set); }
    const fn = (hidden: boolean) => { if (active) setHideShot(hidden); };
    set.add(fn);

    const base = supabase.storage.from(BUCKET).getPublicUrl(filePath(courtId)).data.publicUrl;
    const load = async () => {
      try {
        const r = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok || !active) return;
        const j: { hidden?: boolean; ts?: number } = await r.json();
        // Don't let a stale poll clobber a toggle made moments ago on this (or another) device.
        if ((j.ts ?? 0) >= (lastSetTs.get(courtId) ?? 0)) {
          cache.set(courtId, !!j.hidden);
          setHideShot(!!j.hidden);
        }
      } catch { /* no signal set yet — defaults to visible */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; set!.delete(fn); clearInterval(id); };
  }, [courtId, pollMs]);

  return { hideShot, toggleShot };
}

// Display-side wrapper: same shared state, plus H (toggle shot clock) / F (fullscreen) keys —
// only bound on the OBS display pages themselves, never on the control panel.
export function useObsToggles(courtId: string, pollMs = 1500) {
  const { hideShot, toggleShot } = useShotClockVisible(courtId, pollMs);

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
