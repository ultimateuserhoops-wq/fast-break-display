import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import { useGameState, computeGameClockSeconds, formatClock } from "@/lib/game-state";

export const Route = createFileRoute("/obs/display1/$courtId")({
  head: () => ({ meta: [{ title: "OBS Display 1" }] }),
  component: ObsDisplay1,
});

function ObsDisplay1() {
  useTick(250);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;
  const game = computeGameClockSeconds(s);

  // Katigo style — clean full scoreboard. (Other styles stubbed: arena, led)
  return (
    <ObsShell>
      <div className="flex h-screen items-center justify-center p-10">
        <div className="w-full max-w-6xl rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-10 shadow-2xl">
          <p className="text-center text-xl font-black uppercase tracking-[0.3em]">{s.tournament_name}</p>
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-8">
            <TeamSide name={s.home_name} color={s.home_color} score={s.home_score} fouls={s.home_fouls} timeouts={s.home_timeouts} logo={s.home_logo} bonus={s.away_fouls >= 5} align="left" />
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-white/60">Q{s.quarter}</p>
              <p className="clock-digits mt-2 text-7xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
            </div>
            <TeamSide name={s.away_name} color={s.away_color} score={s.away_score} fouls={s.away_fouls} timeouts={s.away_timeouts} logo={s.away_logo} bonus={s.home_fouls >= 5} align="right" />
          </div>
          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] text-white/40">Style: {s.display_style_1}</p>
        </div>
      </div>
    </ObsShell>
  );
}

function TeamSide({ name, color, score, fouls, timeouts, logo, bonus, align }: { name: string; color: string; score: number; fouls: number; timeouts: number; logo: string | null; bonus: boolean; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div className="grid h-24 w-24 place-items-center rounded-2xl border-2 bg-white" style={{ borderColor: color }}>
        {logo ? <img src={logo} alt="" className="h-20 w-20 object-contain" /> : <span className="text-2xl font-black" style={{ color }}>{name.slice(0, 3).toUpperCase()}</span>}
      </div>
      <div>
        <p className="text-3xl font-black uppercase" style={{ color }}>{name}</p>
        {bonus && <span className="mt-1 inline-block rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase">Bonus</span>}
        <div className="mt-1 text-xs uppercase tracking-wider text-white/60">FLS {fouls} · TOL {timeouts}</div>
      </div>
      <p className={`clock-digits text-8xl font-black ${align === "right" ? "mr-0" : ""}`}>{score}</p>
    </div>
  );
}
