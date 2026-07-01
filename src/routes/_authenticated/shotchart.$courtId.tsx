import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { ShotChart, type ShotMarker } from "@/components/ShotChart";
import { useGameState, useGameEvents, type GameState, type GameEvent } from "@/lib/game-state";
import { useCourtImage } from "@/lib/ads";

export const Route = createFileRoute("/_authenticated/shotchart/$courtId")({
  head: () => ({ meta: [{ title: "Shot Chart — BDC" }] }),
  component: ShotChartPage,
});

type Scope = "both" | "home" | "away";

function ShotChartPage() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const events = useGameEvents(courtId);
  const court = useCourtImage();
  const [scope, setScope] = useState<Scope>("both");

  if (!s) {
    return <div className="min-h-screen bg-background"><TopNav /><main className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">Loading…</main></div>;
  }

  const sides: Array<"home" | "away"> = scope === "both" ? ["home", "away"] : [scope];

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Analysis</p>
            <h1 className="text-3xl font-black tracking-tight">Shot Chart</h1>
          </div>
          <CourtSelector activeId={courtId} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team</span>
          {(["both", "home", "away"] as Scope[]).map((v) => (
            <button key={v} onClick={() => setScope(v)} className={`rounded-md border px-3 py-1.5 text-xs font-bold ${scope === v ? "bg-foreground text-background" : "hover:bg-secondary"}`}>
              {v === "home" ? s.home_name : v === "away" ? s.away_name : "Both"}
            </button>
          ))}
        </div>

        <div className={`mt-5 grid gap-6 ${sides.length === 2 ? "md:grid-cols-2" : "mx-auto max-w-xl"}`}>
          {sides.map((side) => <TeamShotChart key={side} s={s} side={side} events={events} court={court} />)}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">○ made · ✕ missed — recorded from the Player Stat Keeping shot chart.</p>
      </main>
    </div>
  );
}

function TeamShotChart({ s, side, events, court }: { s: GameState; side: "home" | "away"; events: GameEvent[]; court: string | null }) {
  const color = side === "home" ? s.home_color : s.away_color;
  const name = side === "home" ? s.home_name : s.away_name;

  const { markers, fg, tp } = useMemo(() => {
    const ms: ShotMarker[] = [];
    let fgm = 0, fga = 0, tpm = 0, tpa = 0;
    for (const e of events) {
      if (e.team_side !== side) continue;
      const is2 = e.event_type.startsWith("2PT");
      const is3 = e.event_type.startsWith("3PT");
      if (!is2 && !is3) continue;
      const made = e.event_type.endsWith("_MADE");
      fga++; if (made) fgm++;
      if (is3) { tpa++; if (made) tpm++; }
      if (e.note) {
        try { const loc = JSON.parse(e.note); if (typeof loc?.x === "number") ms.push({ x: loc.x, y: loc.y, made, color }); } catch { /* skip */ }
      }
    }
    return { markers: ms, fg: { m: fgm, a: fga }, tp: { m: tpm, a: tpa } };
  }, [events, side, color]);

  const pct = (m: number, a: number) => (a > 0 ? `${Math.round((m / a) * 100)}%` : "—");

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} />
          <h2 className="text-base font-black uppercase">{name}</h2>
        </div>
        <div className="flex gap-4 text-xs font-bold">
          <span>FG <span className="text-muted-foreground">{fg.m}/{fg.a} ({pct(fg.m, fg.a)})</span></span>
          <span>3P <span className="text-muted-foreground">{tp.m}/{tp.a} ({pct(tp.m, tp.a)})</span></span>
        </div>
      </div>
      <ShotChart markers={markers} bgImage={court} />
      {markers.length === 0 && <p className="mt-2 text-center text-[11px] text-muted-foreground">No located shots yet — log shots via the court in Player Stat Keeping.</p>}
    </div>
  );
}
