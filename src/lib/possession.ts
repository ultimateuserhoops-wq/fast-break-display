import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Team possession / alternating-possession arrow (per court).

   The managed game_state table can't get a new column with the operator key, so possession
   rides the same storage-JSON transport as break/footage (a tiny per-court file the OBS
   displays poll). On top of that we keep an in-memory pub/sub so the control buttons flip
   instantly on the same device, and a short "just set locally" guard so a slow poll can't
   revert a fresh change. */

const BUCKET = "team-photos";
const PREFIX = "possession";
const filePath = (courtId: string) => `${PREFIX}/${courtId}.json`;

export type PossSide = "home" | "away" | null;
type Poss = { side: PossSide; ts: number };

const cache = new Map<string, PossSide>();
const lastSetTs = new Map<string, number>();
const subs = new Map<string, Set<(s: PossSide) => void>>();

function notify(courtId: string, side: PossSide) {
  cache.set(courtId, side);
  subs.get(courtId)?.forEach((fn) => fn(side));
}

export async function setPossession(courtId: string, side: PossSide): Promise<void> {
  const ts = Date.now();
  lastSetTs.set(courtId, ts);
  notify(courtId, side); // instant on this device
  try {
    const body = new Blob([JSON.stringify({ side, ts })], { type: "application/json" });
    const { error } = await supabase.storage.from(BUCKET).upload(filePath(courtId), body, { upsert: true, contentType: "application/json" });
    if (error) throw error;
  } catch { /* offline / storage hiccup — local state already reflects it */ }
}

// Click a side: set it, or clear if it's already that side.
export const togglePossession = (courtId: string, side: "home" | "away", current: PossSide) =>
  setPossession(courtId, current === side ? null : side);

export function usePossession(courtId: string, pollMs = 1200): PossSide {
  const [side, setSide] = useState<PossSide>(() => cache.get(courtId) ?? null);
  useEffect(() => {
    let active = true;
    let set = subs.get(courtId);
    if (!set) { set = new Set(); subs.set(courtId, set); }
    const fn = (s: PossSide) => { if (active) setSide(s); };
    set.add(fn);

    const base = supabase.storage.from(BUCKET).getPublicUrl(filePath(courtId)).data.publicUrl;
    const load = async () => {
      try {
        const r = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok || !active) return;
        const j: Poss = await r.json();
        // Don't let a stale storage read clobber a change we just made locally.
        if ((j.ts ?? 0) >= (lastSetTs.get(courtId) ?? 0)) {
          cache.set(courtId, j.side ?? null);
          setSide(j.side ?? null);
        }
      } catch { /* no possession set yet */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; set!.delete(fn); clearInterval(id); };
  }, [courtId, pollMs]);
  return side;
}
