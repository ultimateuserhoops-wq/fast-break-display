import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { ModeCard } from "@/components/ModeCard";
import { useCourts, patchGameState } from "@/lib/game-state";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/scoreboard")({
  head: () => ({ meta: [{ title: "Scoreboard — BDC" }] }),
  component: ScoreboardLanding,
});

function ScoreboardLanding() {
  const courts = useCourts();
  const [active, setActive] = useState<string>("main");
  const navigate = useNavigate();

  async function openMode(mode: "quick" | "full" | "3x3") {
    await patchGameState(active, { mode });
    navigate({ to: "/scoreboard/$courtId", params: { courtId: active } });
  }

  const court = courts.find((c) => c.id === active);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-3xl font-black tracking-tight">Scoreboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a court, then choose a mode.</p>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Court</p>
          <div className="mt-3">
            <CourtSelector activeId={active} onSelect={setActive} />
          </div>
          {court && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Link
                to="/timekeeper/$courtId"
                params={{ courtId: active }}
                className="rounded-md border px-3 py-1.5 font-medium hover:bg-secondary"
              >
                Time Keeper
              </Link>
              <Link
                to="/scoreboard/$courtId"
                params={{ courtId: active }}
                className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background"
              >
                Full Score
              </Link>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <ModeCard
            title="Quick Setup"
            badge="QUICK"
            color="var(--brand-blue)"
            desc="Just the basics. Two teams, scores, fouls, timeouts."
            onClick={() => openMode("quick")}
          />
          <ModeCard
            title="Full Scorekeeper"
            badge="FULL"
            color="var(--brand-orange)"
            desc="Complete scoring, play-by-play, rosters, clocks and broadcast displays."
            onClick={() => openMode("full")}
          />
          <ModeCard
            title="3x3 Basketball"
            badge="3x3"
            color="var(--brand-red)"
            desc="3-on-3 ruleset: single-period 10-min clock, 12s shot clock, first to 21."
            onClick={() => openMode("3x3")}
          />
        </div>
      </main>
    </div>
  );
}
