import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import {
  useGameState, computeGameClockSeconds, computeShotClockTenths,
  formatClock, formatShotClock,
  startGameClock, pauseGameClock, adjustGameClock,
  startShotClock, pauseShotClock, resetShotClock, adjustShotClock,
  buzzer, resetClocksForQuarter,
} from "@/lib/game-state";

export const Route = createFileRoute("/_authenticated/timekeeper/$courtId")({
  head: () => ({ meta: [{ title: "Time Keeper — BDC" }] }),
  component: TimeKeeper,
});

function TimeKeeper() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!s) {
    return (<div className="min-h-screen bg-background"><TopNav /><main className="p-8 text-sm">Loading…</main></div>);
  }

  const gameClock = computeGameClockSeconds(s);
  const shotTenths = computeShotClockTenths(s);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-black tracking-tight">Time Keeper</h1>
          <CourtSelector activeId={courtId} />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Game Clock</p>
            <p className="clock-digits my-4 text-[8rem] font-black leading-none" style={{ color: "var(--amber-clock)" }}>
              {formatClock(gameClock)}
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <Btn onClick={() => adjustGameClock(s, 60)}>+1m</Btn>
              <Btn onClick={() => adjustGameClock(s, 10)}>+10s</Btn>
              <Btn onClick={() => adjustGameClock(s, -10)}>-10s</Btn>
              <Btn onClick={() => adjustGameClock(s, -60)}>-1m</Btn>
            </div>
            <button
              onClick={() => (s.game_clock_running ? pauseGameClock(s) : startGameClock(s))}
              className={`mt-4 w-full rounded-xl py-4 text-base font-bold ${s.game_clock_running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"}`}
            >
              {s.game_clock_running ? "PAUSE" : "START"}
            </button>
          </div>

          <div className="rounded-3xl border bg-card p-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Shot Clock</p>
            <p className="clock-digits my-4 text-[8rem] font-black leading-none" style={{ color: "var(--red-shot)" }}>
              {formatShotClock(shotTenths)}
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <Btn onClick={() => resetShotClock(s, 240)}>24</Btn>
              <Btn onClick={() => resetShotClock(s, 140)}>14</Btn>
              <Btn onClick={() => adjustShotClock(s, 50)}>+5s</Btn>
              <Btn onClick={() => adjustShotClock(s, -10)}>-1s</Btn>
            </div>
            <button
              onClick={() => (s.shot_clock_running ? pauseShotClock(s) : startShotClock(s))}
              className={`mt-4 w-full rounded-xl py-4 text-base font-bold ${s.shot_clock_running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"}`}
            >
              {s.shot_clock_running ? "PAUSE SHOT" : "START SHOT"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => buzzer(s)} className="rounded-xl bg-destructive px-6 py-3 text-sm font-bold text-destructive-foreground">BUZZER</button>
          <button onClick={() => resetClocksForQuarter(s)} className="rounded-xl border px-6 py-3 text-sm font-bold hover:bg-secondary">Reset clocks for quarter</button>
        </div>
      </main>
    </div>
  );
}

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-md border px-3 py-1.5 font-semibold hover:bg-secondary">{children}</button>;
}
