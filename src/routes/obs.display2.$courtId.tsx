import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import {
  useGameState, computeGameClockSeconds, computeShotClockTenths,
  formatClock, formatShotClock,
} from "@/lib/game-state";

export const Route = createFileRoute("/obs/display2/$courtId")({
  head: () => ({ meta: [{ title: "OBS Display 2" }] }),
  component: ObsDisplay2,
});

function ObsDisplay2() {
  useTick(100);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;
  const game = computeGameClockSeconds(s);
  const shot = computeShotClockTenths(s);

  // ESPN 1 style — lower-third scorebug
  return (
    <ObsShell>
      <div className="flex h-screen items-end justify-center pb-16">
        <div className="flex h-16 items-stretch overflow-hidden rounded-md shadow-2xl">
          <Side color={s.home_color} abbr={s.home_abbr || s.home_name.slice(0, 3).toUpperCase()} score={s.home_score} />
          <div className="flex flex-col items-center justify-center bg-black px-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Q{s.quarter}</p>
            <p className="clock-digits text-xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
          </div>
          <Side color={s.away_color} abbr={s.away_abbr || s.away_name.slice(0, 3).toUpperCase()} score={s.away_score} reverse />
          <div className="flex flex-col items-center justify-center bg-yellow-500 px-4 text-black">
            <p className="text-[9px] font-bold uppercase">Shot</p>
            <p className="clock-digits text-lg font-black">{formatShotClock(shot)}</p>
          </div>
        </div>
      </div>
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-white/30">Style: {s.display_style_2}</p>
    </ObsShell>
  );
}

function Side({ color, abbr, score, reverse }: { color: string; abbr: string; score: number; reverse?: boolean }) {
  return (
    <div className={`flex items-stretch ${reverse ? "flex-row-reverse" : ""}`}>
      <div className="grid w-20 place-items-center px-2 font-black text-white" style={{ background: color }}>{abbr}</div>
      <div className="grid w-20 place-items-center bg-white px-2 font-black text-black">{score}</div>
    </div>
  );
}
