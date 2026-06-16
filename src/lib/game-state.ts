import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Court = Tables<"courts">;
export type GameState = Tables<"game_state">;
export type Team = Tables<"teams">;
export type Player = Tables<"players">;
export type Tournament = Tables<"tournaments">;
export type GameEvent = Tables<"game_events">;

export const COURT_IDS = ["main", "court2", "court3", "court4", "court5", "court6"] as const;
export type CourtId = (typeof COURT_IDS)[number];

export function useGameState(courtId: string) {
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("game_state")
      .select("*")
      .eq("court_id", courtId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setState(data);
      });

    const channel = supabase
      .channel(`game_state:${courtId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state", filter: `court_id=eq.${courtId}` },
        (payload) => {
          if (active) setState(payload.new as GameState);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [courtId]);

  return state;
}

export function useCourts() {
  const [courts, setCourts] = useState<Court[]>([]);
  useEffect(() => {
    supabase
      .from("courts")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setCourts(data ?? []));
  }, []);
  return courts;
}

/** Compute current game clock seconds, accounting for running state since last anchor. */
export function computeGameClockSeconds(s: GameState | null, nowMs: number = Date.now()): number {
  if (!s) return 0;
  if (!s.game_clock_running || !s.game_clock_started_at) return Number(s.game_clock_seconds);
  const elapsed = (nowMs - new Date(s.game_clock_started_at).getTime()) / 1000;
  return Math.max(0, Number(s.game_clock_seconds) - elapsed);
}

/** Returns shot clock as tenths of a second (int). */
export function computeShotClockTenths(s: GameState | null, nowMs: number = Date.now()): number {
  if (!s) return 0;
  if (!s.shot_clock_running || !s.shot_clock_started_at) return s.shot_clock_tenths;
  const elapsedTenths = Math.floor((nowMs - new Date(s.shot_clock_started_at).getTime()) / 100);
  return Math.max(0, s.shot_clock_tenths - elapsedTenths);
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

/* ---------- Mutations ---------- */

export async function patchGameState(courtId: string, patch: Partial<GameState>) {
  await supabase.from("game_state").update(patch).eq("court_id", courtId);
}

export async function addScore(s: GameState, side: "home" | "away", delta: number) {
  const key = side === "home" ? "home_score" : "away_score";
  const next = Math.max(0, (s[key] as number) + delta);
  await patchGameState(s.court_id, { [key]: next } as Partial<GameState>);
}

export async function resetScore(s: GameState, side: "home" | "away") {
  const key = side === "home" ? "home_score" : "away_score";
  await patchGameState(s.court_id, { [key]: 0 } as Partial<GameState>);
}

export async function addFoul(s: GameState, side: "home" | "away", delta: number) {
  const key = side === "home" ? "home_fouls" : "away_fouls";
  const cur = s[key] as number;
  const next = Math.max(0, Math.min(5, cur + delta));
  await patchGameState(s.court_id, { [key]: next } as Partial<GameState>);
}

export async function addTimeout(s: GameState, side: "home" | "away", delta: number) {
  const key = side === "home" ? "home_timeouts" : "away_timeouts";
  const next = Math.max(0, (s[key] as number) + delta);
  await patchGameState(s.court_id, { [key]: next } as Partial<GameState>);
}

/* ---------- Game clock ---------- */

export async function startGameClock(s: GameState) {
  if (s.game_clock_running) return;
  await patchGameState(s.court_id, {
    game_clock_running: true,
    game_clock_started_at: new Date().toISOString(),
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
  if (s.game_clock_running) {
    patch.game_clock_started_at = new Date().toISOString();
  }
  await patchGameState(s.court_id, patch);
}

export async function setGameClock(s: GameState, seconds: number) {
  await patchGameState(s.court_id, {
    game_clock_seconds: Math.max(0, seconds),
    game_clock_running: false,
    game_clock_started_at: null,
  });
}

/* ---------- Shot clock (tenths) ---------- */

export async function startShotClock(s: GameState) {
  if (s.shot_clock_running) return;
  await patchGameState(s.court_id, {
    shot_clock_running: true,
    shot_clock_started_at: new Date().toISOString(),
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
    shot_clock_started_at: s.shot_clock_running ? new Date().toISOString() : null,
  });
}

export async function adjustShotClock(s: GameState, deltaTenths: number) {
  const current = computeShotClockTenths(s);
  const next = Math.max(0, Math.min(240, current + deltaTenths));
  const patch: Partial<GameState> = { shot_clock_tenths: next };
  if (s.shot_clock_running) patch.shot_clock_started_at = new Date().toISOString();
  await patchGameState(s.court_id, patch);
}

export async function buzzer(s: GameState) {
  await patchGameState(s.court_id, { buzzer_pulse: s.buzzer_pulse + 1 });
}

export async function setQuarter(s: GameState, q: number) {
  await patchGameState(s.court_id, { quarter: Math.max(1, q) });
}

export async function resetClocksForQuarter(s: GameState) {
  await patchGameState(s.court_id, {
    game_clock_seconds: s.quarter_length_seconds,
    game_clock_running: false,
    game_clock_started_at: null,
    shot_clock_tenths: 240,
    shot_clock_running: false,
    shot_clock_started_at: null,
  });
}

/* ---------- Events / play-by-play ---------- */

export interface EventInput {
  side: "home" | "away";
  type: string;
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

/** Animation pulse (local-only) hook for +3 burst */
export function useTick(intervalMs = 100): number {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => (n + 1) % 1000000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return Date.now();
}
