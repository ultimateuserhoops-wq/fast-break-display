import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import { AdOverlay } from "@/components/obs/AdOverlay";
import { useEffect, useRef, useState } from "react";
import {
  useGameState, useSmoothGameClock, useSmoothShotTenths,
  formatClock, formatShotClock, timeoutMaxForQuarter, type GameState,
} from "@/lib/game-state";
import { useObsToggles, periodLabel } from "@/lib/obs-toggles";
import bdseaEventLogo from "@/assets/bdsea-event-logo.png";
import { FullscreenToggle } from "@/components/obs/FullscreenToggle";
import { ShotClockToggle } from "@/components/obs/ShotClockToggle";
import { PossessionBar } from "@/components/Possession";

const SCORE_INK = { WebkitTextStroke: "1.5px rgba(0,0,0,0.5)", textShadow: "0 2px 8px rgba(0,0,0,0.55)" } as const;
const tol = (s: GameState, side: "home" | "away") => Math.max(0, timeoutMaxForQuarter(s.quarter) - (side === "home" ? s.home_timeouts : s.away_timeouts));

export const Route = createFileRoute("/obs/display2/$courtId")({
  head: () => ({ meta: [{ title: "OBS Display 2" }] }),
  component: ObsDisplay2,
});

function ObsDisplay2() {
  useTick(100);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const { hideShot, toggleShot } = useObsToggles(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;

  const inner =
    s.display_style_2 === "espn2" ? <Espn2Style s={s} hideShot={hideShot} />
    : s.display_style_2 === "nba" ? <NbaStyle s={s} hideShot={hideShot} />
    : s.display_style_2 === "fiba" ? <FibaStyle s={s} hideShot={hideShot} />
    : s.display_style_2 === "bdsea26" ? <Bdsea26Style s={s} hideShot={hideShot} />
    : <Espn1Style s={s} hideShot={hideShot} />;

  return (
    <>
      <ObsShell>
        {inner}
        <PossessionBar courtId={courtId} s={s} hName={s.home_name} aName={s.away_name} />
      </ObsShell>
      <AdOverlay courtId={courtId} />
      <FullscreenToggle />
      <ShotClockToggle hideShot={hideShot} onToggle={toggleShot} />
    </>
  );
}

function useThreeFlash(value: number) {
  const [flash, setFlash] = useState(false);
  const lastRef = useRef(value);
  useEffect(() => {
    if (value === lastRef.current) return;
    lastRef.current = value;
    if (value === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1100);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

function abbr(s: GameState, side: "home" | "away") {
  return side === "home"
    ? (s.home_abbr || s.home_name.slice(0, 3).toUpperCase())
    : (s.away_abbr || s.away_name.slice(0, 3).toUpperCase());
}

/* ---------- ESPN 1 (classic lower-third) ---------- */

function Espn1Style({ s, hideShot }: { s: GameState; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  return (
    <div className="flex h-full w-full items-end justify-center pb-16">
      <div className="flex h-24 items-stretch overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
        <Side color={s.home_color} abbrText={abbr(s, "home")} score={s.home_score} flash={fH} />
        <div className="flex flex-col items-center justify-center bg-black px-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">{periodLabel(s.quarter)}</p>
          <p className="clock-digits text-4xl font-black leading-none" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
        </div>
        <Side color={s.away_color} abbrText={abbr(s, "away")} score={s.away_score} flash={fA} reverse />
        {!hideShot && (
          <div className="flex flex-col items-center justify-center bg-yellow-500 px-6 text-black">
            <p className="text-xs font-bold uppercase tracking-wider">Shot</p>
            <p className="clock-digits text-3xl font-black leading-none">{formatShotClock(shot)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Side({ color, abbrText, score, reverse, flash }: { color: string; abbrText: string; score: number; reverse?: boolean; flash?: boolean }) {
  return (
    <div className={`flex items-stretch ${reverse ? "flex-row-reverse" : ""}`}>
      <div className="grid w-28 place-items-center px-3 text-2xl font-black text-white" style={{ background: color }}>{abbrText}</div>
      <div className={`grid w-28 place-items-center px-3 text-5xl font-black transition-colors ${flash ? "score-pop" : ""}`} style={{ background: flash ? color : "white", color: flash ? "white" : "black" }}>
        {flash ? "3+" : score}
      </div>
    </div>
  );
}

/* ---------- ESPN 2 (chunky stacked card with logo strips) ---------- */

function Espn2Style({ s, hideShot }: { s: GameState; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
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
            <span className={`clock-digits ml-2 text-3xl font-black ${fH ? "score-pop" : ""}`} style={SCORE_INK}>{fH ? "3+" : s.home_score}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: s.away_color }}>
            <span className={`clock-digits text-3xl font-black ${fA ? "score-pop" : ""}`} style={SCORE_INK}>{fA ? "3+" : s.away_score}</span>
            <span className="text-lg font-black tracking-wider">{abbr(s, "away")}</span>
            <div className="grid h-9 w-9 place-items-center rounded bg-white">
              {s.away_logo ? <img src={s.away_logo} alt="" className="h-8 w-8 object-contain" /> : <span className="text-xs font-black" style={{ color: s.away_color }}>{abbr(s, "away")}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4 bg-black px-5 py-3">
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">{periodLabel(s.quarter)}</p>
              <p className="clock-digits text-xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
            </div>
            {!hideShot && <>
              <div className="h-9 w-px bg-white/20" />
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">Shot</p>
                <p className="clock-digits text-xl font-black" style={{ color: "var(--red-shot)" }}>{formatShotClock(shot)}</p>
              </div>
            </>}
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

function NbaStyle({ s, hideShot }: { s: GameState; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  return (
    <div className="flex h-full w-full items-start justify-center pt-6">
      <div className="overflow-hidden rounded-md bg-[#0b1220] text-white shadow-2xl ring-1 ring-white/10">
        <div className="flex items-stretch text-sm">
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: s.home_color }}>
            <span className="grid h-6 w-6 place-items-center rounded-sm bg-white text-[10px] font-black" style={{ color: s.home_color }}>{abbr(s, "home")}</span>
            <span className="font-black tracking-wide">{s.home_name.toUpperCase()}</span>
            <span className={`clock-digits ml-1 text-2xl font-black ${fH ? "score-pop" : ""}`} style={SCORE_INK}>{fH ? "3+" : s.home_score}</span>
            <div className="ml-2 flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < s.home_fouls ? "bg-yellow-300" : "bg-white/30"}`} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-[#1a2335] px-4">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">{periodLabel(s.quarter)}</p>
              <p className="clock-digits text-base font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</p>
            </div>
            {!hideShot && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Shot</p>
                <p className="clock-digits text-base font-black" style={{ color: "var(--red-shot)" }}>{formatShotClock(shot)}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: s.away_color }}>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < s.away_fouls ? "bg-yellow-300" : "bg-white/30"}`} />
              ))}
            </div>
            <span className={`clock-digits mr-1 text-2xl font-black ${fA ? "score-pop" : ""}`} style={SCORE_INK}>{fA ? "3+" : s.away_score}</span>
            <span className="font-black tracking-wide">{s.away_name.toUpperCase()}</span>
            <span className="grid h-6 w-6 place-items-center rounded-sm bg-white text-[10px] font-black" style={{ color: s.away_color }}>{abbr(s, "away")}</span>
          </div>
        </div>
        <div className="bg-black px-3 py-1 text-center text-[9px] uppercase tracking-[0.35em] text-white/50">{s.tournament_name}</div>
      </div>
    </div>
  );
}

/* ---------- FIBA (modern glassy lower-third with logos + fouls/bonus/timeouts) ---------- */

function FibaStyle({ s, hideShot }: { s: GameState; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  return (
    <div className="flex h-full w-full items-end justify-center pb-12">
      <div className="flex items-stretch overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15">
        <FibaTeam color={s.home_color} logo={s.home_logo} name={abbr(s, "home")} score={s.home_score} fouls={s.home_fouls} timeouts={tol(s, "home")} flash={fH} bonus={s.away_fouls >= 5} />
        <div className="flex flex-col items-center justify-center gap-1.5 bg-[#0a0e1a] px-7 py-3 text-white">
          <p className="max-w-[14rem] truncate text-[9px] font-bold uppercase tracking-[0.4em] text-white/55">{s.tournament_name}</p>
          <div className="flex items-center gap-4">
            <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-black tracking-wider">{periodLabel(s.quarter)}</span>
            <span className="clock-digits text-3xl font-black leading-none" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</span>
            {!hideShot && <span className="clock-digits grid min-w-[3.4rem] place-items-center rounded-md px-2 py-1 text-2xl font-black leading-none text-white" style={{ background: "var(--red-shot)" }}>{formatShotClock(shot)}</span>}
          </div>
        </div>
        <FibaTeam color={s.away_color} logo={s.away_logo} name={abbr(s, "away")} score={s.away_score} fouls={s.away_fouls} timeouts={tol(s, "away")} flash={fA} bonus={s.home_fouls >= 5} reverse />
      </div>
    </div>
  );
}

function FibaTeam({
  color, logo, name, score, fouls, timeouts, flash, bonus, reverse,
}: {
  color: string; logo: string | null; name: string; score: number;
  fouls: number; timeouts: number; flash: boolean; bonus: boolean; reverse?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 ${reverse ? "flex-row-reverse" : ""}`} style={{ backgroundColor: color }}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white/95">
        {logo ? <img src={logo} alt="" className="h-10 w-10 object-contain" /> : <span className="text-sm font-black" style={{ color }}>{name}</span>}
      </div>
      <div className={`flex flex-col ${reverse ? "items-end" : "items-start"}`}>
        <span className="text-base font-black uppercase tracking-wider text-white drop-shadow">{name}</span>
        <div className={`mt-0.5 flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
          <span className="text-[9px] font-bold uppercase tracking-wide text-white/85">F{fouls}</span>
          {bonus && <span className="rounded-full bg-white px-1.5 text-[8px] font-black uppercase leading-4" style={{ color }}>Bonus</span>}
          <div className={`flex gap-0.5 ${reverse ? "flex-row-reverse" : ""}`}>
            {Array.from({ length: Math.min(Math.max(0, timeouts), 7) }).map((_, i) => (
              <span key={i} className="h-1.5 w-3 rounded-full bg-white/85" />
            ))}
          </div>
        </div>
      </div>
      <span className={`clock-digits text-4xl font-black leading-none text-white ${flash ? "score-pop" : ""}`} style={SCORE_INK}>{flash ? "3+" : score}</span>
    </div>
  );
}

/* ---------- BDSEA26 (custom broadcast lower-third — slanted navy bar + sub-strip) ---------- */

// Colours sampled from the supplied scoreboard.psd design.
const BDSEA_BAR = "linear-gradient(180deg, #0a63a4 0%, #05528c 50%, #033f6e 100%)";
const BDSEA_CLIP = "polygon(1.3% 0, 98.7% 0, 100% 100%, 0 100%)";
const SB_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || "";

function BdLogo({ src, name, color, size = 48 }: { src: string | null; name: string; color: string; size?: number }) {
  return src
    ? <img src={src} alt="" style={{ height: size, width: size }} className="object-contain drop-shadow" />
    : <div className="grid place-items-center rounded bg-white/95" style={{ height: size, width: size }}><span className="text-xs font-black" style={{ color }}>{name}</span></div>;
}

function BdFouls({ fouls }: { fouls: number }) {
  // White dashed pips per the design; lit by team fouls. At 5 (the team that put the opponent in
  // the bonus) the lit pips turn RED.
  const atLimit = fouls >= 5;
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="h-1.5 w-7 rounded-sm" style={{ background: i < fouls ? (atLimit ? "#ff2b2b" : "#ffffff") : "rgba(255,255,255,0.28)" }} />
      ))}
    </div>
  );
}

// "BONUS" tag shown next to the team whose OPPONENT has reached 5 team fouls.
function BonusTag() {
  return <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-black uppercase leading-none text-black shadow">Bonus</span>;
}

function Bdsea26Style({ s, hideShot }: { s: GameState; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const fH = useThreeFlash(s.three_pulse_home);
  const fA = useThreeFlash(s.three_pulse_away);
  const scoreCell = { background: "#013e6f" } as const; // darker navy score panels (from design)

  return (
    <div className="flex h-full w-full items-end justify-center pb-4" style={{ fontFamily: "var(--font-display)" }}>
      <div className="flex flex-col items-stretch" style={{ filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.45))" }}>

        {/* MAIN BAR */}
        <div className="relative flex h-[74px] items-stretch text-white" style={{ background: BDSEA_BAR, clipPath: BDSEA_CLIP }}>
          {/* faint top highlight */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" />

          {/* event badge — uploaded tournament logo (per court), falling back to the design's BUI badge */}
          <div className="flex items-center pl-7 pr-3">
            <img
              src={SB_URL ? `${SB_URL}/storage/v1/object/public/player-photos/event-logo/${s.court_id}.png` : bdseaEventLogo}
              alt=""
              className="h-16 w-16 object-contain drop-shadow"
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = bdseaEventLogo; }}
            />
          </div>

          {/* home: logo · name · score */}
          <div className="flex items-center pl-1 pr-3"><BdLogo src={s.home_logo} name={abbr(s, "home")} color={s.home_color} /></div>
          <div className="flex items-center gap-2 pr-5"><span className="text-2xl font-black uppercase tracking-wide">{s.home_name}</span>{s.away_fouls >= 5 && <BonusTag />}</div>
          <div className="flex items-center px-6" style={scoreCell}><span className={`clock-digits text-5xl font-black leading-none ${fH ? "score-pop" : ""}`}>{s.home_score}</span></div>

          {/* center divider */}
          <div className="my-3 w-px bg-white/45" />

          {/* away: score · name · logo */}
          <div className="flex items-center px-6" style={scoreCell}><span className={`clock-digits text-5xl font-black leading-none ${fA ? "score-pop" : ""}`}>{s.away_score}</span></div>
          <div className="flex items-center gap-2 pl-5">{s.home_fouls >= 5 && <BonusTag />}<span className="text-2xl font-black uppercase tracking-wide">{s.away_name}</span></div>
          <div className="flex items-center pl-3 pr-1"><BdLogo src={s.away_logo} name={abbr(s, "away")} color={s.away_color} /></div>

          {/* period · clock · shot */}
          <div className="flex items-center pl-5 pr-3"><span className="text-3xl font-black">{periodLabel(s.quarter)}</span></div>
          <div className="my-3 w-px bg-white/45" />
          <div className="flex items-center gap-4 pl-4 pr-8">
            <span className="clock-digits text-3xl font-black leading-none">{formatClock(game)}</span>
            {!hideShot && <span className="clock-digits text-3xl font-black leading-none text-white">{formatShotClock(shot)}</span>}
          </div>
        </div>

        {/* SUB-STRIP: BDSEA 2026 tab + foul dashes */}
        <div className="relative -mt-px flex h-9 items-center text-white" style={{ background: "#0c2350", clipPath: "polygon(1.3% 0, 98.7% 0, 97.2% 100%, 2.8% 100%)" }}>
          <div className="flex h-full items-center pl-7 pr-6" style={{ background: "#081a3c", transform: "skewX(-14deg)", transformOrigin: "bottom left" }}>
            <span className="font-black italic tracking-wide" style={{ transform: "skewX(14deg)", fontSize: "1.05rem" }}>{s.tournament_name || "BDSEA 2026"}</span>
          </div>
          <div className="ml-7 flex items-center gap-7">
            <BdFouls fouls={s.home_fouls} />
            <BdFouls fouls={s.away_fouls} />
          </div>
        </div>

      </div>
    </div>
  );
}
