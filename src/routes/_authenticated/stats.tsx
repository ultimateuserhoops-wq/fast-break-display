import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { usePlayerStats, useStandings, useTournaments, usePlayerGameLog, type PlayerStat } from "@/lib/season";
import { useGames } from "@/lib/games";
import { BarChart3, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({ meta: [{ title: "Season Stats — BDC" }] }),
  component: SeasonStats,
});

function SeasonStats() {
  const [tab, setTab] = useState<"players" | "teams" | "h2h">("players");
  const [tournament, setTournament] = useState("");
  const tournaments = useTournaments();
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight"><BarChart3 className="h-7 w-7" /> Season Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">Aggregated across every saved game.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {([["players", "Player leaderboard"], ["teams", "Team standings"], ["h2h", "Head-to-head"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === k ? "bg-foreground text-background" : "border hover:bg-secondary"}`}>{label}</button>
            ))}
          </div>
          {tab !== "h2h" && tournaments.length > 0 && (
            <select value={tournament} onChange={(e) => setTournament(e.target.value)} className="ml-auto rounded-lg border bg-background px-3 py-2 text-sm font-semibold">
              <option value="">All tournaments</option>
              {tournaments.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        <div className="mt-5">{tab === "players" ? <Leaderboard tournament={tournament} /> : tab === "teams" ? <Standings tournament={tournament} /> : <HeadToHead />}</div>
      </main>
    </div>
  );
}

function HeadToHead() {
  const { teams } = useStandings();
  const { games, loading } = useGames();
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const opts = useMemo(() => teams.slice().sort((x, y) => (x.team_name ?? "").localeCompare(y.team_name ?? "")), [teams]);
  const matchups = useMemo(() => {
    if (!a || !b || a === b) return [];
    return games
      .filter((g) => (g.home_team_id === a && g.away_team_id === b) || (g.home_team_id === b && g.away_team_id === a))
      .sort((x, y) => String(y.played_at).localeCompare(String(x.played_at)));
  }, [games, a, b]);

  const rec = useMemo(() => {
    let aw = 0, bw = 0, af = 0, bff = 0;
    for (const g of matchups) {
      const aHome = g.home_team_id === a;
      const as = aHome ? g.home_score : g.away_score;
      const bs = aHome ? g.away_score : g.home_score;
      af += as; bff += bs;
      if (as > bs) aw++; else if (bs > as) bw++;
    }
    return { aw, bw, af, bf: bff };
  }, [matchups, a]);

  const nameOf = (id: string) => teams.find((t) => t.team_id === id)?.team_name ?? "—";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={a} onChange={(e) => setA(e.target.value)} className="rounded-md border bg-background px-3 py-2 font-semibold">
          <option value="">Team A…</option>
          {opts.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
        </select>
        <span className="text-xs font-bold uppercase text-muted-foreground">vs</span>
        <select value={b} onChange={(e) => setB(e.target.value)} className="rounded-md border bg-background px-3 py-2 font-semibold">
          <option value="">Team B…</option>
          {opts.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
        </select>
      </div>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {a && b && a !== b && (
        <div className="mt-4">
          <div className="rounded-2xl border bg-card p-5 text-center">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <p className="text-right text-base font-black">{nameOf(a)}</p>
              <p className="clock-digits text-4xl font-black">{rec.aw}<span className="px-2 text-muted-foreground">–</span>{rec.bw}</p>
              <p className="text-left text-base font-black">{nameOf(b)}</p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{matchups.length} game{matchups.length === 1 ? "" : "s"} · total points {rec.af}–{rec.bf}</p>
          </div>

          <div className="mt-3 space-y-2">
            {matchups.length === 0 && <p className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">These two teams haven't met in a saved game yet.</p>}
            {matchups.map((g) => {
              const aHome = g.home_team_id === a;
              const as = aHome ? g.home_score : g.away_score;
              const bs = aHome ? g.away_score : g.home_score;
              return (
                <Link key={g.id} to="/games/$gameId" params={{ gameId: g.id }} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 text-sm hover:bg-secondary/40">
                  <span className="text-[11px] text-muted-foreground">{new Date(g.played_at).toLocaleDateString()}</span>
                  <span className="font-black">
                    <span className={as > bs ? "" : "text-muted-foreground"}>{as}</span>
                    <span className="px-1.5 text-muted-foreground">–</span>
                    <span className={bs > as ? "" : "text-muted-foreground"}>{bs}</span>
                  </span>
                  <span className="w-16 text-right text-[11px] font-semibold uppercase text-muted-foreground">{g.tournament_name || g.court_id}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const SORTS: Array<{ key: keyof PlayerStat | "ppg"; label: string }> = [
  { key: "pts", label: "Points" }, { key: "ppg", label: "Pts / game" },
  { key: "reb", label: "Rebounds" }, { key: "ast", label: "Assists" },
  { key: "stl", label: "Steals" }, { key: "blk", label: "Blocks" },
];
const val = (p: PlayerStat, k: keyof PlayerStat | "ppg") => (k === "ppg" ? (p.games ? p.pts / p.games : 0) : (p[k] as number));
const pct = (m: number, a: number) => (a > 0 ? `${Math.round((m / a) * 100)}%` : "—");

function Leaderboard({ tournament }: { tournament: string }) {
  const { players, loading } = usePlayerStats(tournament);
  const [sort, setSort] = useState<keyof PlayerStat | "ppg">("pts");
  const [perGame, setPerGame] = useState(false);
  const [minG, setMinG] = useState(1);
  const [sel, setSel] = useState<PlayerStat | null>(null);

  const rows = useMemo(
    () => players.filter((p) => p.games >= minG).slice().sort((a, b) => val(b, sort) - val(a, sort)),
    [players, sort, minG],
  );
  const show = (p: PlayerStat, v: number) => (perGame && p.games ? (v / p.games).toFixed(1) : String(v));

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (players.length === 0) return <Empty />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold uppercase tracking-wide text-muted-foreground">Sort</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as never)} className="rounded-md border bg-background px-2 py-1 font-semibold">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={perGame} onChange={(e) => setPerGame(e.target.checked)} /> per-game</label>
        <label className="ml-auto flex items-center gap-1.5">min games <input type="number" min={1} value={minG} onChange={(e) => setMinG(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 rounded-md border bg-background px-2 py-1" /></label>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-[2rem_1fr_2.4rem_3rem_3rem_2.6rem_2.6rem_3rem_3rem] gap-1 bg-secondary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          <span>#</span><span>Player</span><span className="text-center">GP</span><span className="text-center">PTS</span><span className="text-center">PPG</span><span className="text-center">REB</span><span className="text-center">AST</span><span className="text-center">FG%</span><span className="text-center">3P%</span>
        </div>
        <div className="divide-y text-xs">
          {rows.map((p, i) => (
            <div key={p.player_id} onClick={() => setSel(p)} title="Game log" className="grid cursor-pointer grid-cols-[2rem_1fr_2.4rem_3rem_3rem_2.6rem_2.6rem_3rem_3rem] items-center gap-1 px-3 py-1.5 hover:bg-secondary/50">
              <span className="font-black text-muted-foreground">{i + 1}</span>
              <span className="truncate"><span className="clock-digits font-black">{p.player_number || "—"}</span> {p.player_name}<span className="ml-1 text-[10px] text-muted-foreground">{p.team_name}</span></span>
              <span className="text-center text-muted-foreground">{p.games}</span>
              <span className="clock-digits text-center font-black">{show(p, p.pts)}</span>
              <span className="clock-digits text-center">{p.games ? (p.pts / p.games).toFixed(1) : "0.0"}</span>
              <span className="text-center">{show(p, p.reb)}</span>
              <span className="text-center">{show(p, p.ast)}</span>
              <span className="text-center">{pct(p.fgm, p.fga)}</span>
              <span className="text-center">{pct(p.tpm, p.tpa)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Tap a player for their game-by-game log.</p>
      {sel && <PlayerLogModal player={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function PlayerLogModal({ player, onClose }: { player: PlayerStat; onClose: () => void }) {
  const { log, loading } = usePlayerGameLog(player.player_id);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-2xl border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{player.team_name}</p>
            <h3 className="text-lg font-black"><span className="clock-digits">{player.player_number || "—"}</span> {player.player_name}</h3>
            <p className="text-[11px] text-muted-foreground">{player.games} games · {player.pts} pts · {(player.games ? player.pts / player.games : 0).toFixed(1)} ppg</p>
          </div>
          <button onClick={onClose} className="rounded-md border p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_2.6rem_2.4rem_2.4rem_2.4rem_3.4rem_3rem] gap-1 bg-secondary px-3 py-1.5 text-[10px] font-black uppercase text-muted-foreground">
            <span>Game</span><span className="text-center">PTS</span><span className="text-center">REB</span><span className="text-center">AST</span><span className="text-center">STL</span><span className="text-center">FG</span><span className="text-center">3P</span>
          </div>
          <div className="max-h-[55vh] divide-y overflow-y-auto text-xs">
            {loading && <p className="px-3 py-3 text-muted-foreground">Loading…</p>}
            {!loading && log.length === 0 && <p className="px-3 py-3 text-muted-foreground">No games found.</p>}
            {log.map((r) => (
              <div key={r.game_id} className="grid grid-cols-[1fr_2.6rem_2.4rem_2.4rem_2.4rem_3.4rem_3rem] gap-1 px-3 py-1.5">
                <span className="truncate"><span className="text-muted-foreground">{new Date(r.played_at).toLocaleDateString()}</span> vs {r.opponent ?? "—"}</span>
                <span className="clock-digits text-center font-black">{r.pts}</span>
                <span className="text-center">{r.reb}</span>
                <span className="text-center">{r.ast}</span>
                <span className="text-center">{r.stl}</span>
                <span className="text-center">{r.fgm}-{r.fga}</span>
                <span className="text-center">{r.tpm}-{r.tpa}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Standings({ tournament }: { tournament: string }) {
  const { teams, loading } = useStandings(tournament);
  const rows = useMemo(
    () => teams.slice().sort((a, b) => (b.wins - a.wins) || ((b.points_for - b.points_against) - (a.points_for - a.points_against))),
    [teams],
  );
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (teams.length === 0) return <Empty />;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="grid grid-cols-[2rem_1fr_2.4rem_2.4rem_2.4rem_3.4rem_3.4rem_3.4rem] gap-1 bg-secondary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        <span>#</span><span>Team</span><span className="text-center">GP</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-center">PF</span><span className="text-center">PA</span><span className="text-center">Diff</span>
      </div>
      <div className="divide-y text-xs">
        {rows.map((t, i) => {
          const diff = t.points_for - t.points_against;
          return (
            <div key={t.team_id} className="grid grid-cols-[2rem_1fr_2.4rem_2.4rem_2.4rem_3.4rem_3.4rem_3.4rem] items-center gap-1 px-3 py-1.5">
              <span className="font-black text-muted-foreground">{i + 1}</span>
              <span className="truncate font-semibold">{t.team_name}</span>
              <span className="text-center text-muted-foreground">{t.games}</span>
              <span className="clock-digits text-center font-black">{t.wins}</span>
              <span className="clock-digits text-center">{t.losses}</span>
              <span className="text-center">{t.points_for}</span>
              <span className="text-center">{t.points_against}</span>
              <span className={`text-center font-semibold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-destructive" : ""}`}>{diff > 0 ? "+" : ""}{diff}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty() {
  return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No saved games yet — stats appear here once you finish games (Game History fills as you go).</p>;
}
