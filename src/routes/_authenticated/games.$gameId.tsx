import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { useGame, deleteGame, type SavedGame } from "@/lib/games";
import { aggregateBoxScore, type GameEvent } from "@/lib/game-state";
import { ShotChart, type ShotMarker } from "@/components/ShotChart";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ink } from "@/lib/color";

export const Route = createFileRoute("/_authenticated/games/$gameId")({
  head: () => ({ meta: [{ title: "Saved game — BDC" }] }),
  component: GameDetail,
});

function GameDetail() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const g = useGame(gameId);
  const [tab, setTab] = useState<"box" | "shots" | "pbp">("box");

  if (!g) {
    return <div className="min-h-screen bg-background"><TopNav /><main className="p-8 text-sm text-muted-foreground">Loading…</main></div>;
  }
  const events = g.data?.events ?? [];

  async function remove() {
    if (!confirm("Delete this saved game permanently?")) return;
    try { await deleteGame(gameId); toast.success("Game deleted"); navigate({ to: "/games" }); }
    catch { toast.error("Could not delete"); }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <Link to="/games" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Game History
          </Link>
          <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>

        {/* Header / final score */}
        <div className="mt-4 rounded-2xl border bg-card p-6">
          {g.tournament_name && <p className="text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">{g.tournament_name}</p>}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-black" style={{ color: ink(g.home_color) }}>{g.home_name}</p>
              <p className="clock-digits text-5xl font-black">{g.home_score}</p>
            </div>
            <span className="text-sm font-bold text-muted-foreground">vs</span>
            <div className="text-left">
              <p className="text-lg font-black" style={{ color: ink(g.away_color) }}>{g.away_name}</p>
              <p className="clock-digits text-5xl font-black">{g.away_score}</p>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {new Date(g.played_at).toLocaleString()} · Court {g.court_id} · {events.length} events
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-1">
          {([["box", "Box score"], ["shots", "Shot chart"], ["pbp", "Play-by-play"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === k ? "bg-foreground text-background" : "border hover:bg-secondary"}`}>{label}</button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "box" && (
            <div className="grid gap-5 md:grid-cols-2">
              <BoxSide g={g} side="home" events={events} />
              <BoxSide g={g} side="away" events={events} />
            </div>
          )}
          {tab === "shots" && (
            <div className="grid gap-5 md:grid-cols-2">
              <ShotSide g={g} side="home" events={events} />
              <ShotSide g={g} side="away" events={events} />
            </div>
          )}
          {tab === "pbp" && <PlayByPlay g={g} events={events} />}
        </div>
      </main>
    </div>
  );
}

function names(events: GameEvent[]) {
  const m = new Map<string, { name: string; num: string }>();
  for (const e of events) if (e.player_id) m.set(e.player_id, { name: e.player_name ?? "", num: e.player_number ?? "" });
  return m;
}

function BoxSide({ g, side, events }: { g: SavedGame; side: "home" | "away"; events: GameEvent[] }) {
  const color = (side === "home" ? g.home_color : g.away_color) ?? "#888";
  const name = side === "home" ? g.home_name : g.away_name;
  const lookup = useMemo(() => names(events), [events]);
  const lines = useMemo(() => {
    const box = aggregateBoxScore(events.filter((e) => e.team_side === side));
    return [...box.values()].sort((a, b) => b.pts - a.pts);
  }, [events, side]);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-2 px-4 py-2 text-sm font-black uppercase tracking-wider text-white" style={{ background: color }}>
        <span className="h-2.5 w-2.5 rounded-full bg-white/80" /> {name}
      </div>
      <div className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem_2.2rem_2.2rem] gap-1 px-3 py-1.5 text-[10px] font-black uppercase text-muted-foreground">
        <span>Player</span><span className="text-center">PTS</span><span className="text-center">REB</span><span className="text-center">AST</span><span className="text-center">STL</span><span className="text-center">FLS</span>
      </div>
      <div className="divide-y text-xs">
        {lines.length === 0 && <p className="px-3 py-3 text-muted-foreground">No player stats recorded.</p>}
        {lines.map((l) => {
          const p = lookup.get(l.playerId);
          return (
            <div key={l.playerId} className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem_2.2rem_2.2rem] gap-1 px-3 py-1.5">
              <span className="truncate"><span className="clock-digits font-black" style={{ color }}>{p?.num || "—"}</span> {p?.name}</span>
              <span className="clock-digits text-center font-black">{l.pts}</span>
              <span className="text-center">{l.reb}</span>
              <span className="text-center">{l.ast}</span>
              <span className="text-center">{l.stl}</span>
              <span className="text-center">{l.fls}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShotSide({ g, side, events }: { g: SavedGame; side: "home" | "away"; events: GameEvent[] }) {
  const color = (side === "home" ? g.home_color : g.away_color) ?? "#888";
  const name = side === "home" ? g.home_name : g.away_name;
  const { markers, fgm, fga, tpm, tpa } = useMemo(() => {
    const ms: ShotMarker[] = [];
    let _fgm = 0, _fga = 0, _tpm = 0, _tpa = 0;
    for (const e of events) {
      if (e.team_side !== side) continue;
      const is2 = e.event_type.startsWith("2PT"), is3 = e.event_type.startsWith("3PT");
      if (!is2 && !is3) continue;
      const made = e.event_type.endsWith("_MADE");
      _fga++; if (made) _fgm++;
      if (is3) { _tpa++; if (made) _tpm++; }
      if (e.note) { try { const loc = JSON.parse(e.note); if (typeof loc?.x === "number") ms.push({ x: loc.x, y: loc.y, made, color }); } catch { /* skip */ } }
    }
    return { markers: ms, fgm: _fgm, fga: _fga, tpm: _tpm, tpa: _tpa };
  }, [events, side, color]);
  const pct = (m: number, a: number) => (a > 0 ? `${Math.round((m / a) * 100)}%` : "—");
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: color }} /><span className="text-sm font-black">{name}</span></div>
        <span className="text-[11px] text-muted-foreground">FG {fgm}-{fga} ({pct(fgm, fga)}) · 3P {tpm}-{tpa} ({pct(tpm, tpa)})</span>
      </div>
      <ShotChart markers={markers} />
    </div>
  );
}

function PlayByPlay({ g, events }: { g: SavedGame; events: GameEvent[] }) {
  const ordered = useMemo(() => [...events].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))), [events]);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="max-h-[520px] divide-y overflow-y-auto text-xs">
        {ordered.length === 0 && <p className="px-3 py-4 text-center text-muted-foreground">No play-by-play recorded.</p>}
        {ordered.map((e) => {
          const home = e.team_side === "home";
          const color = ink(home ? g.home_color : g.away_color);
          return (
            <div key={e.id} className="grid grid-cols-[2.5rem_1fr_4.5rem_2.5rem] items-center gap-2 px-3 py-1.5">
              <span className="text-muted-foreground">Q{e.quarter}</span>
              <span className="truncate"><span className="font-black uppercase" style={{ color: color ?? undefined }}>{home ? g.home_abbr || "H" : g.away_abbr || "A"}</span> {e.player_number ? `#${e.player_number} ` : ""}{e.player_name}</span>
              <span className="font-semibold">{e.event_type}</span>
              <span className="clock-digits text-right">{e.points || ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
