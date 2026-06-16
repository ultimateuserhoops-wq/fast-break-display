import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import { useEffect, useState } from "react";
import {
  useGameState, computeGameClockSeconds, computeShotClockTenths,
  formatClock, formatShotClock, type GameState,
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

  switch (s.display_style_2) {
    case "espn2": return <ObsShell><Espn2Style s={s} /></ObsShell>;
    case "nba":   return <ObsShell><NbaStyle s={s} /></ObsShell>;
    case "espn1":
    default:      return <ObsShell><Espn1Style s={s} /></ObsShell>;
  }
}

function useThreeFlash(value: number) {
  const [flash, setFlash] = useState(false);
  const [last, setLast] = useState(value);
  useEffect(() => {
    if (value === last) return;
    setLast(value);
    if (value === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1100);
    return () => clearTimeout(t);
  }, [value, last]);
  return flash;
}

function abbr(s: GameState, side: "home" | "away") {
  return side === "home"
    ? (s.home_abbr || s.home_name.slice(0, 3).toUpperCase())
    : (s.away_abbr || s.away_name.slice(0, 3).toUpperCase());
}

/* ---------- ESPN 1 (classic lower-third) ---------- */

function Espn1Style({ s }: { s: GameState }) {
  const game = computeGameClockSeconds(s);
  const shot = computeShotClockTenths(s);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  return (
    <div className="flex h-full w-full items-end justify-center pb-16">
      <div className="flex h-16 items-stretch overflow-hidden rounded-md shadow-2xl">
        <Side color={s.home_color} abbrText={abbr(s, "home")} score={s.home_score} flash={fH} />
        <div className="flex flex-col items-center justify-center bg-black px-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Q{s.quarter}</p>
          <p className="clock-digits text-xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
        </div>
        <Side color={s.away_color} abbrText={abbr(s, "away")} score={s.away_score} flash={fA} reverse />
        <div className="flex flex-col items-center justify-center bg-yellow-500 px-4 text-black">
          <p className="text-[9px] font-bold uppercase">Shot</p>
          <p className="clock-digits text-lg font-black">{formatShotClock(shot)}</p>
        </div>
      </div>
    </div>
  );
}

function Side({ color, abbrText, score, reverse, flash }: { color: string; abbrText: string; score: number; reverse?: boolean; flash?: boolean }) {
  return (
    <div className={`flex items-stretch ${reverse ? "flex-row-reverse" : ""}`}>
      <div className="grid w-20 place-items-center px-2 font-black text-white" style={{ background: color }}>{abbrText}</div>
      <div className={`grid w-20 place-items-center px-2 font-black transition-colors ${flash ? "score-pop" : ""}`} style={{ background: flash ? color : "white", color: flash ? "white" : "black" }}>
        {flash ? "3+" : score}
      </div>
    </div>
  );
}

/* ---------- ESPN 2 (chunky stacked card with logo strips) ---------- */

function Espn2Style({ s }: { s: GameState }) {
  const game = computeGameClockSeconds(s);
  const shot = computeShotClockTenths(s);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  return (
    <div className="flex h-full w-full items-end justify-center pb-10">
      <div className="overflow-hidden rounded-xl bg-gradient-to-b from-zinc-900 to-black text-white shadow-2xl ring-1 ring-white/10">
        <div className="flex items-stretch">
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: s.home_color }}>
            <div className="grid h-9 w-9 place-items-center rounded bg-white">
              {s.home_logo ? <img src={s.home_logo} alt="" className="h-8 w-8 object-contain" /> : <span className="text-xs font-black" style={{ color: s.home_color }}>{abbr(s, "home")}</span>}
            </div>
            <span className="text-lg font-black tracking-wider">{abbr(s, "home")}</span>
            <span className={`clock-digits ml-2 text-3xl font-black ${fH ? "score-pop" : ""}`}>{fH ? "3+" : s.home_score}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: s.away_color }}>
            <span className={`clock-digits text-3xl font-black ${fA ? "score-pop" : ""}`}>{fA ? "3+" : s.away_score}</span>
            <span className="text-lg font-black tracking-wider">{abbr(s, "away")}</span>
            <div className="grid h-9 w-9 place-items-center rounded bg-white">
              {s.away_logo ? <img src={s.away_logo} alt="" className="h-8 w-8 object-contain" /> : <span className="text-xs font-black" style={{ color: s.away_color }}>{abbr(s, "away")}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4 bg-black px-5 py-3">
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">Q{s.quarter}</p>
              <p className="clock-digits text-xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
            </div>
            <div className="h-9 w-px bg-white/20" />
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">Shot</p>
              <p className="clock-digits text-xl font-black" style={{ color: "var(--red-shot)" }}>{formatShotClock(shot)}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/70 px-4 py-1 text-[10px] uppercase tracking-[0.3em] text-white/60">
          {s.tournament_name}
        </div>
      </div>
    </div>
  );
}

/* ---------- NBA scorebug (compact, top-of-screen) ---------- */

function NbaStyle({ s }: { s: GameState }) {
  const game = computeGameClockSeconds(s);
  const shot = computeShotClockTenths(s);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  return (
    <div className="flex h-full w-full items-start justify-center pt-6">
      <div className="overflow-hidden rounded-md bg-[#0b1220] text-white shadow-2xl ring-1 ring-white/10">
        <div className="flex items-stretch text-sm">
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: s.home_color }}>
            <span className="grid h-6 w-6 place-items-center rounded-sm bg-white text-[10px] font-black" style={{ color: s.home_color }}>{abbr(s, "home")}</span>
            <span className="font-black tracking-wide">{s.home_name.toUpperCase()}</span>
            <span className={`clock-digits ml-1 text-2xl font-black ${fH ? "score-pop" : ""}`}>{fH ? "3+" : s.home_score}</span>
            <div className="ml-2 flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < s.home_fouls ? "bg-yellow-300" : "bg-white/30"}`} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-[#1a2335] px-4">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Q{s.quarter}</p>
              <p className="clock-digits text-base font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Shot</p>
              <p className="clock-digits text-base font-black" style={{ color: "var(--red-shot)" }}>{formatShotClock(shot)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: s.away_color }}>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < s.away_fouls ? "bg-yellow-300" : "bg-white/30"}`} />
              ))}
            </div>
            <span className={`clock-digits mr-1 text-2xl font-black ${fA ? "score-pop" : ""}`}>{fA ? "3+" : s.away_score}</span>
            <span className="font-black tracking-wide">{s.away_name.toUpperCase()}</span>
            <span className="grid h-6 w-6 place-items-center rounded-sm bg-white text-[10px] font-black" style={{ color: s.away_color }}>{abbr(s, "away")}</span>
          </div>
        </div>
        <div className="bg-black px-3 py-1 text-center text-[9px] uppercase tracking-[0.35em] text-white/50">{s.tournament_name}</div>
      </div>
    </div>
  );
}
