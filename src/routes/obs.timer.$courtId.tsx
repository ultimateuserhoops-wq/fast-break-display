import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import {
  useGameState, computeGameClockSeconds, computeShotClockTenths,
  formatClock, formatShotClock,
} from "@/lib/game-state";

export const Route = createFileRoute("/obs/timer/$courtId")({
  head: () => ({ meta: [{ title: "OBS Timer" }] }),
  component: ObsTimer,
});

function ObsTimer() {
  useTick(100);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;

  const game = computeGameClockSeconds(s);
  const shot = computeShotClockTenths(s);
  const round = s.timer_style === "round";

  if (round) {
    return (
      <ObsShell>
        <div className="flex h-full w-full items-center justify-center p-10">
          <div
            className="relative grid place-items-center rounded-full border-[14px] border-zinc-800 bg-gradient-to-b from-zinc-950 to-black shadow-[0_0_120px_rgba(255,180,0,0.15)]"
            style={{ height: "min(90vh, 90vw)", width: "min(90vh, 90vw)" }}
          >
            <div className="absolute inset-6 rounded-full border-2 border-amber-500/10" />
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.5em] text-amber-300/70">{s.tournament_name}</p>
              <p className="clock-digits mt-4 text-[6rem] font-black leading-none" style={{ color: "var(--amber-clock)", textShadow: "0 0 40px rgba(255,180,0,0.5)" }}>{formatClock(game)}</p>
              <p className="clock-digits mt-4 text-[14rem] font-black leading-none" style={{ color: "var(--red-shot)", textShadow: "0 0 60px rgba(220,40,40,0.5)" }}>{formatShotClock(shot)}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.4em] text-white/50">Period {s.quarter}</p>
            </div>
          </div>
        </div>
      </ObsShell>
    );
  }

  return (
    <ObsShell>
      <div className="flex h-full w-full items-center justify-center p-12">
        <div className="rounded-2xl border-4 border-white/10 bg-black px-16 py-10 shadow-2xl" style={{ boxShadow: "0 0 60px rgba(255,200,0,0.08)" }}>
          <p className="text-center text-2xl font-black uppercase tracking-[0.3em] text-white">{s.tournament_name}</p>
          <p className="clock-digits mt-6 text-center text-7xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
          <p className="clock-digits mt-2 text-center font-black leading-none" style={{ color: "var(--red-shot)", fontSize: "14rem" }}>{formatShotClock(shot)}</p>
          <p className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-white/50">Q{s.quarter} · Court</p>
        </div>
      </div>
    </ObsShell>
  );
}
