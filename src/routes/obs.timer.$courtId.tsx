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

  return (
    <ObsShell>
      <div className="flex h-screen items-center justify-center p-12">
        <div className={`${round ? "rounded-[48px]" : "rounded-2xl"} border-4 border-white/10 bg-black px-16 py-10 shadow-2xl`} style={{ boxShadow: "0 0 60px rgba(255,200,0,0.08)" }}>
          <p className="text-center text-2xl font-black uppercase tracking-[0.3em] text-white">{s.tournament_name}</p>
          <p className="clock-digits mt-6 text-center text-7xl font-black" style={{ color: "var(--amber-clock)" }}>
            {formatClock(game)}
          </p>
          <p className="clock-digits mt-2 text-center font-black leading-none" style={{ color: "var(--red-shot)", fontSize: round ? "16rem" : "14rem" }}>
            {formatShotClock(shot)}
          </p>
          <p className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-white/50">Q{s.quarter} · Court</p>
        </div>
      </div>
    </ObsShell>
  );
}
