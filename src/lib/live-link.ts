// Explicit binding between a scoreboard COURT and a scheduled tournament FIXTURE.
// The binding + the final score are stored in the tournament's working model (`tournaments.data`)
// so the public site can show the live score on the exact fixture and the standings update from
// the recorded final. Writes go through the operator's authed Supabase session (auth-write table).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LMatch = { home: string; away: string; court?: string; date?: string; time?: string; id?: string; result?: { hs: number; as: number } | null };
type LRound = { name: string; matches: LMatch[] };
type LDivision = { id?: string; name: string; rounds?: LRound[] };
export type MultiData = { kind: "multi"; divisions: LDivision[]; schedule?: unknown; liveByCourt?: Record<string, string> };
export type TournRow = { id: string; name: string; data: MultiData };

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
const concrete = (s?: string) => !!s && s !== "(bye)";

/** Give every concrete match a permanent id (so bindings/results survive re-renders). */
export function ensureMatchIds(data: MultiData): MultiData {
  let changed = false;
  const divisions = data.divisions.map((d) => ({
    ...d,
    rounds: (d.rounds || []).map((r) => ({
      ...r,
      matches: r.matches.map((m) => { if (!m.id && concrete(m.home) && concrete(m.away)) { changed = true; return { ...m, id: uid() }; } return m; }),
    })),
  }));
  return changed ? { ...data, divisions } : data;
}

export type Bindable = { id: string; division: string; round: string; home: string; away: string; court?: string; date?: string; time?: string; played: boolean };
export function listMatches(data: MultiData): Bindable[] {
  const out: Bindable[] = [];
  for (const d of data.divisions) for (const r of (d.rounds || [])) for (const m of r.matches) {
    if (!concrete(m.home) || !concrete(m.away) || !m.id) continue;
    out.push({ id: m.id, division: d.name, round: r.name, home: m.home, away: m.away, court: m.court, date: m.date, time: m.time, played: !!m.result });
  }
  return out;
}

/** The court NUMBER for a scoreboard court id ("main"→1, "court2"→2, …). */
export function courtNumberFromId(courtId: string): number | null {
  if (courtId === "main") return 1;
  const m = courtId.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
/** The court NUMBER a schedule fixture is assigned to ("Court 1"→1, "2"→2, blank→null). */
export function fixtureCourtNumber(court?: string): number | null {
  if (!court) return null;
  const m = court.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
/** Chronological sort key for a fixture — date (DD/MM or ISO) then time, so lists order by kick-off. */
export function fixtureSortKey(m: { date?: string; time?: string }): string {
  const d = (m.date || "").trim();
  const dk = d.includes("/") ? d.split("/").map((x) => x.padStart(2, "0")).reverse().join("") : d; // DD/MM → MMDD (month-major)
  return `${dk}|${(m.time || "").trim()}`;
}
export function findMatch(data: MultiData, id: string) {
  for (const d of data.divisions) for (const r of (d.rounds || [])) for (const m of r.matches) if (m.id === id) return { div: d, round: r, match: m };
  return null;
}

/** Bind a court to a match — one court ↔ one match. */
export function withBinding(data: MultiData, courtId: string, matchId: string): MultiData {
  const live: Record<string, string> = { ...(data.liveByCourt || {}) };
  for (const c of Object.keys(live)) if (live[c] === matchId) delete live[c]; // match can't be live on two courts
  live[courtId] = matchId;
  return { ...data, liveByCourt: live };
}
export function withClearedCourt(data: MultiData, courtId: string): MultiData {
  if (!data.liveByCourt?.[courtId]) return data;
  const live = { ...data.liveByCourt }; delete live[courtId];
  return { ...data, liveByCourt: live };
}
/** Record a final score onto the fixture and drop its live binding. */
export function withResult(data: MultiData, matchId: string, hs: number, as: number): MultiData {
  const divisions = data.divisions.map((d) => ({
    ...d,
    rounds: (d.rounds || []).map((r) => ({ ...r, matches: r.matches.map((m) => (m.id === matchId ? { ...m, result: { hs, as } } : m)) })),
  }));
  const live: Record<string, string> = { ...(data.liveByCourt || {}) };
  for (const c of Object.keys(live)) if (live[c] === matchId) delete live[c];
  return { ...data, divisions, liveByCourt: live };
}

export async function saveTournament(id: string, data: MultiData): Promise<void> {
  const { error } = await supabase.from("tournaments").update({ data } as never).eq("id", id);
  if (error) throw error;
}

/** Live list of multi-division tournaments (read; refreshed every 15s). */
export function useMultiTournaments() {
  const [rows, setRows] = useState<TournRow[]>([]);
  useEffect(() => {
    let on = true;
    const load = () => supabase.from("tournaments").select("id,name,data").order("created_at", { ascending: false })
      .then(({ data }) => { if (on) setRows(((data || []) as unknown as TournRow[]).filter((r) => (r.data as MultiData)?.kind === "multi")); });
    load();
    const id = setInterval(load, 15000);
    return () => { on = false; clearInterval(id); };
  }, []);
  return [rows, setRows] as const;
}
