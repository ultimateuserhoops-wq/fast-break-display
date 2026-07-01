import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { useGames, type SavedGame } from "@/lib/games";
import { Trophy, Search } from "lucide-react";
import { ink } from "@/lib/color";

export const Route = createFileRoute("/_authenticated/games/")({
  head: () => ({ meta: [{ title: "Game History — BDC" }] }),
  component: GamesList,
});

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso.slice(0, 10); }
}

function GamesList() {
  const { games, loading } = useGames();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");

  // unique teams that appear in the archive (for the filter)
  const teamOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of games) {
      if (g.home_team_id && g.home_name) m.set(g.home_team_id, g.home_name);
      if (g.away_team_id && g.away_name) m.set(g.away_team_id, g.away_name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [games]);

  const filtered = games.filter((g) =>
    (!team || g.home_team_id === team || g.away_team_id === team) &&
    (!q || `${g.home_name} ${g.away_name} ${g.tournament_name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight"><Trophy className="h-7 w-7" /> Game History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Finished games — box score, shot chart and play-by-play, kept per matchup.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams / tournament…" className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
            <option value="">All teams</option>
            {teamOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>

        <div className="mt-5 space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No saved games yet. Finish a game (Court Control → <span className="font-semibold">New Game</span>, or <span className="font-semibold">Save game</span>) and it'll appear here.
            </p>
          )}
          {filtered.map((g) => <GameCard key={g.id} g={g} />)}
        </div>
      </main>
    </div>
  );
}

function GameCard({ g }: { g: SavedGame }) {
  const homeWin = g.home_score > g.away_score;
  const awayWin = g.away_score > g.home_score;
  return (
    <Link to="/games/$gameId" params={{ gameId: g.id }} className="block rounded-2xl border bg-card p-4 transition hover:bg-secondary/40">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ink(g.home_color, "#888") }} />
            <span className={`truncate font-black ${homeWin ? "" : "text-muted-foreground"}`}>{g.home_name ?? "—"}</span>
            <span className={`clock-digits ml-auto text-xl font-black ${homeWin ? "" : "text-muted-foreground"}`}>{g.home_score}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ink(g.away_color, "#888") }} />
            <span className={`truncate font-black ${awayWin ? "" : "text-muted-foreground"}`}>{g.away_name ?? "—"}</span>
            <span className={`clock-digits ml-auto text-xl font-black ${awayWin ? "" : "text-muted-foreground"}`}>{g.away_score}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-border" />
        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          <p className="font-semibold text-foreground">{fmtDate(g.played_at)}</p>
          {g.tournament_name && <p className="max-w-[10rem] truncate">{g.tournament_name}</p>}
          <p className="uppercase">{g.court_id}</p>
        </div>
      </div>
    </Link>
  );
}
