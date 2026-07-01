import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import { AdOverlay } from "@/components/obs/AdOverlay";
import {
  useGameState, useSmoothGameClock, useSmoothShotTenths, serverNow,
  formatClock, formatShotClock,
} from "@/lib/game-state";
import { useBreak, type BreakState } from "@/lib/ads";
import { ClockBuzzer } from "@/components/Buzzer";
import { FullscreenToggle } from "@/components/obs/FullscreenToggle";

function breakRemaining(b: BreakState): number {
  if (b.running && b.started_at) {
    return Math.max(0, b.seconds - (serverNow() - new Date(b.started_at).getTime()) / 1000);
  }
  return Math.max(0, b.seconds);
}

export const Route = createFileRoute("/obs/timer/$courtId")({
  head: () => ({ meta: [{ title: "OBS Timer" }] }),
  component: ObsTimer,
});

function ObsTimer() {
  useTick(100);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const brk = useBreak(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;

  // Break overlay (time-out / half-time / pre-game) takes over the timer when shown.
  if (brk?.show) {
    return (
      <>
        <ObsShell>
          <div className="flex h-full w-full flex-col items-center justify-center gap-8 text-center">
            <p className="font-black uppercase tracking-[0.35em] text-white/80" style={{ fontSize: "6vmin" }}>
              {brk.label || "Break"}
            </p>
            <p className="clock-digits font-black leading-none" style={{ color: "var(--amber-clock)", fontSize: "34vmin", textShadow: "0 0 60px rgba(255,180,0,0.4)" }}>
              {formatClock(breakRemaining(brk))}
            </p>
            {s.tournament_name && (
              <p className="uppercase tracking-[0.4em] text-white/45" style={{ fontSize: "2.6vmin" }}>{s.tournament_name}</p>
            )}
          </div>
        </ObsShell>
        <AdOverlay courtId={courtId} />
        <FullscreenToggle />
        <ClockBuzzer s={s} />
      </>
    );
  }

  const round = s.timer_style === "round";

  const inner = round ? (
        <div className="flex h-full w-full items-center justify-center p-10">
          <div
            className="relative grid place-items-center rounded-full border-[14px] border-zinc-800 bg-gradient-to-b from-zinc-950 to-black shadow-[0_0_120px_rgba(255,180,0,0.15)]"
            style={{ height: "min(90vh, 90vw)", width: "min(90vh, 90vw)" }}
          >
            {/* inner ring — all content stays inside this circle */}
            <div className="absolute inset-[5%] rounded-full border-2 border-amber-500/10" />
            {/* content lives in a square inscribed in the inner circle (~68% of the
                diameter) so the digits never spill over the rim, even when the shot
                clock shows a decimal like 0.6 */}
            <div
              className="flex flex-col items-center justify-center overflow-hidden text-center leading-none"
              style={{ width: "68%", height: "68%" }}
            >
              <p className="uppercase tracking-[0.4em] text-amber-300/70" style={{ fontSize: "2.4vmin" }}>{s.tournament_name}</p>
              <p
                className="clock-digits mt-[3%] font-black leading-none"
                style={{ color: "var(--amber-clock)", fontSize: "9vmin", textShadow: "0 0 40px rgba(255,180,0,0.5)" }}
              >{formatClock(game)}</p>
              <p
                className="clock-digits font-black leading-none"
                style={{ color: "var(--red-shot)", fontSize: "26vmin", textShadow: "0 0 60px rgba(220,40,40,0.5)" }}
              >{formatShotClock(shot)}</p>
              <p className="mt-[2%] uppercase tracking-[0.4em] text-white/50" style={{ fontSize: "2.2vmin" }}>Period {s.quarter}</p>
            </div>
          </div>
        </div>
  ) : (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div className="rounded-2xl border-4 border-white/10 bg-black px-16 py-10 shadow-2xl" style={{ boxShadow: "0 0 60px rgba(255,200,0,0.08)" }}>
          <p className="text-center text-2xl font-black uppercase tracking-[0.3em] text-white">{s.tournament_name}</p>
          <p className="clock-digits mt-6 text-center text-7xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
          <p className="clock-digits mt-2 text-center font-black leading-none" style={{ color: "var(--red-shot)", fontSize: "14rem" }}>{formatShotClock(shot)}</p>
          <p className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-white/50">Q{s.quarter} · Court</p>
        </div>
      </div>
  );

  return (
    <>
      <ObsShell>{inner}</ObsShell>
      <AdOverlay courtId={courtId} />
      <FullscreenToggle />
      <ClockBuzzer s={s} />
    </>
  );
}
