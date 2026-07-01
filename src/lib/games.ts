import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameState, GameEvent } from "@/lib/game-state";

/** A finished game saved to the `games` archive table. */
export type SavedGame = {
  id: string;
  created_at: string;
  played_at: string;
  court_id: string;
  tournament_name: string | null;
  home_team_id: string | null; away_team_id: string | null;
  home_name: string | null; away_name: string | null;
  home_color: string | null; away_color: string | null;
  home_abbr: string | null; away_abbr: string | null;
  home_logo: string | null; away_logo: string | null;
  home_score: number; away_score: number; quarter: number;
  data: { events?: GameEvent[] };
};

// `games` isn't in the generated Supabase types yet — cast through any.
const G = () => supabase.from("games" as never);

const SUMMARY = "id,created_at,played_at,court_id,tournament_name,home_team_id,away_team_id,home_name,away_name,home_color,away_color,home_abbr,away_abbr,home_logo,away_logo,home_score,away_score,quarter";

/** Snapshot the current game on a court (state + play-by-play) into the archive. */
export async function saveGame(s: GameState): Promise<string | null> {
  const { data: events } = await supabase.from("game_events").select("*").eq("court_id", s.court_id);
  const row = {
    court_id: s.court_id,
    played_at: new Date().toISOString(),
    tournament_name: s.tournament_name,
    home_team_id: s.home_team_id, away_team_id: s.away_team_id,
    home_name: s.home_name, away_name: s.away_name,
    home_color: s.home_color, away_color: s.away_color,
    home_abbr: s.home_abbr ?? null, away_abbr: s.away_abbr ?? null,
    home_logo: s.home_logo, away_logo: s.away_logo,
    home_score: s.home_score, away_score: s.away_score, quarter: s.quarter,
    data: { events: events ?? [] },
  };
  const { data, error } = await (G() as never as { insert: (r: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id?: string } | null; error: unknown }> } } })
    .insert(row).select("id").single();
  if (error) throw error;
  return data?.id ?? null;
}

/** Does this game have anything worth saving? */
export function gameHasResult(s: GameState): boolean {
  return s.home_score > 0 || s.away_score > 0;
}

export async function deleteGame(id: string): Promise<void> {
  const { error } = await (G() as never as { delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> } }).delete().eq("id", id);
  if (error) throw error;
}

export function useGames(): { games: SavedGame[]; loading: boolean; reload: () => void } {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    (G() as never as { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: SavedGame[] | null }> } })
      .select(SUMMARY)
      .order("played_at", { ascending: false })
      .then(({ data }) => { if (active) { setGames(data ?? []); setLoading(false); } });
    return () => { active = false; };
  }, [n]);
  return { games, loading, reload: () => setN((x) => x + 1) };
}

export function useGame(id: string): SavedGame | null {
  const [g, setG] = useState<SavedGame | null>(null);
  useEffect(() => {
    let active = true;
    (G() as never as { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: SavedGame | null }> } } })
      .select("*").eq("id", id).maybeSingle()
      .then(({ data }) => { if (active) setG(data); });
    return () => { active = false; };
  }, [id]);
  return g;
}
