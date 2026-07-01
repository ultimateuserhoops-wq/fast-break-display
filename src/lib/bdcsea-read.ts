// Read-only access to the BDCSEA tour site (public anon key) so the Tournament Hub's
// Table tab can show LIVE standings from results entered there (via the bot / web publish).
// Anon key → read-only; never used to write.
const URL = (import.meta.env.VITE_BDCSEA_URL as string) || "";
const KEY = (import.meta.env.VITE_BDCSEA_ANON_KEY as string) || "";

export const bdcseaReadable = () => !!(URL && KEY);
const get = async (path: string) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`BDCSEA ${r.status}`);
  return r.json();
};

export type ResultMatch = { round: string; home: string; away: string; hs: number; as: number };
/** Completed matches per division for an event, keyed by the division label (the part after
 *  "<event> — "). Published sub-tournaments are named "<event> — <division>". */
export async function fetchEventResults(eventName?: string): Promise<Record<string, ResultMatch[]>> {
  if (!bdcseaReadable() || !eventName) return {};
  const prefix = `${eventName} — `;
  const subs = (await get(`sub_tournaments?select=id,label`)).filter((s: any) => typeof s.label === "string" && s.label.startsWith(prefix));
  const out: Record<string, ResultMatch[]> = {};
  for (const s of subs) {
    const ms = await get(`matches?sub_tournament_id=eq.${s.id}&status=eq.completed&select=home_team_id,away_team_id,home_score,away_score,round_type`);
    const ids = [...new Set(ms.flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter(Boolean))];
    const teams = ids.length ? await get(`teams?id=in.(${ids.join(",")})&select=id,name`) : [];
    const nm = new Map(teams.map((t: any) => [t.id, t.name]));
    out[s.label.slice(prefix.length)] = ms.map((m: any) => ({
      round: m.round_type ?? "", home: nm.get(m.home_team_id) ?? "?", away: nm.get(m.away_team_id) ?? "?",
      hs: m.home_score ?? 0, as: m.away_score ?? 0,
    }));
  }
  return out;
}
