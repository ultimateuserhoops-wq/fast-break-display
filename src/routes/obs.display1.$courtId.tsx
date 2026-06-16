import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import { useEffect, useState } from "react";
import { useGameState, computeGameClockSeconds, formatClock, type GameState } from "@/lib/game-state";

export const Route = createFileRoute("/obs/display1/$courtId")({
  head: () => ({ meta: [{ title: "OBS Display 1" }] }),
  component: ObsDisplay1,
});

function ObsDisplay1() {
  useTick(250);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;

  switch (s.display_style_1) {
    case "arena": return <ObsShell><ArenaBoardStyle s={s} /></ObsShell>;
    case "led":   return <ObsShell><ArenaLedStyle s={s} /></ObsShell>;
    case "katigo":
    default:      return <ObsShell><KatigoStyle s={s} /></ObsShell>;
  }
}

/* ---------- Shared bits ---------- */

function useThreePulse(side: "home" | "away", value: number) {
  const [show, setShow] = useState(false);
  const [last, setLast] = useState(value);
  useEffect(() => {
    if (value === last) return;
    setLast(value);
    if (value === 0) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, [value, last, side]);
  return show;
}

function ThreeBurst({ color, side }: { color: string; side: "left" | "right" }) {
  return (
    <div
      className={`three-burst absolute top-1/2 z-30 -translate-y-1/2 grid h-32 w-32 place-items-center rounded-full text-5xl font-black text-white shadow-2xl ${side === "left" ? "left-10" : "right-10"}`}
      style={{ background: color, boxShadow: `0 0 60px ${color}` }}
    >
      3+
    </div>
  );
}

/* ---------- Style 1: Katigo (clean broadcast board) ---------- */

function KatigoStyle({ s }: { s: GameState }) {
  const game = computeGameClockSeconds(s);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  return (
    <div className="relative flex h-full w-full items-center justify-center p-10">
      <div className="relative w-full max-w-6xl rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-10 shadow-2xl">
        <p className="text-center text-xl font-black uppercase tracking-[0.3em]">{s.tournament_name}</p>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-8">
          <TeamSide name={s.home_name} color={s.home_color} score={s.home_score} fouls={s.home_fouls} timeouts={s.home_timeouts} logo={s.home_logo} bonus={s.away_fouls >= 5} align="left" />
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-white/60">Q{s.quarter}</p>
            <p className="clock-digits mt-2 text-7xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
          </div>
          <TeamSide name={s.away_name} color={s.away_color} score={s.away_score} fouls={s.away_fouls} timeouts={s.away_timeouts} logo={s.away_logo} bonus={s.home_fouls >= 5} align="right" />
        </div>
        {showHome && <ThreeBurst color={s.home_color} side="left" />}
        {showAway && <ThreeBurst color={s.away_color} side="right" />}
      </div>
    </div>
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
      <p className="clock-digits text-8xl font-black">{score}</p>
    </div>
  );
}

/* ---------- Style 2: Arena Board (huge center-hung jumbotron) ---------- */

function ArenaBoardStyle({ s }: { s: GameState }) {
  const game = computeGameClockSeconds(s);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(60,60,60,0.4),#000_70%)] p-8">
      <div className="relative w-full max-w-[1500px] rounded-[36px] border-[10px] border-zinc-800 bg-black p-3 shadow-[0_30px_120px_rgba(0,0,0,0.9)]">
        <div className="rounded-[24px] border-2 border-zinc-700 bg-gradient-to-b from-zinc-950 via-black to-zinc-950 p-10">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.5em] text-amber-300/80">{s.tournament_name}</p>
          <div className="mt-4 grid grid-cols-[1fr_1.1fr_1fr] items-center gap-6">
            <ArenaSide color={s.home_color} name={s.home_name} score={s.home_score} fouls={s.home_fouls} timeouts={s.home_timeouts} logo={s.home_logo} bonus={s.away_fouls >= 5} align="left" />
            <div className="mx-auto rounded-3xl border-4 border-zinc-700 bg-black px-10 py-6 text-center shadow-inner">
              <p className="text-xs uppercase tracking-[0.4em] text-zinc-400">PERIOD {s.quarter}</p>
              <p className="clock-digits text-[7rem] font-black leading-none" style={{ color: "var(--amber-clock)", textShadow: "0 0 30px rgba(255,180,0,0.5)" }}>
                {formatClock(game)}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.4em] text-zinc-500">Game Clock</p>
            </div>
            <ArenaSide color={s.away_color} name={s.away_name} score={s.away_score} fouls={s.away_fouls} timeouts={s.away_timeouts} logo={s.away_logo} bonus={s.home_fouls >= 5} align="right" />
          </div>
        </div>
        {showHome && <ThreeBurst color={s.home_color} side="left" />}
        {showAway && <ThreeBurst color={s.away_color} side="right" />}
      </div>
    </div>
  );
}

function ArenaSide({ color, name, score, fouls, timeouts, logo, bonus, align }: { color: string; name: string; score: number; fouls: number; timeouts: number; logo: string | null; bonus: boolean; align: "left" | "right" }) {
  const right = align === "right";
  return (
    <div className={`flex flex-col items-${right ? "end text-right" : "start text-left"} gap-3`}>
      <div className="flex items-center gap-4" style={{ flexDirection: right ? "row-reverse" : "row" }}>
        <div className="grid h-28 w-28 place-items-center rounded-2xl bg-white shadow-lg" style={{ boxShadow: `0 0 40px ${color}55` }}>
          {logo ? <img src={logo} alt="" className="h-24 w-24 object-contain" /> : <span className="text-3xl font-black" style={{ color }}>{name.slice(0, 3).toUpperCase()}</span>}
        </div>
        <div>
          <p className="text-4xl font-black uppercase tracking-tight" style={{ color }}>{name}</p>
          <div className="mt-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <span>FOULS {fouls}</span><span>·</span><span>T.O. {timeouts}</span>
            {bonus && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">BONUS</span>}
          </div>
        </div>
      </div>
      <p className="clock-digits text-[9rem] font-black leading-none" style={{ color, textShadow: `0 0 30px ${color}88` }}>{score}</p>
    </div>
  );
}

/* ---------- Style 3: Arena LED Ribbon (wide horizontal) ---------- */

function ArenaLedStyle({ s }: { s: GameState }) {
  const game = computeGameClockSeconds(s);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black p-6">
      <div className="relative w-full max-w-[1700px] overflow-hidden rounded-md border-y-4 border-zinc-700 bg-[#050505] shadow-2xl"
           style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)", backgroundSize: "4px 4px" }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
          <div className="flex items-center justify-end gap-6 px-10 py-8" style={{ background: `linear-gradient(90deg, transparent, ${s.home_color}33)` }}>
            <div className="text-right">
              <p className="text-2xl font-black uppercase tracking-wider" style={{ color: s.home_color }}>{s.home_name}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/50">FLS {s.home_fouls} · TOL {s.home_timeouts}</p>
            </div>
            <p className="clock-digits text-[8rem] font-black leading-none text-white" style={{ textShadow: `0 0 30px ${s.home_color}` }}>{s.home_score}</p>
          </div>
          <div className="flex flex-col items-center justify-center bg-black px-10 py-6 border-x-2 border-zinc-800">
            <p className="text-[10px] uppercase tracking-[0.4em] text-amber-300/70">{s.tournament_name}</p>
            <p className="clock-digits mt-2 text-6xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/70">Q{s.quarter}</p>
          </div>
          <div className="flex items-center justify-start gap-6 px-10 py-8" style={{ background: `linear-gradient(-90deg, transparent, ${s.away_color}33)` }}>
            <p className="clock-digits text-[8rem] font-black leading-none text-white" style={{ textShadow: `0 0 30px ${s.away_color}` }}>{s.away_score}</p>
            <div>
              <p className="text-2xl font-black uppercase tracking-wider" style={{ color: s.away_color }}>{s.away_name}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/50">FLS {s.away_fouls} · TOL {s.away_timeouts}</p>
            </div>
          </div>
        </div>
        {showHome && <ThreeBurst color={s.home_color} side="left" />}
        {showAway && <ThreeBurst color={s.away_color} side="right" />}
      </div>
    </div>
  );
}
