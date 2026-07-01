import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Sponsor media lives under a folder of the existing public team-photos bucket
// (we can't create new buckets with the anon/operator key on the managed project).
const BUCKET = "team-photos";
const SPONSOR_PREFIX = "sponsors";

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function listSponsorLogos(): Promise<string[]> {
  const { data } = await supabase.storage.from(BUCKET).list(SPONSOR_PREFIX, {
    limit: 100,
    sortBy: { column: "name", order: "asc" },
  });
  if (!data) return [];
  return data
    .filter((f) => f.name && !f.name.startsWith(".") && /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name))
    .map((f) => publicUrl(`${SPONSOR_PREFIX}/${f.name}`));
}

export async function uploadSponsorLogo(file: File): Promise<void> {
  const safe = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
  const path = `${SPONSOR_PREFIX}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
}

export async function deleteSponsorLogo(url: string): Promise<void> {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return;
  const path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  await supabase.storage.from(BUCKET).remove([path]);
}

// Sponsor display config (priority order + how many to rotate) lives in a small JSON file
// next to the logos. `.json` is filtered out of listSponsorLogos so it never shows as a logo.
const SPONSOR_CFG = `${SPONSOR_PREFIX}/_config.json`;
export type SponsorConfig = { order: string[]; limit: number };  // order = logo URLs; limit = max rotated (0 = all)
export async function getSponsorConfig(): Promise<SponsorConfig> {
  try {
    const { data } = await supabase.storage.from(BUCKET).download(SPONSOR_CFG);
    if (data) { const j = JSON.parse(await data.text()); return { order: Array.isArray(j.order) ? j.order : [], limit: Number(j.limit) || 0 }; }
  } catch { /* no config yet */ }
  return { order: [], limit: 0 };
}
export async function setSponsorConfig(cfg: SponsorConfig): Promise<void> {
  const blob = new Blob([JSON.stringify(cfg)], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(SPONSOR_CFG, blob, { upsert: true });
  if (error) throw error;
}
// Apply the saved priority order, dropping stale entries and appending any new (unordered) logos.
export function orderLogos(logos: string[], order: string[]): string[] {
  const present = new Set(logos);
  const ordered = order.filter((u) => present.has(u));
  const rest = logos.filter((u) => !order.includes(u));
  return [...ordered, ...rest];
}

/* ---------- Game roster (dressed squad) — shared across devices ---------- */
const ROSTER_PREFIX = "roster";
const rosterPath = (courtId: string, side: "home" | "away") => `${ROSTER_PREFIX}/${courtId}_${side}.json`;

export async function getGameRoster(courtId: string, side: "home" | "away"): Promise<string[] | null> {
  const base = publicUrl(rosterPath(courtId, side));
  try {
    const r = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      return Array.isArray(j?.ids) ? j.ids : null;
    }
  } catch { /* no roster set */ }
  return null;
}

export async function setGameRoster(courtId: string, side: "home" | "away", ids: string[] | null): Promise<void> {
  if (ids) {
    const body = new Blob([JSON.stringify({ ids })], { type: "application/json" });
    const { error } = await supabase.storage.from(BUCKET).upload(rosterPath(courtId, side), body, { upsert: true, contentType: "application/json" });
    if (error) throw error;
  } else {
    await supabase.storage.from(BUCKET).remove([rosterPath(courtId, side)]);
  }
}

export function useGameRoster(courtId: string, side: "home" | "away", pollMs = 10000): string[] | null {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => getGameRoster(courtId, side).then((v) => { if (active) setIds(v); });
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [courtId, side, pollMs]);
  return ids;
}

/* ---------- Stat-keeper half-court background image ---------- */
const COURT_PREFIX = "court";

export async function uploadCourtImage(file: File): Promise<void> {
  // keep a single court image: clear the folder first
  const { data: existing } = await supabase.storage.from(BUCKET).list(COURT_PREFIX, { limit: 50 });
  if (existing?.length) await supabase.storage.from(BUCKET).remove(existing.map((f) => `${COURT_PREFIX}/${f.name}`));
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${COURT_PREFIX}/halfcourt-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
}

export async function getCourtImageUrl(): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).list(COURT_PREFIX, { limit: 10, sortBy: { column: "name", order: "desc" } });
  const img = data?.find((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
  return img ? publicUrl(`${COURT_PREFIX}/${img.name}`) : null;
}

export function useCourtImage(pollMs = 30000): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => getCourtImageUrl().then((v) => { if (active) setUrl(v); }).catch(() => {});
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [pollMs]);
  return url;
}

/* ---------- Ad videos + play/stop signal (per court) ---------- */
const AD_PREFIX = "ads";
const signalPath = (courtId: string) => `${AD_PREFIX}/_signal-${courtId}.json`;

export type AdVideo = { name: string; url: string };

export async function listAdVideos(): Promise<AdVideo[]> {
  const { data } = await supabase.storage.from(BUCKET).list(AD_PREFIX, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (!data) return [];
  return data
    .filter((f) => /\.(mp4|webm|mov|m4v|ogg)$/i.test(f.name))
    .map((f) => ({ name: f.name.replace(/^\d+-/, ""), url: publicUrl(`${AD_PREFIX}/${f.name}`) }));
}

export async function uploadAdVideo(file: File): Promise<void> {
  const safe = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
  const { error } = await supabase.storage.from(BUCKET).upload(`${AD_PREFIX}/${Date.now()}-${safe}`, file, { upsert: true });
  if (error) throw error;
}

export async function deleteAdVideo(url: string): Promise<void> {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  await supabase.storage.from(BUCKET).remove([path]);
}

async function writeSignal(courtId: string, payload: object) {
  const body = new Blob([JSON.stringify({ ...payload, ts: Date.now() })], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(signalPath(courtId), body, { upsert: true, contentType: "application/json" });
  if (error) throw error;
}
export const playAd = (courtId: string, url: string) => writeSignal(courtId, { action: "play", url });
export const stopAd = (courtId: string) => writeSignal(courtId, { action: "stop" });

// Public-safe hook the OBS displays use to react to play/stop. Polls a tiny JSON
// signal file in storage (no DB column needed; works across devices).
export function useAdSignal(courtId: string, pollMs = 1500): { action: string; url?: string; ts: number } | null {
  const [sig, setSig] = useState<{ action: string; url?: string; ts: number } | null>(null);
  useEffect(() => {
    let active = true;
    const base = supabase.storage.from(BUCKET).getPublicUrl(signalPath(courtId)).data.publicUrl;
    const load = async () => {
      try {
        const r = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok && active) setSig(await r.json());
      } catch { /* no signal yet */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [courtId, pollMs]);
  return sig;
}

/* ---------- Game footage / livestream link (per court) ---------- */
const FOOTAGE_PREFIX = "footage";
const footagePath = (courtId: string) => `${FOOTAGE_PREFIX}/${courtId}.json`;

export type Footage = { url: string; label?: string; ts: number };

export async function setFootage(courtId: string, url: string, label = ""): Promise<void> {
  const body = new Blob([JSON.stringify({ url, label, ts: Date.now() })], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(footagePath(courtId), body, { upsert: true, contentType: "application/json" });
  if (error) throw error;
}

export function useFootage(courtId: string, pollMs = 10000): Footage | null {
  const [f, setF] = useState<Footage | null>(null);
  useEffect(() => {
    let active = true;
    const base = supabase.storage.from(BUCKET).getPublicUrl(footagePath(courtId)).data.publicUrl;
    const load = async () => {
      try { const r = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" }); if (r.ok && active) setF(await r.json()); }
      catch { /* none yet */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [courtId, pollMs]);
  return f;
}

/* ---------- Break / interval timer (per court) — time-out, half-time, pre-game ---------- */
const BREAK_PREFIX = "break";
const breakPath = (courtId: string) => `${BREAK_PREFIX}/${courtId}.json`;

export type BreakState = {
  show: boolean;             // is the break countdown shown on the OBS timer display?
  running: boolean;          // counting down?
  started_at: string | null; // ISO (server-synced) when the current run started
  seconds: number;           // remaining seconds captured at the last start/pause
  label: string;             // e.g. "TIME OUT", "HALF TIME"
  ts: number;
};

export async function setBreak(courtId: string, b: Omit<BreakState, "ts">): Promise<void> {
  const body = new Blob([JSON.stringify({ ...b, ts: Date.now() })], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(breakPath(courtId), body, { upsert: true, contentType: "application/json" });
  if (error) throw error;
}

// Public-safe hook the OBS timer + the Time Keeper use to read the shared break state.
export function useBreak(courtId: string, pollMs = 1000): BreakState | null {
  const [b, setB] = useState<BreakState | null>(null);
  useEffect(() => {
    let active = true;
    const base = supabase.storage.from(BUCKET).getPublicUrl(breakPath(courtId)).data.publicUrl;
    const load = async () => {
      try { const r = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" }); if (r.ok && active) setB(await r.json()); }
      catch { /* no break signal yet */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [courtId, pollMs]);
  return b;
}

// Public-safe hook used by the OBS displays (no auth). Polls so newly uploaded
// sponsor logos appear without needing a manual reload. Applies the saved priority
// order and the rotation limit so the strip shows the chosen sponsors first.
export function useSponsorLogos(pollMs = 20000): string[] {
  const [logos, setLogos] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [list, cfg] = await Promise.all([listSponsorLogos(), getSponsorConfig()]);
        if (!active) return;
        let out = orderLogos(list, cfg.order);
        if (cfg.limit > 0) out = out.slice(0, cfg.limit);
        setLogos(out);
      } catch { /* keep last */ }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [pollMs]);
  return logos;
}
