import { createFileRoute, Link } from "@tanstack/react-router";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { useGameState, useGameEvents, formatClock, type GameEvent } from "@/lib/game-state";
import { ink } from "@/lib/color";

export const Route = createFileRoute("/_authenticated/game-log/$courtId")({
  head: () => ({ meta: [{ title: "Game Log — BDC" }] }),
  component: GameLogPage,
});

function eventBadge(e: GameEvent): { label: string; cls: string } {
  switch (e.event_type) {
    case "3PT_MADE": return { label: "+3", cls: "bg-emerald-600 text-white" };
    case "2PT_MADE": return { label: "+2", cls: "bg-emerald-500 text-white" };
    case "FT_MADE":  return { label: "+1", cls: "bg-emerald-400 text-white" };
    case "2PT_MISS":
    case "3PT_MISS":
    case "FT_MISS":  return { label: "MISS", cls: "bg-zinc-400 text-white" };
    case "FOUL":     return { label: "FOUL", cls: "bg-destructive text-destructive-foreground" };
    case "REB":      return { label: "REB", cls: "bg-sky-500 text-white" };
    case "AST":      return { label: "AST", cls: "bg-violet-500 text-white" };
    case "STL":      return { label: "STL", cls: "bg-amber-500 text-white" };
    case "BLK":      return { label: "BLK", cls: "bg-rose-500 text-white" };
    case "TO":       return { label: "TO",  cls: "bg-orange-500 text-white" };
    case "TIMEOUT":  return { label: "T/O", cls: "bg-zinc-700 text-white" };
    default:         return { label: e.event_type, cls: "bg-secondary text-foreground" };
  }
}

function GameLogPage() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const events = useGameEvents(courtId);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Play-by-play</p>
            <h1 className="text-3xl font-black tracking-tight">Game Log</h1>
            {s && <p className="mt-1 text-sm text-muted-foreground">{s.home_name} vs {s.away_name} · {s.tournament_name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <CourtSelector activeId={courtId} />
            <Link to="/scoreboard/$courtId" params={{ courtId }} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
              Back to control
            </Link>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
          <div className="grid grid-cols-[60px_70px_70px_1fr_120px] border-b bg-secondary/40 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Q</span>
            <span>Clock</span>
            <span>Side</span>
            <span>Event</span>
            <span className="text-right">When</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {events.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No events yet. Start scoring on the control panel.</p>
            )}
            {events.map((e) => {
              const b = eventBadge(e);
              const sideColor = ink(e.team_side === "home" ? s?.home_color : s?.away_color);
              const sideName = e.team_side === "home" ? s?.home_name : s?.away_name;
              return (
                <div key={e.id} className="grid grid-cols-[60px_70px_70px_1fr_120px] items-center border-b px-4 py-2 text-sm last:border-0">
                  <span className="clock-digits text-xs font-bold">Q{e.quarter}</span>
                  <span className="clock-digits text-xs text-muted-foreground">{formatClock(Number(e.game_clock_seconds ?? 0))}</span>
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase">
                    <span className="h-2 w-2 rounded-full" style={{ background: sideColor ?? "#999" }} />
                    {sideName ?? e.team_side}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${b.cls}`}>{b.label}</span>
                    {e.player_name && (
                      <span className="text-sm">
                        <span className="clock-digits font-bold" style={{ color: sideColor ?? undefined }}>#{e.player_number || "—"}</span>{" "}
                        {e.player_name}
                      </span>
                    )}
                    {!e.player_name && <span className="text-xs text-muted-foreground">team event</span>}
                    {e.note && <span className="text-xs italic text-muted-foreground">— {e.note}</span>}
                  </span>
                  <span className="text-right text-[10px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
