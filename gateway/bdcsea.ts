// Publish a scoreboard tournament into the BDCSEA tour site's database (additive):
// new sub-tournament + any missing teams + the bracket's real-team matches. The
// BDCSEA site (/schedule, /standings) then shows them. Writes via its Supabase REST.
const URL = process.env.BDCSEA_SUPABASE_URL || "";
// Prefer the service-role key (private gateway → can write); fall back to the anon key
// (read-only on most tables). The service key NEVER ships to a browser — only this LAN gateway.
const KEY = process.env.BDCSEA_SERVICE_KEY || process.env.BDCSEA_SUPABASE_KEY || "";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const slug = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 24) || "GEN";

export function bdcseaConfigured() { return !!(URL && KEY); }
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}` });

export async function bget(path: string): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`BDCSEA GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function bins(table: string, body: object, returnRep = false): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H(), "content-type": "application/json", Prefer: returnRep ? "return=representation" : "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`BDCSEA insert ${table} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return returnRep ? r.json() : [];
}
async function bpatch(path: string, body: object): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method: "PATCH", headers: { ...H(), "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`BDCSEA patch ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
async function bdel(path: string): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method: "DELETE", headers: { ...H(), Prefer: "return=minimal" } });
  if (!r.ok) throw new Error(`BDCSEA delete ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Sub-tournaments under the active tournament (the bot's "ongoing" list).
 *  Auto-archive: a tournament drops off this list once its finish_date is >1 week
 *  past (finished tournaments stay in the public site, just not in the edit list).
 *  Ones with no finish_date stay listed until removed. Pass all=true to ignore the filter. */
export async function bdcseaOngoing(all = false): Promise<{ id: string; label: string; finish_date: string | null }[]> {
  const t = await bget("tournaments?is_active=eq.true&select=id&limit=1");
  if (!t.length) return [];
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10); // today − 7d
  const filter = all ? "" : `&or=(finish_date.is.null,finish_date.gte.${cutoff})`;
  return (await bget(`sub_tournaments?tournament_id=eq.${t[0].id}&select=id,label,finish_date${filter}&order=sort_order`))
    .map((s: any) => ({ id: s.id, label: s.label, finish_date: s.finish_date ?? null }));
}

/** Permanently remove a sub-tournament: its standings, its matches, then the row. */
export async function bdcseaRemoveSub(subId: string): Promise<{ label: string }> {
  if (!URL || !KEY) throw new Error("BDCSEA creds not set on the gateway");
  const row = (await bget(`sub_tournaments?id=eq.${subId}&select=label`))[0];
  if (!row) throw new Error("That tournament no longer exists");
  await bdel(`standings?sub_tournament_id=eq.${subId}`);
  await bdel(`matches?sub_tournament_id=eq.${subId}`);
  await bdel(`sub_tournaments?id=eq.${subId}`);
  return { label: row.label };
}

/** Matches of a sub-tournament (with team names) for the score-edit list. */
export async function bdcseaMatches(subId: string): Promise<{ id: string; home: string; away: string; home_score: number; away_score: number; status: string; round_type: string | null }[]> {
  const ms = await bget(`matches?sub_tournament_id=eq.${subId}&select=id,home_team_id,away_team_id,home_score,away_score,status,round_type&order=created_at`);
  const ids = [...new Set(ms.flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter(Boolean))];
  const teams = ids.length ? await bget(`teams?id=in.(${ids.join(",")})&select=id,name`) : [];
  const nm = new Map(teams.map((t: any) => [t.id, t.name]));
  return ms.map((m: any) => ({ id: m.id, home: nm.get(m.home_team_id) ?? "?", away: nm.get(m.away_team_id) ?? "?", home_score: m.home_score ?? 0, away_score: m.away_score ?? 0, status: m.status, round_type: m.round_type }));
}

/** Set a match score (re-editable) and recompute that sub-tournament's standings. */
export async function bdcseaSetScore(matchId: string, home: number, away: number): Promise<void> {
  if (!URL || !KEY) throw new Error("BDCSEA creds not set on the gateway");
  const m = (await bget(`matches?id=eq.${matchId}&select=sub_tournament_id`))[0];
  await bpatch(`matches?id=eq.${matchId}`, { home_score: home, away_score: away, status: "completed" });
  if (m?.sub_tournament_id) await recomputeStandings(m.sub_tournament_id);
}

async function recomputeStandings(subId: string): Promise<void> {
  const ms = await bget(`matches?sub_tournament_id=eq.${subId}&status=eq.completed&select=home_team_id,away_team_id,home_score,away_score`);
  type Row = { wins: number; losses: number; pf: number; pa: number };
  const tally = new Map<string, Row>();
  const get = (id: string) => tally.get(id) ?? { wins: 0, losses: 0, pf: 0, pa: 0 };
  for (const m of ms) {
    const h = get(m.home_team_id), a = get(m.away_team_id);
    h.pf += m.home_score; h.pa += m.away_score; a.pf += m.away_score; a.pa += m.home_score;
    if (m.home_score > m.away_score) { h.wins++; a.losses++; } else if (m.away_score > m.home_score) { a.wins++; h.losses++; }
    tally.set(m.home_team_id, h); tally.set(m.away_team_id, a);
  }
  await bdel(`standings?sub_tournament_id=eq.${subId}`);
  const ranked = [...tally.entries()].sort((x, y) => (y[1].wins - x[1].wins) || ((y[1].pf - y[1].pa) - (x[1].pf - x[1].pa)));
  let rank = 1;
  for (const [team_id, r] of ranked) {
    await bins("standings", { sub_tournament_id: subId, team_id, wins: r.wins, losses: r.losses, points_for: r.pf, points_against: r.pa, rank: rank++ });
  }
}

export async function publishToBdcsea(opts: {
  name: string; format?: string; finishDate?: string | null;
  teams: { name: string; abbrev?: string | null; color?: string | null }[];
  rounds?: { name: string; matches: { home: string; away: string; court?: string; date?: string; time?: string }[] }[];
}) {
  if (!URL || !KEY) throw new Error("BDCSEA_SUPABASE_URL / BDCSEA_SUPABASE_KEY are not set on the gateway");
  if (!opts.name || !opts.teams?.length) throw new Error("name and teams are required");

  // 1) attach to the active BDCSEA tournament
  const tourn = await bget("tournaments?is_active=eq.true&select=id&limit=1");
  if (!tourn.length) throw new Error("No active tournament in the BDCSEA site to attach to");
  const tournament_id = tourn[0].id;

  // 2) new sub-tournament (this scoreboard tournament becomes its own section)
  const sub = await bins("sub_tournaments", { tournament_id, code: slug(opts.name), label: opts.name, gender: "all", sort_order: 999, finish_date: opts.finishDate || null }, true);
  const sub_tournament_id = sub[0]?.id;
  if (!sub_tournament_id) throw new Error("Could not create the BDCSEA sub-tournament");

  // 3) teams — match existing by name, create the rest
  const existing = await bget("teams?select=id,name");
  const byName = new Map<string, string>(existing.map((t: any) => [norm(t.name ?? ""), t.id]));
  const teamId = new Map<string, string>();
  let createdTeams = 0;
  for (const t of opts.teams) {
    const k = norm(t.name);
    if (byName.has(k)) { teamId.set(t.name, byName.get(k)!); continue; }
    const id = crypto.randomUUID();
    await bins("teams", { id, name: t.name, abbrev: t.abbrev ?? null, color: t.color ?? null });
    teamId.set(t.name, id); byName.set(k, id); createdTeams++;
  }

  // 4) matches — only rounds where BOTH sides are real teams (skip "Winner …" / bye placeholders)
  let createdMatches = 0, skipped = 0;
  for (const r of opts.rounds ?? []) {
    for (const m of r.matches ?? []) {
      const h = teamId.get(m.home), a = teamId.get(m.away);
      if (!h || !a) { skipped++; continue; }
      const row: Record<string, unknown> = { sub_tournament_id, home_team_id: h, away_team_id: a, status: "scheduled", round_type: r.name, home_score: 0, away_score: 0 };
      if (m.date) row.match_date = m.date;     // from the auto-scheduler
      if (m.time) row.match_time = m.time;
      if (m.court) row.court = m.court;
      await bins("matches", row);
      createdMatches++;
    }
  }

  return { sub_tournament_id, createdTeams, matchedTeams: opts.teams.length - createdTeams, createdMatches, skippedPlaceholderMatches: skipped };
}
