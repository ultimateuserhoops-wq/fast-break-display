import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  gatewayConnected, gatewaySendPatch, gatewaySnapshotFor,
  onGatewayPatch, onGatewaySnapshot,
} from "@/lib/gateway";
import { busSendPatch, onBusPatch } from "@/lib/realtime-bus";
import { localSendPatch, onLocalPatch, isLocalDisplay } from "@/lib/local-bus";
import { recordAudit } from "@/lib/audit";
import type { Tables } from "@/integrations/supabase/types";

export type Court = Tables<"courts">;
export type GameState = Tables<"game_state">;
export type Team = Tables<"teams">;
export type Player = Tables<"players">;
export type Tournament = Tables<"tournaments">;
export type GameEvent = Tables<"game_events">;

export const COURT_IDS = ["main", "court2", "court3", "court4", "court5", "court6"] as const;
export type CourtId = (typeof COURT_IDS)[number];

// Roster entries whose "number" is a staff role (Coach, Assistant Coach, Manager)
// are coaching staff, not players — kept out of player lists / box scores.
export function isStaff(p: { jersey_number: string | null }): boolean {
  const j = (p.jersey_number ?? "").trim().toUpperCase();
  return j === "C" || j === "HC" || j === "AC" || j === "M" || j === "MGR" || j === "MNG";
}
export function staffRole(p: { jersey_number: string | null }): string {
  const j = (p.jersey_number ?? "").trim().toUpperCase();
  if (j === "AC") return "Assistant Coach";
  if (j === "C" || j === "HC") return "Head Coach";
  return "Manager";
}

export function useGameState(courtId: string) {
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    let active = true;

    // Switching courts: DROP the previous court's state immediately. Without this the stale row
    // (with the old court_id) sticks — the panel keeps showing the old game AND writes go to the
    // old court (score/format "spilling" between scoreboards). Cleared first so the new court loads
    // fresh; the `cur ?? …` guards below then only protect optimistic writes WITHIN one court.
    setState((cur) => (cur && cur.court_id === courtId ? cur : null));

    // Seed from the LAN gateway snapshot if we already have one (instant on the local network).
    const seed = gatewaySnapshotFor(courtId);
    if (seed) setState((cur) => cur ?? (seed as GameState));

    // Apply an authoritative row from the DB. A late/out-of-order echo (or a racing refetch) can
    // carry a STALE value for a field the operator just changed — e.g. a delayed clock-start echo
    // still holding the OLD score, which would revert a point you just added while the clock runs.
    // So for exactly the fields this client wrote in the last ~2s, keep the local (optimistic) value;
    // everything else takes the authoritative row. Read-only displays never write, so they always
    // take the full row and stay perfectly in sync.
    const applyIncoming = (incoming: GameState) => {
      setState((cur) => (cur ? protectedMerge(courtId, cur, incoming) : incoming));
    };

    // Initial load — seed only if we don't already have state (never clobber an optimistic update).
    supabase.from("game_state").select("*").eq("court_id", courtId).maybeSingle()
      .then(({ data }) => { if (active && data) setState((cur) => cur ?? (data as GameState)); });

    // Reconnect refetch: a device that briefly loses wifi (venue changes routers, control laptop
    // roams off the AP, etc.) misses every realtime/gateway/broadcast patch sent while it was down —
    // with nothing to catch up, it can sit stale indefinitely even after the network returns. This is
    // deliberately event-driven, NOT a periodic poll: it only fires on an actual disconnect→reconnect
    // transition (or the browser's `online` event), and always merges via protectedMerge so a fresh
    // local edit can never be reverted by the catch-up fetch. No interval, no visibilitychange —
    // narrower than the resilience layer removed earlier, which caused the score-revert bug because
    // its refetch wasn't field-protected at the time.
    let wasSubscribed = false;
    const refetchAfterReconnect = () => {
      if (!active) return;
      supabase.from("game_state").select("*").eq("court_id", courtId).maybeSingle()
        .then(({ data }) => { if (active && data) applyIncoming(data as GameState); });
    };

    const channel = supabase
      .channel(`game_state:${courtId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state", filter: `court_id=eq.${courtId}` },
        // The gateway is the realtime source of truth on the LAN — ignore the slower cloud echo there.
        (payload) => { if (active && !gatewayConnected()) applyIncoming(payload.new as GameState); },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (wasSubscribed) refetchAfterReconnect(); // this is a RE-connect, not the initial subscribe
          wasSubscribed = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          wasSubscribed = false; // next successful SUBSCRIBED is a reconnect — catch up then
        }
      });

    const onOnline = () => refetchAfterReconnect();
    window.addEventListener("online", onOnline);

    // apply optimistic local patches instantly (before realtime echoes back)
    const unsub = subscribeGameState(courtId, (patch) => {
      if (active) setState((cur) => (cur ? { ...cur, ...patch } : cur));
    });

    // LAN gateway transport — full snapshot on (re)connect + instant per-update patches.
    const offSnap = onGatewaySnapshot((all) => {
      const g = all[courtId];
      if (active && g) setState((cur) => (cur ? protectedMerge(courtId, cur, g as Partial<GameState>) : (g as GameState)));
    });
    const offPatch = onGatewayPatch((cid, patch) => {
      if (active && cid === courtId) setState((cur) => (cur ? { ...cur, ...(patch as Partial<GameState>) } : cur));
    });

    // Fast cloud relay — apply broadcast patches instantly (~75ms) instead of waiting on the
    // ~0.8s postgres_changes echo. Readers (displays) don't write, so applying directly is safe;
    // the writer never receives its own broadcast (self:false), so it can't fight its optimistic state.
    const offBus = onBusPatch((cid, patch) => {
      if (active && cid === courtId) setState((cur) => (cur ? { ...cur, ...(patch as Partial<GameState>) } : cur));
    });

    // Instant same-device relay (BroadcastChannel) — an extended display window on this machine.
    const offLocal = onLocalPatch((cid, patch) => {
      if (active && cid === courtId) setState((cur) => (cur ? { ...cur, ...(patch as Partial<GameState>) } : cur));
    });

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel); unsub(); offSnap(); offPatch(); offBus(); offLocal();
    };
  }, [courtId]);

  return state;
}

export function useCourts() {
  const [courts, setCourts] = useState<Court[]>([]);
  useEffect(() => {
    supabase.from("courts").select("*").order("sort_order").then(({ data }) => setCourts(data ?? []));
  }, []);
  return courts;
}

/* ---------- Shared wall clock (cross-device sync) ----------
 * The running clock is extrapolated from an absolute anchor (started_at). If the
 * control laptop and the OBS PC have system clocks that differ by even a few tenths,
 * each subtracts a different "now" and the screens disagree (e.g. 7.3 vs 6.6). So
 * every screen calibrates an offset against ONE shared clock — the Cloudflare edge
 * (/api/time) — NTP-style, and we use serverNow() everywhere instead of Date.now().
 */
let clockOffsetMs = 0;
export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}
export function nowIso(): string {
  return new Date(serverNow()).toISOString();
}
async function calibrateClock() {
  try {
    let best = { rtt: Infinity, offset: 0 };
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const res = await fetch(`/api/time?_=${t0}`, { cache: "no-store" });
      const t1 = Date.now();
      const { t } = (await res.json()) as { t: number };
      const rtt = t1 - t0;
      // server time corresponds to ~the midpoint of the round trip
      const offset = t - (t0 + t1) / 2;
      if (rtt < best.rtt) best = { rtt, offset };
    }
    if (best.rtt < Infinity) clockOffsetMs = best.offset;
  } catch {
    /* offline / endpoint missing → fall back to local clock (offset 0) */
  }
}
if (typeof window !== "undefined") {
  calibrateClock();
  setInterval(calibrateClock, 5 * 60 * 1000);
}

export function computeGameClockSeconds(s: GameState | null, nowMs: number = serverNow()): number {
  if (!s) return 0;
  if (!s.game_clock_running || !s.game_clock_started_at) return Number(s.game_clock_seconds);
  const elapsed = (nowMs - new Date(s.game_clock_started_at).getTime()) / 1000;
  return Math.max(0, Number(s.game_clock_seconds) - elapsed);
}

export function computeShotClockTenths(s: GameState | null, nowMs: number = serverNow()): number {
  if (!s) return 0;
  if (!s.shot_clock_running || !s.shot_clock_started_at) return s.shot_clock_tenths;
  const elapsedTenths = Math.floor((nowMs - new Date(s.shot_clock_started_at).getTime()) / 100);
  return Math.max(0, s.shot_clock_tenths - elapsedTenths);
}

// Self-ticking clock hooks. While the clock is RUNNING, every screen extrapolates
// the countdown locally; a late realtime echo can briefly nudge the value backward
// (network latency) — so while running we DAMP tiny backward moves to avoid jitter.
// But the moment the clock STOPS, we snap to the exact authoritative value: on pause
// the display has already ticked a few tenths PAST the value the control captured, and
// if we kept damping it would stay stuck there forever — making the OBS display and the
// control panel show DIFFERENT paused numbers. So when not running, no clamp: both agree.
function useSmoothClock(read: () => number, jumpThreshold: number, running: boolean): number {
  const [val, setVal] = useState(read);
  const ref = useRef(val);
  const readRef = useRef(read);
  readRef.current = read; // always call the latest closure (latest game_state)
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    // requestAnimationFrame → repaint in lock-step with the monitor refresh (~16ms), so on the
    // LAN the OBS display and the control panel stay within a frame of each other.
    let raf = 0;
    const step = () => {
      const target = readRef.current();
      const prev = ref.current;
      const next =
        runningRef.current && target > prev && target - prev < jumpThreshold
          ? prev
          : target;
      if (next !== prev) { ref.current = next; setVal(next); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [jumpThreshold]);
  return val;
}

// OBS displays render the clock trailing real time slightly so a "stop" never lands
// AFTER the display has already ticked past it (which would snap the clock BACKWARD,
// e.g. 0.8 → 1.3). Over the cloud the echo is ~600ms behind so we buffer for it. On the
// LAN gateway the relay is ~1–5ms and the running-clock damping already absorbs that, so
// we use ZERO delay there — the OBS display reads the exact same value as the control panel.
const CLOUD_OBS_DELAY_MS = 600;
const GATEWAY_OBS_DELAY_MS = 0;
function obsDelayMs(): number {
  if (isLocalDisplay()) return 0;   // extended display on this device — fed instantly, so no clock buffer
  return gatewayConnected() ? GATEWAY_OBS_DELAY_MS : CLOUD_OBS_DELAY_MS;
}

export function useSmoothGameClock(s: GameState | null, display = false): number {
  return useSmoothClock(() => computeGameClockSeconds(s, serverNow() - (display ? obsDelayMs() : 0)), 1.5, !!s?.game_clock_running);
}
export function useSmoothShotTenths(s: GameState | null, display = false): number {
  return useSmoothClock(() => computeShotClockTenths(s, serverNow() - (display ? obsDelayMs() : 0)), 15, !!s?.shot_clock_running);
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatShotClock(tenths: number): string {
  const sec = tenths / 10;
  if (sec >= 10) return String(Math.ceil(sec));
  return sec.toFixed(1);
}

// Game clock with a tenth of a second — "MM:SS.t" — matching the control panel's run-time readout.
export function formatClockTenths(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds * 10)); // work in tenths so the digit is exact
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  const d = t % 10;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

/* ---------- Mutations ---------- */

// Optimistic local updates: patchGameState applies the change to local useGameState
// instances immediately (no waiting for the Supabase round-trip + realtime echo), so
// the control panel reacts instantly like an in-memory app. Realtime later reconciles
// with the authoritative row.
type GsListener = (patch: Partial<GameState>) => void;
const gsListeners = new Map<string, Set<GsListener>>();
// Per-FIELD last local write time (court → field → ts). A realtime echo / refetch can arrive with
// a stale value for a field the operator just changed (e.g. a late clock-start echo still carrying
// the OLD score) and revert it. So during a brief window we keep the local value for exactly the
// fields this client just wrote — protecting score, fouls, clock, etc. together.
const lastFieldPatchAt = new Map<string, Map<string, number>>();
function recordFieldPatch(courtId: string, patch: Partial<GameState>) {
  let m = lastFieldPatchAt.get(courtId);
  if (!m) { m = new Map(); lastFieldPatchAt.set(courtId, m); }
  const now = Date.now();
  for (const k of Object.keys(patch)) m.set(k, now);
}
// Merge an incoming row/snapshot over the current state, but KEEP the local value for any field this
// client wrote in the last ~2s — so a stale echo / reconnect snapshot can't revert a score/foul/clock
// the operator just changed. Used for both the realtime echo and the LAN gateway snapshot.
function protectedMerge(courtId: string, cur: GameState, incoming: Partial<GameState>): GameState {
  const merged = { ...cur, ...incoming } as GameState;
  const fields = lastFieldPatchAt.get(courtId);
  if (fields) {
    const now = Date.now();
    for (const [k, ts] of fields) {
      if (now - ts < 2000 && k in cur) (merged as Record<string, unknown>)[k] = (cur as Record<string, unknown>)[k];
    }
  }
  return merged;
}
function emitGameState(courtId: string, patch: Partial<GameState>) {
  gsListeners.get(courtId)?.forEach((l) => l(patch));
}
export function subscribeGameState(courtId: string, l: GsListener): () => void {
  if (!gsListeners.has(courtId)) gsListeners.set(courtId, new Set());
  gsListeners.get(courtId)!.add(l);
  return () => gsListeners.get(courtId)?.delete(l);
}

export async function patchGameState(courtId: string, patch: Partial<GameState>) {
  recordFieldPatch(courtId, patch);  // remember which fields we just changed (protect from stale echoes)
  emitGameState(courtId, patch);     // optimistic — instant on this device
  gatewaySendPatch(courtId, patch);  // instant LAN relay to every screen (no-op when off-gateway)
  busSendPatch(courtId, patch);      // fast CLOUD relay (~75ms) so cloud displays don't wait on postgres_changes (~0.8s)
  localSendPatch(courtId, patch);    // INSTANT same-device relay (BroadcastChannel) → extended display updates with 0 lag
  recordAudit(courtId, patch);       // stamp the change with this device's operator name (shared login has no identity)
  // Persist to Supabase regardless (the control panel is authenticated): keeps history,
  // cloud displays, and restart-recovery working. Off the critical path — every screen
  // already updated via the gateway, and gateway-connected clients ignore the slow echo.
  await supabase.from("game_state").update(patch).eq("court_id", courtId);
}

/* ---------- Undo (Ctrl+Z) ----------
 * Operators mis-tap (a stray +2, a wrong foul). We keep a small per-court stack of inverse
 * patches captured from the PRE-change state (mutations receive the full `s`, so they know the
 * old value). undoLast() reverts the most recent scoreboard change and, when that change logged
 * a play-by-play event, removes the newest event row so the box score stays in step. */
type UndoEntry = { revert: Partial<GameState>; dropLastEvent?: boolean; label: string };
const undoStacks = new Map<string, UndoEntry[]>();
export function pushUndo(courtId: string, entry: UndoEntry) {
  const st = undoStacks.get(courtId) ?? [];
  st.push(entry);
  if (st.length > 50) st.shift();
  undoStacks.set(courtId, st);
}
export function canUndo(courtId: string): boolean { return (undoStacks.get(courtId)?.length ?? 0) > 0; }
export async function undoLast(courtId: string): Promise<string | null> {
  const st = undoStacks.get(courtId);
  const e = st?.pop();
  if (!e) return null;
  await patchGameState(courtId, e.revert);
  if (e.dropLastEvent) {
    const { data } = await supabase.from("game_events").select("id").eq("court_id", courtId)
      .order("created_at", { ascending: false }).limit(1);
    if (data?.[0]) await supabase.from("game_events").delete().eq("id", data[0].id);
  }
  return e.label;
}

export async function addScore(s: GameState, side: "home" | "away", delta: number) {
  const key = side === "home" ? "home_score" : "away_score";
  const next = Math.max(0, (s[key] as number) + delta);
  pushUndo(s.court_id, { revert: { [key]: s[key] } as Partial<GameState>, label: `score ${delta > 0 ? "+" : ""}${delta}` });
  await patchGameState(s.court_id, { [key]: next } as Partial<GameState>);
}

export async function resetScore(s: GameState, side: "home" | "away") {
  const key = side === "home" ? "home_score" : "away_score";
  pushUndo(s.court_id, { revert: { [key]: s[key] } as Partial<GameState>, label: "reset score" });
  await patchGameState(s.court_id, { [key]: 0 } as Partial<GameState>);
}

// FIBA team fouls reset each quarter (handled in advanceQuarter). In 5-on-5 the count caps at
// 5 — reaching 5 puts the OTHER team in the bonus, so counting further adds nothing on the board.
// 3x3 keeps counting (its bonus/penalty thresholds are higher).
export function foulCapForMode(mode: string): number {
  return mode === "full" ? 5 : 99;
}
export async function addFoul(s: GameState, side: "home" | "away", delta: number) {
  const key = side === "home" ? "home_fouls" : "away_fouls";
  const cur = s[key] as number;
  const next = Math.max(0, Math.min(foulCapForMode(s.mode), cur + delta));
  if (next === cur) return; // already at the cap (or 0) — nothing to change
  pushUndo(s.court_id, { revert: { [key]: cur } as Partial<GameState>, label: "team foul" });
  await patchGameState(s.court_id, { [key]: next } as Partial<GameState>);
}

// FIBA timeouts: 2 in the first half (Q1–Q2), 3 in the second half (Q3–Q4), 1 per overtime.
// `home_timeouts`/`away_timeouts` track timeouts USED in the current half/OT.
export function timeoutMaxForQuarter(q: number): number {
  if (q >= 5) return 1;   // each overtime
  if (q >= 3) return 3;   // second half
  return 2;               // first half
}
export function timeoutsRemaining(s: GameState, side: "home" | "away"): number {
  const used = (side === "home" ? s.home_timeouts : s.away_timeouts) as number;
  return Math.max(0, timeoutMaxForQuarter(s.quarter) - used);
}
export async function addTimeout(s: GameState, side: "home" | "away", delta: number) {
  const key = side === "home" ? "home_timeouts" : "away_timeouts";
  const cur = s[key] as number;
  const next = Math.max(0, Math.min(timeoutMaxForQuarter(s.quarter), cur + delta));
  if (next === cur) return;
  pushUndo(s.court_id, { revert: { [key]: cur } as Partial<GameState>, label: "timeout" });
  await patchGameState(s.court_id, { [key]: next } as Partial<GameState>);
}

/* ---------- Game clock ---------- */

export async function startGameClock(s: GameState) {
  if (s.game_clock_running) return;
  await patchGameState(s.court_id, {
    game_clock_running: true,
    game_clock_started_at: nowIso(),
  });
}

export async function pauseGameClock(s: GameState) {
  if (!s.game_clock_running) return;
  const remaining = computeGameClockSeconds(s);
  await patchGameState(s.court_id, {
    game_clock_running: false,
    game_clock_started_at: null,
    game_clock_seconds: remaining,
  });
}

export async function adjustGameClock(s: GameState, deltaSeconds: number) {
  const current = computeGameClockSeconds(s);
  const next = Math.max(0, current + deltaSeconds);
  const patch: Partial<GameState> = { game_clock_seconds: next };
  if (s.game_clock_running) patch.game_clock_started_at = nowIso();
  await patchGameState(s.court_id, patch);
}

export async function setGameClock(s: GameState, seconds: number) {
  await patchGameState(s.court_id, {
    game_clock_seconds: Math.max(0, seconds),
    game_clock_running: false,
    game_clock_started_at: null,
  });
}

/* ---------- Combined game + shot clock (run/stop together) ---------- */

// Start BOTH clocks on one anchor so they tick together.
export async function startBothClocks(s: GameState) {
  const iso = nowIso();
  await patchGameState(s.court_id, {
    game_clock_running: true, game_clock_started_at: iso,
    shot_clock_running: true, shot_clock_started_at: iso,
  });
}

// Stop BOTH clocks, freezing each at its current remaining value.
export async function pauseBothClocks(s: GameState) {
  await patchGameState(s.court_id, {
    game_clock_running: false, game_clock_started_at: null, game_clock_seconds: computeGameClockSeconds(s),
    shot_clock_running: false, shot_clock_started_at: null, shot_clock_tenths: computeShotClockTenths(s),
  });
}

/* ---------- Shot clock ---------- */

export async function startShotClock(s: GameState) {
  if (s.shot_clock_running) return;
  await patchGameState(s.court_id, {
    shot_clock_running: true,
    shot_clock_started_at: nowIso(),
  });
}

export async function pauseShotClock(s: GameState) {
  if (!s.shot_clock_running) return;
  const remaining = computeShotClockTenths(s);
  await patchGameState(s.court_id, {
    shot_clock_running: false,
    shot_clock_started_at: null,
    shot_clock_tenths: remaining,
  });
}

export async function resetShotClock(s: GameState, tenths: number) {
  await patchGameState(s.court_id, {
    shot_clock_tenths: tenths,
    shot_clock_started_at: s.shot_clock_running ? nowIso() : null,
  });
}

export async function adjustShotClock(s: GameState, deltaTenths: number) {
  const current = computeShotClockTenths(s);
  const next = Math.max(0, Math.min(240, current + deltaTenths));
  const patch: Partial<GameState> = { shot_clock_tenths: next };
  if (s.shot_clock_running) patch.shot_clock_started_at = nowIso();
  await patchGameState(s.court_id, patch);
}

export async function buzzer(s: GameState) {
  await patchGameState(s.court_id, { buzzer_pulse: s.buzzer_pulse + 1 });
}

// Which "bucket" a period belongs to for timeout resets: first half, second half, or a
// specific overtime (each OT is its own bucket → timeouts reset when entering it).
function timeoutBucket(q: number): string { return q >= 5 ? `ot${q}` : q >= 3 ? "h2" : "h1"; }

// Move to a period (defaults to the next one). Resets the clocks and TEAM FOULS for the new
// period; resets timeouts only when crossing into a new half / overtime. Used by the Q buttons,
// the auto-advance-on-expiry watcher, and overtime creation.
export async function advanceQuarter(s: GameState, toQ?: number) {
  const q = Math.max(1, toQ ?? s.quarter + 1);
  const patch: Partial<GameState> = {
    quarter: q,
    game_clock_seconds: s.quarter_length_seconds,
    game_clock_running: false, game_clock_started_at: null,
    shot_clock_tenths: 240, shot_clock_running: false, shot_clock_started_at: null,
    home_fouls: 0, away_fouls: 0,                          // team fouls reset every period
  };
  if (timeoutBucket(q) !== timeoutBucket(s.quarter)) { patch.home_timeouts = 0; patch.away_timeouts = 0; }
  await patchGameState(s.court_id, patch);
}

export async function setQuarter(s: GameState, q: number) {
  await advanceQuarter(s, q);
}

// Called when the game clock hits 0. Auto-advances to the next period; at the end of regulation
// (Q4) or an OT it starts a fresh overtime when the score is tied, otherwise it ends the game.
// Returns what happened so the UI can toast it. Caller guards against double-firing.
export async function handlePeriodExpiry(s: GameState): Promise<"next" | "overtime" | "final"> {
  const tied = s.home_score === s.away_score;
  if (s.quarter < 4) { await advanceQuarter(s, s.quarter + 1); return "next"; }
  if (tied) { await advanceQuarter(s, s.quarter + 1); return "overtime"; }   // Q4+ tied → overtime
  await pauseBothClocks(s);                                                   // decided → game over
  return "final";
}

// Reset the game clock to the quarter length. When `includeShot` is false (the shot clock is
// locked to another device / Ref 2), the shot clock is left untouched.
export async function resetClocksForQuarter(s: GameState, includeShot = true) {
  const patch: Partial<GameState> = {
    game_clock_seconds: s.quarter_length_seconds,
    game_clock_running: false,
    game_clock_started_at: null,
  };
  if (includeShot) {
    patch.shot_clock_tenths = 240;
    patch.shot_clock_running = false;
    patch.shot_clock_started_at = null;
  }
  await patchGameState(s.court_id, patch);
}

// The shot clock has been handed to another device (Ref 2). Per-court, per-device flag set by the
// "Lock shot clock" toggle — used so this device's resets/controls leave the shot clock alone.
export function isShotLocked(courtId: string): boolean {
  return typeof window !== "undefined" && localStorage.getItem(`bdc_shotlock_${courtId}`) === "1";
}

// Start a fresh game on this court (for a new matchup). Keeps the assigned teams,
// resets the scoreboard, and CLEARS the play-by-play so old stats / shot chart don't
// bleed into the new game (and the AI footage analysis applies to the new teams).
export async function startNewGame(s: GameState) {
  await patchGameState(s.court_id, {
    home_score: 0, away_score: 0,
    home_fouls: 0, away_fouls: 0,
    home_timeouts: 0, away_timeouts: 0,
    quarter: 1,
    game_clock_seconds: s.quarter_length_seconds,
    game_clock_running: false, game_clock_started_at: null,
    shot_clock_tenths: 240, shot_clock_running: false, shot_clock_started_at: null,
  });
  // wipe this court's events (best effort — operator is authenticated)
  await supabase.from("game_events").delete().eq("court_id", s.court_id);
}

/* ---------- Events / play-by-play ---------- */

export const EVENT_TYPES = [
  "2PT_MADE", "2PT_MISS", "3PT_MADE", "3PT_MISS", "FT_MADE", "FT_MISS",
  "REB", "AST", "STL", "BLK", "TO", "FOUL",
  "TIMEOUT", "ADJUST", "SUB_IN", "SUB_OUT",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventInput {
  side: "home" | "away";
  type: EventType | string;
  points?: number;
  playerId?: string | null;
  playerName?: string | null;
  playerNumber?: string | null;
  teamId?: string | null;
  note?: string;
}

export async function logEvent(s: GameState, e: EventInput) {
  await supabase.from("game_events").insert({
    court_id: s.court_id,
    team_side: e.side,
    team_id: e.teamId ?? (e.side === "home" ? s.home_team_id : s.away_team_id) ?? null,
    player_id: e.playerId ?? null,
    player_name: e.playerName ?? null,
    player_number: e.playerNumber ?? null,
    event_type: e.type,
    points: e.points ?? 0,
    quarter: s.quarter,
    game_clock_seconds: computeGameClockSeconds(s),
    note: e.note ?? null,
  });
}

export async function scoreFromAction(
  s: GameState,
  side: "home" | "away",
  type: "2PT_MADE" | "3PT_MADE" | "FT_MADE",
  player?: { id: string; name: string; jersey_number: string } | null,
) {
  const points = type === "3PT_MADE" ? 3 : type === "2PT_MADE" ? 2 : 1;
  const scoreKey = side === "home" ? "home_score" : "away_score";
  const patch: Record<string, unknown> = { [scoreKey]: (s[scoreKey] as number) + points };
  const revert: Record<string, unknown> = { [scoreKey]: s[scoreKey] };
  if (type === "3PT_MADE") {
    const pulseKey = side === "home" ? "three_pulse_home" : "three_pulse_away";
    patch[pulseKey] = ((s as unknown as Record<string, number>)[pulseKey] ?? 0) + 1;
    revert[pulseKey] = (s as unknown as Record<string, number>)[pulseKey] ?? 0;
  }
  pushUndo(s.court_id, { revert: revert as Partial<GameState>, dropLastEvent: true, label: `${points}pt` });
  await patchGameState(s.court_id, patch as Partial<GameState>);
  await logEvent(s, {
    side, type, points,
    playerId: player?.id ?? null, playerName: player?.name ?? null, playerNumber: player?.jersey_number ?? null,
  });
}

/** Records a field-goal attempt with its court location (x,y as 0–100 percentages,
 *  stored in the event note). Updates the team score on a make. */
export async function recordShot(
  s: GameState,
  side: "home" | "away",
  made: boolean,
  three: boolean,
  player?: { id: string; name: string; jersey_number: string } | null,
  loc?: { x: number; y: number } | null,
) {
  const type = three ? (made ? "3PT_MADE" : "3PT_MISS") : (made ? "2PT_MADE" : "2PT_MISS");
  const points = made ? (three ? 3 : 2) : 0;
  if (made) {
    const scoreKey = side === "home" ? "home_score" : "away_score";
    const patch: Record<string, unknown> = { [scoreKey]: (s[scoreKey] as number) + points };
    if (three) {
      const pulseKey = side === "home" ? "three_pulse_home" : "three_pulse_away";
      patch[pulseKey] = ((s as unknown as Record<string, number>)[pulseKey] ?? 0) + 1;
    }
    await patchGameState(s.court_id, patch as Partial<GameState>);
  }
  await logEvent(s, {
    side, type, points,
    playerId: player?.id ?? null, playerName: player?.name ?? null, playerNumber: player?.jersey_number ?? null,
    note: loc ? JSON.stringify({ x: Math.round(loc.x), y: Math.round(loc.y) }) : undefined,
  });
}

export async function logPlayerStat(
  s: GameState,
  side: "home" | "away",
  type: EventType | string,
  player?: { id: string; name: string; jersey_number: string } | null,
) {
  if (type === "FOUL") {
    const key = side === "home" ? "home_fouls" : "away_fouls";    // team fouls sync with personal fouls; uncapped (5+ = bonus)
    pushUndo(s.court_id, { revert: { [key]: s[key] } as Partial<GameState>, dropLastEvent: true, label: "foul" });
    await patchGameState(s.court_id, { [key]: (s[key] as number) + 1 } as Partial<GameState>);
  }
  await logEvent(s, {
    side, type,
    playerId: player?.id ?? null, playerName: player?.name ?? null, playerNumber: player?.jersey_number ?? null,
  });
}

/** Delete the most recent event of a given type for one player — used by the Stat Keeper's
 *  −foul correction. Returns true if a row was removed. */
export async function removeLastStat(courtId: string, playerId: string, type: string): Promise<boolean> {
  const { data } = await supabase.from("game_events").select("id").eq("court_id", courtId)
    .eq("player_id", playerId).eq("event_type", type)
    .order("created_at", { ascending: false }).limit(1);
  if (!data?.[0]) return false;
  await supabase.from("game_events").delete().eq("id", data[0].id);
  return true;
}

/* ---------- Players / roster ---------- */

export function usePlayers(teamId: string | null | undefined) {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    if (!teamId) { setPlayers([]); return; }
    let active = true;
    const load = () => {
      supabase.from("players").select("*").eq("team_id", teamId).order("jersey_number")
        .then(({ data }) => { if (active) setPlayers(data ?? []); });
    };
    load();
    // unique channel name per hook instance — multiple components (roster, box score,
    // report) subscribe for the same team; Supabase rejects duplicate channel names.
    const ch = supabase.channel(`players:${teamId}:${++_channelSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `team_id=eq.${teamId}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [teamId]);
  return players;
}

let _channelSeq = 0;

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    supabase.from("teams").select("*").order("name").then(({ data }) => setTeams(data ?? []));
  }, []);
  return teams;
}

export async function addPlayerToTeam(teamId: string, p: { name: string; jersey_number: string; position?: string }) {
  await supabase.from("players").insert({ team_id: teamId, name: p.name, jersey_number: p.jersey_number, position: p.position ?? null });
}

export async function setOnCourt(s: GameState, side: "home" | "away", ids: string[]) {
  const key = side === "home" ? "home_on_court" : "away_on_court";
  await patchGameState(s.court_id, { [key]: ids.slice(0, 5) } as Partial<GameState>);
}

export async function assignTeamToSide(s: GameState, side: "home" | "away", team: Team) {
  const patch: Partial<GameState> = side === "home"
    ? { home_team_id: team.id, home_name: team.name, home_abbr: team.abbreviation || team.name.slice(0, 3).toUpperCase(), home_color: team.primary_color, home_logo: team.logo_url, home_on_court: [] }
    : { away_team_id: team.id, away_name: team.name, away_abbr: team.abbreviation || team.name.slice(0, 3).toUpperCase(), away_color: team.primary_color, away_logo: team.logo_url, away_on_court: [] };
  await patchGameState(s.court_id, patch);
}

/* ---------- Events feed + box score ---------- */

export function useGameEvents(courtId: string) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  useEffect(() => {
    let active = true;
    const load = () => {
      supabase.from("game_events").select("*").eq("court_id", courtId)
        .order("created_at", { ascending: false }).limit(500)
        .then(({ data }) => { if (active) setEvents(data ?? []); });
    };
    load();
    const ch = supabase.channel(`events:${courtId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `court_id=eq.${courtId}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [courtId]);
  return events;
}

export interface BoxScoreLine {
  playerId: string;
  pts: number; reb: number; ast: number; stl: number; blk: number; fls: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; to: number;
}

export function aggregateBoxScore(events: GameEvent[]): Map<string, BoxScoreLine> {
  const m = new Map<string, BoxScoreLine>();
  const blank = (id: string): BoxScoreLine => ({ playerId: id, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fls: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0 });
  for (const e of events) {
    if (!e.player_id) continue;
    const row = m.get(e.player_id) ?? blank(e.player_id);
    switch (e.event_type) {
      case "2PT_MADE": row.pts += 2; row.fgm += 1; row.fga += 1; break;
      case "2PT_MISS": row.fga += 1; break;
      case "3PT_MADE": row.pts += 3; row.fgm += 1; row.fga += 1; row.tpm += 1; row.tpa += 1; break;
      case "3PT_MISS": row.fga += 1; row.tpa += 1; break;
      case "FT_MADE": row.pts += 1; row.ftm += 1; row.fta += 1; break;
      case "FT_MISS": row.fta += 1; break;
      case "REB": row.reb += 1; break;
      case "AST": row.ast += 1; break;
      case "STL": row.stl += 1; break;
      case "BLK": row.blk += 1; break;
      case "TO":  row.to  += 1; break;
      case "FOUL": row.fls += 1; break;
    }
    m.set(e.player_id, row);
  }
  return m;
}

export function useTick(intervalMs = 100): number {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => (n + 1) % 1000000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return Date.now();
}
