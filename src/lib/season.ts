import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlayerStat = {
  player_id: string; player_name: string | null; player_number: string | null; team_name: string | null;
  games: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; fls: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
};

export type TeamStanding = {
  team_id: string; team_name: string | null; games: number;
  wins: number; losses: number; points_for: number; points_against: number;
};

export type GameLogRow = {
  game_id: string; played_at: string; tournament_name: string | null; team_name: string | null; opponent: string | null;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
};

// Call a Postgres RPC and return the rows. (these functions aren't in the generated types)
function useRpc<T>(fn: string, params: Record<string, unknown>, deps: unknown[]): { rows: T[]; loading: boolean } {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    (supabase.rpc as unknown as (f: string, p: Record<string, unknown>) => Promise<{ data: T[] | null }>)(fn, params)
      .then(({ data }) => { if (active) { setRows(data ?? []); setLoading(false); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { rows, loading };
}

/** Player leaderboard — pass a tournament name to scope it, or null/undefined for all. */
export function usePlayerStats(tournament?: string | null) {
  const { rows, loading } = useRpc<PlayerStat>("player_stats", { p_tournament: tournament || null }, [tournament]);
  return { players: rows, loading };
}

/** Team standings — optionally scoped to a tournament. */
export function useStandings(tournament?: string | null) {
  const { rows, loading } = useRpc<TeamStanding>("team_stats", { p_tournament: tournament || null }, [tournament]);
  return { teams: rows, loading };
}

/** One player's stat line in each game they played. */
export function usePlayerGameLog(playerId: string) {
  const { rows, loading } = useRpc<GameLogRow>("player_game_log", { p_player_id: playerId }, [playerId]);
  return { log: rows, loading };
}

/** Distinct tournaments that have saved games (for the filter dropdown). */
export function useTournaments(): string[] {
  const [t, setT] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    (supabase.from("tournaments_played" as never) as unknown as { select: (c: string) => Promise<{ data: { tournament_name: string }[] | null }> })
      .select("tournament_name")
      .then(({ data }) => { if (active) setT((data ?? []).map((r) => r.tournament_name).filter(Boolean).sort()); });
    return () => { active = false; };
  }, []);
  return t;
}
