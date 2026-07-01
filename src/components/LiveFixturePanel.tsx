import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Radio, Link2Off, CheckCircle2 } from "lucide-react";
import { useTeams, patchGameState, type GameState } from "@/lib/game-state";
import { useMultiTournaments, ensureMatchIds, listMatches, findMatch, withBinding, withResult, withClearedCourt, saveTournament, courtNumberFromId, fixtureCourtNumber, fixtureSortKey } from "@/lib/live-link";

// Short day label for a fixture date. ISO "2026-07-04" → "04/07"; already-short values pass through.
function fmtDate(d?: string): string {
  if (!d) return "";
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}` : d;
}

// Bind THIS court to a scheduled fixture → the public site shows the live score on that exact
// fixture, and "Finish & record" writes the final into the tournament so standings update.
export function LiveFixturePanel({ s }: { s: GameState }) {
  const [rows] = useMultiTournaments();
  const teams = useTeams();
  const teamByName = useMemo(() => new Map(teams.map((t) => [t.name.trim().toLowerCase(), t])), [teams]);
  const [tid, setTid] = useState("");
  const [div, setDiv] = useState("All");
  const [allCourts, setAllCourts] = useState(false);
  const myCourtNo = courtNumberFromId(s.court_id); // 1 for "main", 2 for "court2", …

  // Is this court already bound to a fixture?
  const bound = useMemo(() => {
    for (const r of rows) {
      const mid = r.data.liveByCourt?.[s.court_id];
      if (mid) { const f = findMatch(r.data, mid); if (f) return { row: r, match: f.match, division: f.div.name, round: f.round.name }; }
    }
    return null;
  }, [rows, s.court_id]);

  const selRow = rows.find((r) => r.id === tid) || null;
  const ensured = useMemo(() => (selRow ? ensureMatchIds(selRow.data) : null), [selRow]);
  const allUnplayed = useMemo(() => (ensured ? listMatches(ensured).filter((m) => !m.played) : []), [ensured]);
  // Only fixtures scheduled on THIS court (unless the operator overrides). Fixtures with no court
  // in the schedule are shown to every court so they can still be loaded.
  const courtMatches = useMemo(() => allUnplayed.filter((m) => {
    if (allCourts) return true;
    const fc = fixtureCourtNumber(m.court);
    return fc === null || fc === myCourtNo;
  }).sort((a, b) => fixtureSortKey(a).localeCompare(fixtureSortKey(b))), [allUnplayed, allCourts, myCourtNo]);
  const divisions = useMemo(() => ["All", ...new Set(courtMatches.map((m) => m.division))], [courtMatches]);
  const shown = courtMatches.filter((m) => div === "All" || m.division === div);
  const hiddenOtherCourts = allUnplayed.length - courtMatches.length;

  async function assignTeams(home: string, away: string, tournamentName: string) {
    const h = teamByName.get(home.trim().toLowerCase());
    const a = teamByName.get(away.trim().toLowerCase());
    await patchGameState(s.court_id, {
      tournament_name: tournamentName,
      home_name: home, away_name: away,
      home_team_id: h?.id ?? null, away_team_id: a?.id ?? null,
      home_color: h?.primary_color ?? s.home_color, away_color: a?.primary_color ?? s.away_color,
      home_logo: h?.logo_url ?? null, away_logo: a?.logo_url ?? null,
      home_abbr: h?.abbreviation || home.slice(0, 3).toUpperCase(), away_abbr: a?.abbreviation || away.slice(0, 3).toUpperCase(),
      home_score: 0, away_score: 0, home_fouls: 0, away_fouls: 0, home_timeouts: 0, away_timeouts: 0, quarter: 1,
      home_on_court: [], away_on_court: [],
      game_clock_seconds: s.quarter_length_seconds, game_clock_running: false, game_clock_started_at: null,
      shot_clock_tenths: 240, shot_clock_running: false, shot_clock_started_at: null,
    } as Partial<GameState>);
  }

  async function bind(m: { id: string; home: string; away: string }) {
    if (!ensured || !selRow) return;
    try {
      await saveTournament(selRow.id, withBinding(ensured, s.court_id, m.id)); // persists ids + the binding
      await assignTeams(m.home, m.away, selRow.name);
      toast.success(`Linked ${m.home} vs ${m.away} → this court`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't link (are you signed in?)"); }
  }
  async function finish() {
    if (!bound?.match.id) return;
    const msg =
      `Finish & sync this result?\n\n` +
      `   ${bound.match.home}  ${s.home_score} – ${s.away_score}  ${bound.match.away}\n` +
      `   ${bound.division} · ${bound.round}\n\n` +
      `This will:\n` +
      `  • Save the final score to the database\n` +
      `  • Push it to the tournament website\n` +
      `  • Recalculate the standings table\n` +
      `  • Load this court's NEXT scheduled game onto the scoreboard\n`;
    if (!confirm(msg)) return;
    try {
      // 1) record the final (clears this match's live binding)
      let data = withResult(bound.row.data, bound.match.id, s.home_score, s.away_score);
      // 2) find the next unplayed fixture on THIS court (chronological)
      const ens = ensureMatchIds(data);
      const next = listMatches(ens)
        .filter((mm) => !mm.played && (() => { const fc = fixtureCourtNumber(mm.court); return fc === null || fc === myCourtNo; })())
        .sort((a, b) => fixtureSortKey(a).localeCompare(fixtureSortKey(b)))[0] || null;
      // 3) bind + persist (one write), then load the next teams onto this court
      data = next ? withBinding(ens, s.court_id, next.id) : ens;
      await saveTournament(bound.row.id, data);
      if (next) {
        await assignTeams(next.home, next.away, bound.row.name);
        toast.success(`Recorded ${s.home_score}–${s.away_score}. Loaded next: ${next.home} vs ${next.away}${next.time ? ` · ${next.time}` : ""}`);
      } else {
        toast.success(`Recorded ${s.home_score}–${s.away_score} — standings updated. No more fixtures on Court ${myCourtNo}.`);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't sync result — are you signed in?"); }
  }
  async function unlink() {
    if (!bound) return;
    try { await saveTournament(bound.row.id, withClearedCourt(bound.row.data, s.court_id)); toast.message("Live link cleared"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Radio className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-black uppercase tracking-wider">Live fixture link</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">Pushes this court's live score to the website's fixture</span>
      </div>

      {bound ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">● Linked · {bound.row.name}</p>
          <p className="mt-1 text-sm font-bold">{bound.match.home} <span className="text-muted-foreground">vs</span> {bound.match.away}</p>
          <p className="text-[11px] text-muted-foreground">{bound.division} · {bound.round}{bound.match.result ? ` · recorded ${bound.match.result.hs}–${bound.match.result.as}` : ""}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={finish} title="Save the final to the database, push it to the tournament website, and recalculate the standings" className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> Finish &amp; Sync Result · {s.home_score}–{s.away_score}
            </button>
            <button onClick={unlink} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-secondary">
              <Link2Off className="h-3.5 w-3.5" /> Unlink
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select value={tid} onChange={(e) => { setTid(e.target.value); setDiv("All"); }} className="rounded-md border bg-background px-2 py-1.5 text-xs font-semibold">
              <option value="">Pick a tournament…</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {divisions.length > 1 && (
              <select value={div} onChange={(e) => setDiv(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-xs font-semibold">
                {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <span className="ml-auto rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {allCourts ? "All courts" : `Court ${myCourtNo ?? "?"}`}
            </span>
            <label className="flex cursor-pointer items-center gap-1 text-[10px] font-semibold text-muted-foreground" title="Schedule normally limits each court to its own fixtures. Tick to show every court's fixtures.">
              <input type="checkbox" checked={allCourts} onChange={(e) => setAllCourts(e.target.checked)} /> show all
            </label>
          </div>
          {!selRow ? (
            <p className="text-xs text-muted-foreground">Choose a tournament, then pick the fixture this court is about to play. Only fixtures the schedule assigns to <span className="font-bold">Court {myCourtNo ?? "?"}</span> are shown.</p>
          ) : shown.length === 0 ? (
            <p className="text-xs text-muted-foreground">No unplayed fixtures for <span className="font-bold">Court {myCourtNo ?? "?"}</span> in this selection.{hiddenOtherCourts > 0 && !allCourts ? ` (${hiddenOtherCourts} on other courts — tick "show all" to see them.)` : ""}</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {shown.map((m) => (
                <button key={m.id} onClick={() => bind(m)} className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-secondary">
                  <span className="font-semibold">{m.home} <span className="text-muted-foreground">vs</span> {m.away}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{m.court ? `${m.court} · ` : ""}{m.division} · {[fmtDate(m.date), m.time].filter(Boolean).join(" ")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
