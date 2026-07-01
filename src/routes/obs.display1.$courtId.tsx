import { createFileRoute } from "@tanstack/react-router";
import { ObsShell, useTick } from "@/components/obs/ObsShell";
import { useEffect, useRef, useState } from "react";
import { useGameState, useTeams, usePlayers, useGameEvents, aggregateBoxScore, isStaff, useSmoothGameClock, useSmoothShotTenths, formatClockTenths, formatShotClock, timeoutMaxForQuarter, type GameState, type Player, type BoxScoreLine } from "@/lib/game-state";
import { SponsorStrip } from "@/components/obs/SponsorStrip";
import { AdOverlay } from "@/components/obs/AdOverlay";
import { useObsToggles, periodLabel } from "@/lib/obs-toggles";
import { useGameRoster } from "@/lib/ads";
import { FullscreenToggle } from "@/components/obs/FullscreenToggle";
import { ShotClockToggle } from "@/components/obs/ShotClockToggle";
import { PossessionBar } from "@/components/Possession";
import { usePossession } from "@/lib/possession";

// Heavy outline so light team colours stay legible behind white scoreboard digits.
const SCORE_INK = { WebkitTextStroke: "2px rgba(0,0,0,0.55)", textShadow: "0 2px 10px rgba(0,0,0,0.6)" } as const;
const tol = (s: GameState, side: "home" | "away") => Math.max(0, timeoutMaxForQuarter(s.quarter) - (side === "home" ? s.home_timeouts : s.away_timeouts));

function jerseyNum(j: string | null): number {
  const n = parseInt((j ?? "").replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? 9999 : n;
}
function byNumber(a: Player, b: Player) {
  return jerseyNum(a.jersey_number) - jerseyNum(b.jersey_number) || (a.jersey_number ?? "").localeCompare(b.jersey_number ?? "");
}

export const Route = createFileRoute("/obs/display1/$courtId")({
  head: () => ({ meta: [{ title: "OBS Display 1" }] }),
  component: ObsDisplay1,
});

function ObsDisplay1() {
  useTick(250);
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const teams = useTeams();
  const { hideShot, toggleShot } = useObsToggles(courtId);
  if (!s) return <ObsShell><div /></ObsShell>;

  // Use the team's abbreviation on the broadcast display when set, else the full name.
  const tm = new Map(teams.map((t) => [t.id, t]));
  const hName = (s.home_team_id && tm.get(s.home_team_id)?.abbreviation) || s.home_name;
  const aName = (s.away_team_id && tm.get(s.away_team_id)?.abbreviation) || s.away_name;

  const inner =
    s.display_style_1 === "arena" ? <ArenaBoardStyle s={s} hName={hName} aName={aName} hideShot={hideShot} />
    : s.display_style_1 === "led" ? <ArenaLedStyle s={s} />
    : s.display_style_1 === "pjy1" ? <PydjianProStyle s={s} hName={hName} aName={aName} hideShot={hideShot} />
    : s.display_style_1 === "pjy2" ? <PydjianLedStyle s={s} hName={hName} aName={aName} hideShot={hideShot} />
    : s.display_style_1 === "std3" ? <Standard3DisplayStyle s={s} hName={hName} aName={aName} hideShot={hideShot} />
    : <KatigoStyle s={s} hName={hName} aName={aName} hideShot={hideShot} />;

  return (
    <>
      <ObsShell>
        {inner}
        {/* Standard 3 has its own built-in possession arrow, so skip the global pill there. */}
        {s.display_style_1 !== "std3" && <PossessionBar courtId={courtId} s={s} hName={hName} aName={aName} />}
      </ObsShell>
      <AdOverlay courtId={courtId} />
      <FullscreenToggle />
      <ShotClockToggle hideShot={hideShot} onToggle={toggleShot} />
    </>
  );
}

/* ---------- Shared bits ---------- */

function useThreePulse(_side: "home" | "away", value: number) {
  const [show, setShow] = useState(false);
  const lastRef = useRef(value);
  useEffect(() => {
    if (value === lastRef.current) return;
    lastRef.current = value;
    if (value === 0) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, [value]);
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

/* ---------- Style 1: Katigo (KantiGo-style board with full player Fls/Pts) ---------- */

function KatigoStyle({ s, hName, aName, hideShot }: { s: GameState; hName: string; aName: string; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const homePlayers = usePlayers(s.home_team_id);
  const awayPlayers = usePlayers(s.away_team_id);
  const homeRoster = useGameRoster(s.court_id, "home");
  const awayRoster = useGameRoster(s.court_id, "away");
  const homeList = (homeRoster ? homePlayers.filter((p) => homeRoster.includes(p.id)) : homePlayers).filter((p) => !isStaff(p));
  const awayList = (awayRoster ? awayPlayers.filter((p) => awayRoster.includes(p.id)) : awayPlayers).filter((p) => !isStaff(p));
  const events = useGameEvents(s.court_id);
  const homeBox = aggregateBoxScore(events.filter((e) => e.team_side === "home"));
  const awayBox = aggregateBoxScore(events.filter((e) => e.team_side === "away"));
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a1330] p-3 text-white">
      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr_auto] gap-3">
        <RosterTable players={homeList} box={homeBox} color={s.home_color} />
        <KantiCenter s={s} game={game} hName={hName} aName={aName} hideShot={hideShot} />
        <RosterTable players={awayList} box={awayBox} color={s.away_color} />
      </div>
      <SponsorStrip height={72} />
      {showHome && <ThreeBurst color={s.home_color} side="left" />}
      {showAway && <ThreeBurst color={s.away_color} side="right" />}
    </div>
  );
}

// "First name, last-name initial" — e.g. "NGUYEN VAN AN" → "NGUYEN, A".
function nameFirstCommaInitial(n: string) {
  const parts = n.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]}, ${parts[parts.length - 1][0]}`;
}

function RosterTable({ players, box, color }: { players: Player[]; box: Map<string, BoxScoreLine>; color: string }) {
  const rows = [...players].sort(byNumber);
  return (
    <div className="overflow-hidden rounded-lg border-2 bg-black/40" style={{ borderColor: color }}>
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-black uppercase tracking-wider" style={{ background: color }}>
        <span className="w-11 text-center">#</span>
        <span className="w-56">Player</span>
        <span className="w-14 text-center">Fls</span>
        <span className="w-16 text-center">Pts</span>
      </div>
      {rows.length === 0 && <p className="px-2 py-3 text-center text-white/40">No roster</p>}
      {rows.map((p, idx) => {
        const l = box.get(p.id);
        return (
          <div key={p.id} className={`flex items-center gap-2 px-3 py-1 ${idx % 2 ? "bg-white/[0.04]" : ""}`}>
            <span className="clock-digits w-11 text-center text-2xl font-black" style={{ color }}>{p.jersey_number || "—"}</span>
            <span className="w-56 truncate text-2xl font-bold uppercase">{nameFirstCommaInitial(p.name)}</span>
            <span className={`w-14 rounded text-center text-2xl font-black ${(l?.fls ?? 0) >= 5 ? "bg-red-600 text-white" : "font-bold text-white/80"}`}>{l?.fls ?? 0}</span>
            <span className="clock-digits w-16 text-center text-3xl font-black">{l?.pts ?? 0}</span>
          </div>
        );
      })}
    </div>
  );
}

function KantiCenter({ s, game, hName, aName, hideShot }: { s: GameState; game: number; hName: string; aName: string; hideShot: boolean }) {
  const shot = useSmoothShotTenths(s, true);
  return (
    <div className="flex h-full flex-col items-center justify-between gap-3 py-3">
      <p className="text-center text-lg font-black uppercase tracking-[0.25em] text-white/70">{s.tournament_name}</p>

      {/* logos */}
      <div className="flex w-full items-center justify-around">
        <KantiBadge logo={s.home_logo} name={hName} color={s.home_color} />
        <KantiBadge logo={s.away_logo} name={aName} color={s.away_color} />
      </div>

      {/* scores — grow to fill the vertical space (heavy ink so light colours stay legible) */}
      <div className="flex w-full flex-1 items-stretch gap-3">
        <div className="flex flex-1 items-center justify-center rounded-2xl" style={{ background: s.home_color }}>
          <span className="clock-digits font-black leading-none text-white" style={{ fontSize: "19rem", ...SCORE_INK }}>{s.home_score}</span>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-2xl" style={{ background: s.away_color }}>
          <span className="clock-digits font-black leading-none text-white" style={{ fontSize: "19rem", ...SCORE_INK }}>{s.away_score}</span>
        </div>
      </div>

      {/* game clock (timer) + timeouts left */}
      <div className="flex w-full items-center justify-between">
        <MiniBox label="T.O.L" value={tol(s, "home")} />
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">Game Clock</p>
          <p className="clock-digits font-black leading-none" style={{ color: "var(--amber-clock)", fontSize: "clamp(5rem, 13vh, 11rem)" }}>{formatClockTenths(game)}</p>
        </div>
        <MiniBox label="T.O.L" value={tol(s, "away")} />
      </div>

      {/* shot clock — between the game clock and the period (H on the OBS PC hides it) */}
      {!hideShot && (
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">Shot Clock</p>
          <p className="clock-digits font-black leading-none" style={{ color: "var(--red-shot)", fontSize: "clamp(3.5rem, 9vh, 7rem)", textShadow: "0 0 25px rgba(255,60,60,0.4)" }}>{formatShotClock(shot)}</p>
        </div>
      )}

      {/* team fouls + period */}
      <div className="flex w-full items-center justify-between">
        <MiniBox label="Team Foul" value={s.home_fouls} hi={s.home_fouls >= 5} />
        <div className="rounded-xl border-2 border-white/30 px-8 py-2 text-center">
          <p className="text-xs uppercase tracking-widest text-white/60">Period</p>
          <p className="text-5xl font-black">{periodLabel(s.quarter)}</p>
        </div>
        <MiniBox label="Team Foul" value={s.away_fouls} hi={s.away_fouls >= 5} />
      </div>
    </div>
  );
}

function KantiBadge({ logo, name, color }: { logo: string | null; name: string; color: string }) {
  return logo
    ? <img src={logo} alt="" className="h-16 w-16 rounded-lg bg-white object-contain p-1" />
    : <div className="grid h-16 w-16 place-items-center rounded-lg text-xl font-black text-white" style={{ background: color }}>{name.slice(0, 3).toUpperCase()}</div>;
}

function MiniBox({ label, value, hi }: { label: string; value: number; hi?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold uppercase tracking-widest text-white/70">{label}</p>
      <div className={`mt-1 grid place-items-center rounded-2xl border-2 ${hi ? "border-red-500 bg-red-600/30" : "border-white/30 bg-black/40"}`} style={{ height: 166, width: 166 }}>
        <span className={`font-black leading-none ${hi ? "text-red-300" : ""}`} style={{ fontSize: "6.5rem" }}>{value}</span>
      </div>
    </div>
  );
}

/* ---------- Style 2: ARENA1 (huge center-hung jumbotron) ---------- */

function ArenaBoardStyle({ s, hName, aName, hideShot }: { s: GameState; hName: string; aName: string; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-9 bg-[radial-gradient(circle_at_center,rgba(45,45,45,0.5),#000_75%)] px-14 pb-24 pt-8">
      <div className="absolute inset-x-14 bottom-4 z-20"><SponsorStrip height={70} /></div>

      {/* League badge */}
      <div className="flex flex-col items-center gap-2">
        <div className="grid place-items-center rounded-full bg-gradient-to-b from-orange-400 to-orange-600 shadow-[0_0_60px_rgba(255,140,0,0.55)] ring-4 ring-purple-700" style={{ height: 140, width: 140, fontSize: "4rem" }}>🏀</div>
        <p className="font-black uppercase tracking-[0.35em] text-white" style={{ fontSize: "2.4rem" }}>{s.tournament_name}</p>
      </div>

      {/* Scores: logo · score · SHOT · score · logo */}
      <div className="flex w-full items-center justify-center gap-10">
        <ArenaLogo color={s.home_color} name={hName} logo={s.home_logo} />
        <ScoreSquare score={s.home_score} />
        <div className="flex flex-col items-center px-6" style={{ minWidth: "13rem" }}>
          {!hideShot && <>
            <p className="font-bold uppercase tracking-[0.3em] text-zinc-400" style={{ fontSize: "1.7rem" }}>Shot</p>
            <p className="clock-digits font-black leading-none" style={{ color: "var(--red-shot)", textShadow: "0 0 30px rgba(255,60,60,0.5)", fontSize: "12rem" }}>{formatShotClock(shot)}</p>
          </>}
        </div>
        <ScoreSquare score={s.away_score} />
        <ArenaLogo color={s.away_color} name={aName} logo={s.away_logo} />
      </div>

      {/* Team names alongside the game clock */}
      <div className="grid w-full max-w-[1760px] grid-cols-[1fr_auto_1fr] items-center gap-8">
        <NamePill name={hName} color={s.home_color} bonus={s.away_fouls >= 5} align="right" />
        <div className="rounded-3xl border-2 border-zinc-700 bg-black px-16 py-4 text-center">
          <p className="clock-digits font-black leading-none" style={{ color: "var(--amber-clock)", textShadow: "0 0 40px rgba(255,200,0,0.55)", fontSize: "10.5rem" }}>{formatClockTenths(game)}</p>
          <p className="mt-1 font-black uppercase tracking-[0.4em] text-zinc-300" style={{ fontSize: "1.6rem" }}>{s.quarter >= 5 ? periodLabel(s.quarter) : `${periodLabel(s.quarter)} Quarter`}</p>
        </div>
        <NamePill name={aName} color={s.away_color} bonus={s.home_fouls >= 5} align="left" />
      </div>

      {/* Foul / timeout boxes */}
      <div className="grid w-full max-w-[1300px] grid-cols-2 gap-12">
        <div className="flex items-center justify-center gap-4"><StatBox label="Team Foul" value={s.home_fouls} hi={s.home_fouls >= 5} /><StatBox label="Timeout" value={tol(s, "home")} /></div>
        <div className="flex items-center justify-center gap-4"><StatBox label="Timeout" value={tol(s, "away")} /><StatBox label="Team Foul" value={s.away_fouls} hi={s.away_fouls >= 5} /></div>
      </div>
      {showHome && <ThreeBurst color={s.home_color} side="left" />}
      {showAway && <ThreeBurst color={s.away_color} side="right" />}
    </div>
  );
}

function NamePill({ name, color, bonus, align }: { name: string; color: string; bonus: boolean; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className="inline-flex max-w-full items-center gap-3 rounded-2xl px-8 py-4 shadow-lg" style={{ background: color }}>
        <span className="truncate font-black uppercase tracking-wide text-white" style={{ fontSize: "3.2rem" }}>{name}</span>
        {bonus && <span className="shrink-0 rounded bg-white px-2.5 py-1 font-black uppercase" style={{ color, fontSize: "1.1rem" }}>Bonus</span>}
      </div>
    </div>
  );
}

function ScoreSquare({ score }: { score: number }) {
  return (
    <div className="grid place-items-center rounded-3xl bg-white px-8" style={{ height: 320, minWidth: 300 }}>
      <span className="clock-digits font-black leading-none text-black" style={{ fontSize: "14rem" }}>{score}</span>
    </div>
  );
}

function ArenaLogo({ color, name, logo }: { color: string; name: string; logo: string | null }) {
  return (
    <div className="grid place-items-center rounded-full bg-white shadow-lg" style={{ height: 170, width: 170, boxShadow: `0 0 50px ${color}66`, border: `5px solid ${color}` }}>
      {logo ? <img src={logo} alt="" className="object-contain" style={{ height: 120, width: 120 }} /> : <span className="font-black" style={{ color, fontSize: "3rem" }}>{name.slice(0, 3).toUpperCase()}</span>}
    </div>
  );
}

function StatBox({ label, value, hi }: { label: string; value: number; hi?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border-2 px-5 py-3 ${hi ? "border-red-500 bg-red-950" : "border-zinc-700 bg-black"}`}>
      <span className={`font-black ${hi ? "text-red-300" : "text-white"}`} style={{ fontSize: "3.4rem" }}>{value}</span>
      <span className="font-bold uppercase leading-tight tracking-wider text-zinc-400" style={{ fontSize: "1.1rem" }}>{label}</span>
    </div>
  );
}

/* ---------- Style 3: NCAA1 (arena LED ribbon) ---------- */

function ArenaLedStyle({ s }: { s: GameState }) {
  const game = useSmoothGameClock(s, true);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black p-6">
      <div className="absolute inset-x-10 bottom-5 z-20"><SponsorStrip height={88} /></div>
      <div className="relative w-full max-w-[1700px] overflow-hidden rounded-md border-y-4 border-zinc-700 bg-[#050505] shadow-2xl"
           style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)", backgroundSize: "4px 4px" }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          {/* HOME */}
          <div className="flex items-center justify-end gap-5 px-8 py-7" style={{ background: `linear-gradient(90deg, transparent, ${s.home_color}33)` }}>
            <div className="text-right">
              <p className="text-2xl font-black uppercase tracking-wider" style={{ color: s.home_color }}>{s.home_name}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-white/50">FLS {s.home_fouls} · TOL {tol(s, "home")}</p>
            </div>
            <LedLogo color={s.home_color} name={s.home_name} logo={s.home_logo} />
            <p className="clock-digits text-[7rem] font-black leading-none text-white" style={{ textShadow: `0 0 30px ${s.home_color}` }}>{s.home_score}</p>
          </div>
          {/* CENTER: VS + clock + quarter */}
          <div className="flex flex-col items-center justify-center border-x-2 border-zinc-800 bg-black px-10 py-5">
            <p className="text-3xl font-black italic text-white/40">VS</p>
            <p className="clock-digits mt-1 text-5xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClockTenths(game)}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.3em] text-white/70">{s.quarter >= 5 ? periodLabel(s.quarter) : `${periodLabel(s.quarter)} QTR`}</p>
          </div>
          {/* AWAY */}
          <div className="flex items-center justify-start gap-5 px-8 py-7" style={{ background: `linear-gradient(-90deg, transparent, ${s.away_color}33)` }}>
            <p className="clock-digits text-[7rem] font-black leading-none text-white" style={{ textShadow: `0 0 30px ${s.away_color}` }}>{s.away_score}</p>
            <LedLogo color={s.away_color} name={s.away_name} logo={s.away_logo} />
            <div>
              <p className="text-2xl font-black uppercase tracking-wider" style={{ color: s.away_color }}>{s.away_name}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-white/50">FLS {s.away_fouls} · TOL {tol(s, "away")}</p>
            </div>
          </div>
        </div>
        {showHome && <ThreeBurst color={s.home_color} side="left" />}
        {showAway && <ThreeBurst color={s.away_color} side="right" />}
      </div>
    </div>
  );
}

function LedLogo({ color, name, logo }: { color: string; name: string; logo: string | null }) {
  return (
    <div className="grid h-20 w-20 place-items-center rounded-full bg-white" style={{ border: `3px solid ${color}` }}>
      {logo ? <img src={logo} alt="" className="h-16 w-16 object-contain" /> : <span className="text-lg font-black" style={{ color }}>{name.slice(0, 3).toUpperCase()}</span>}
    </div>
  );
}

/* ---------- Shared clock split for the Pydjian boards ---------- */
const pad2 = (n: number) => String(Math.max(0, n)).padStart(2, "0");
function clockParts(seconds: number) {
  const total = Math.max(0, seconds);
  return { mins: Math.floor(total / 60), secs: Math.floor(total % 60), tenths: Math.floor((total * 10) % 10) };
}
function shotParts(tenths: number) {
  const t = Math.max(0, tenths);
  return { whole: Math.floor(t / 10), tenth: t % 10, sub10: t < 100 };
}
function periodBig(q: number) {
  return q <= 4 ? (["1ST", "2ND", "3RD", "4TH"][q - 1] ?? `${q}TH`) : `OT${q - 4}`;
}

/* ---------- Style 4: SCOREBOARD PJY 1 (Pydjian Scoreboard Pro look) ---------- */
function PydjianProStyle({ s, hName, aName, hideShot }: { s: GameState; hName: string; aName: string; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const { mins, secs, tenths } = clockParts(game);
  const sp = shotParts(shot);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);

  const Panel = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl border-[3px] border-white/15 bg-black px-6 py-3 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]">{children}</div>
  );
  // A small black stat tile (T.O.L / FOULS). Fouls go red in the bonus (≥5 team fouls).
  const StatTile = ({ label, value, alert }: { label: string; value: number; alert?: boolean }) => (
    <div className="flex flex-col items-center">
      <span className="mb-1 text-base font-black uppercase tracking-wider text-white/70">{label}</span>
      <div className={`grid h-24 w-24 place-items-center rounded-2xl border-[3px] ${alert ? "border-red-500 bg-red-600" : "border-white/15 bg-black"}`}>
        <span className="clock-digits text-6xl font-black text-white">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col justify-between bg-[#16181d] p-6 text-white">
      {/* Top: game clock + shot clock */}
      <div className="flex items-start justify-center gap-8">
        <div>
          <div className="mb-1 flex justify-around px-2 text-lg font-black uppercase tracking-wider text-white/70">
            <span>Minutes</span><span>Seconds</span><span style={{ color: "var(--amber-clock)" }}>MS</span>
          </div>
          <Panel>
            <span className="clock-digits font-black leading-none" style={{ fontSize: "clamp(4rem, 16vh, 11rem)" }}>
              {pad2(mins)}<span className="text-white/80">:</span>{pad2(secs)}
              <span style={{ color: "var(--amber-clock)" }}>.{tenths}</span>
            </span>
          </Panel>
        </div>
        {!hideShot && (
          <div>
            <div className="mb-1 text-center text-lg font-black uppercase tracking-wider" style={{ color: "var(--amber-clock)" }}>Shotclock</div>
            <Panel>
              <span className="clock-digits font-black leading-none" style={{ fontSize: "clamp(4rem, 16vh, 11rem)", color: "var(--red-shot)", textShadow: "0 0 30px rgba(255,60,60,0.5)" }}>
                {sp.whole}{sp.sub10 && <span style={{ color: "var(--amber-clock)", fontSize: "0.55em" }}>.{sp.tenth}</span>}
              </span>
            </Panel>
          </div>
        )}
      </div>

      {/* Middle: quarter / period */}
      <div className="flex items-center justify-center gap-4">
        <span className="text-3xl font-black uppercase tracking-[0.2em] text-white/80">Quarter</span>
        <div className="grid place-items-center rounded-2xl border-[4px] border-white/20 bg-black px-10 py-2">
          <span className="clock-digits text-7xl font-black" style={{ color: "var(--red-shot)" }}>{periodBig(s.quarter)}</span>
        </div>
      </div>

      {/* Bottom: teams + scores + stats */}
      <div className="grid grid-cols-2 gap-10">
        {([["home", hName, s.home_color, s.home_score, s.home_fouls, tol(s, "home")], ["away", aName, s.away_color, s.away_score, s.away_fouls, tol(s, "away")]] as const).map(
          ([side, name, color, score, fouls, toRemain]) => {
            const inBonus = (side === "home" ? s.away_fouls : s.home_fouls) >= 5; // opponent reached 5 → this team shoots bonus
            return (
            <div key={side} className={`flex items-end gap-5 ${side === "away" ? "flex-row-reverse" : ""}`}>
              <div className={`flex-1 ${side === "away" ? "text-right" : ""}`}>
                <div className={`mb-1 flex items-center gap-2 ${side === "away" ? "flex-row-reverse" : ""}`}>
                  <p className="truncate text-4xl font-black uppercase tracking-wide" style={{ color }}>{name}</p>
                  {inBonus && <span className="shrink-0 rounded bg-white px-2 py-0.5 text-base font-black uppercase leading-none" style={{ color }}>Bonus</span>}
                </div>
                <div className="grid h-40 place-items-center rounded-2xl border-[3px] border-white/15 bg-black">
                  <span className="clock-digits font-black leading-none text-white" style={{ fontSize: "clamp(5rem, 18vh, 12rem)" }}>{score}</span>
                </div>
              </div>
              <StatTile label="T.O.L" value={toRemain} />
              <StatTile label="Fouls" value={fouls} alert={fouls >= 5} />
            </div>
            );
          }
        )}
      </div>

      <div className="absolute bottom-1 right-3 text-[11px] font-black uppercase tracking-wider text-white/30">Scoreboard PJY 1</div>
      {showHome && <ThreeBurst color={s.home_color} side="left" />}
      {showAway && <ThreeBurst color={s.away_color} side="right" />}
    </div>
  );
}

/* ---------- Style 6: STANDARD 3 (big top scores · shot clock + possession between · big clock/quarter below) ---------- */
function Std3StatTile({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-1 text-2xl font-black uppercase tracking-wider text-white/70">{label}</span>
      <div className={`grid h-32 w-32 place-items-center rounded-2xl border-[3px] ${alert ? "border-red-500 bg-red-600" : "border-white/15 bg-black"}`}>
        <span className="clock-digits text-8xl font-black text-white">{value}</span>
      </div>
    </div>
  );
}
function Std3ScoreCorner({ name, color, score, fouls, toRemain, oppFouls, right }: { name: string; color: string; score: number; fouls: number; toRemain: number; oppFouls: number; right?: boolean }) {
  const inBonus = oppFouls >= 5; // opponent reached 5 team fouls → this team shoots bonus
  return (
    <div className={`flex w-[41%] flex-col gap-4 ${right ? "items-end" : "items-start"}`}>
      <div className={`flex w-full items-center gap-3 ${right ? "flex-row-reverse" : ""}`}>
        <p className="min-w-0 flex-1 truncate text-7xl font-black uppercase tracking-wide" style={{ color, textAlign: right ? "right" : "left" }}>{name}</p>
        {inBonus && <span className="shrink-0 rounded bg-white px-3 py-1 text-2xl font-black uppercase leading-none" style={{ color }}>Bonus</span>}
      </div>
      <div className="grid w-full place-items-center rounded-[2rem] border-4 border-white/15 bg-black" style={{ height: 460 }}>
        <span className="clock-digits font-black leading-none text-white" style={{ fontSize: "21rem" }}>{score}</span>
      </div>
      <div className={`flex gap-6 ${right ? "flex-row-reverse" : ""}`}>
        <Std3StatTile label="T.O.L" value={toRemain} />
        <Std3StatTile label="Fouls" value={fouls} alert={fouls >= 5} />
      </div>
    </div>
  );
}
function Standard3DisplayStyle({ s, hName, aName, hideShot }: { s: GameState; hName: string; aName: string; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const { mins, secs, tenths } = clockParts(game);
  const sp = shotParts(shot);
  const poss = usePossession(s.court_id);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  const dim = "rgba(255,255,255,0.12)";

  return (
    <div className="relative flex h-full w-full flex-col bg-[#16181d] p-8 text-white">
      {/* Top: big team scores with ONLY the shot clock (+ possession direction) between them */}
      <div className="flex flex-1 items-center justify-between gap-4">
        <Std3ScoreCorner name={hName} color={s.home_color} score={s.home_score} fouls={s.home_fouls} toRemain={tol(s, "home")} oppFouls={s.away_fouls} />

        <div className="flex flex-col items-center gap-4" style={{ width: 380 }}>
          {/* Possession direction — the lit arrow points to the team with the ball */}
          <div className="flex items-center gap-5">
            <span className="font-black leading-none" style={{ fontSize: "4.5rem", color: poss === "home" ? s.home_color : dim, textShadow: poss === "home" ? `0 0 26px ${s.home_color}` : "none" }}>◄</span>
            <span className="text-lg font-black uppercase tracking-[0.3em] text-white/45">Poss</span>
            <span className="font-black leading-none" style={{ fontSize: "4.5rem", color: poss === "away" ? s.away_color : dim, textShadow: poss === "away" ? `0 0 26px ${s.away_color}` : "none" }}>►</span>
          </div>
          {!hideShot && (
            <div className="text-center">
              <div className="mb-1 text-2xl font-black uppercase tracking-[0.2em]" style={{ color: "var(--amber-clock)" }}>Shotclock</div>
              <div className="rounded-[2rem] border-4 border-white/15 bg-black px-10 py-3">
                <span className="clock-digits font-black leading-none" style={{ fontSize: "10rem", color: "var(--red-shot)", textShadow: "0 0 44px rgba(255,60,60,0.55)" }}>
                  {sp.whole}{sp.sub10 && <span style={{ color: "var(--amber-clock)", fontSize: "0.5em" }}>.{sp.tenth}</span>}
                </span>
              </div>
            </div>
          )}
        </div>

        <Std3ScoreCorner name={aName} color={s.away_color} score={s.away_score} fouls={s.away_fouls} toRemain={tol(s, "away")} oppFouls={s.home_fouls} right />
      </div>

      {/* Bottom: game clock + quarter, enlarged but lifted clear of the bottom edge */}
      <div className="flex items-end justify-center gap-12 pb-6">
        <div className="text-center">
          <div className="mb-1 flex justify-around px-6 text-xl font-black uppercase tracking-wider text-white/70">
            <span>Minutes</span><span>Seconds</span><span style={{ color: "var(--amber-clock)" }}>MS</span>
          </div>
          <div className="rounded-[2rem] border-4 border-white/15 bg-black px-10 py-2">
            <span className="clock-digits font-black leading-none" style={{ fontSize: "8.5rem" }}>
              {pad2(mins)}<span className="text-white/80">:</span>{pad2(secs)}<span style={{ color: "var(--amber-clock)", fontSize: "0.5em" }}>.{tenths}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-3xl font-black uppercase tracking-[0.2em] text-white/80">Quarter</span>
          <div className="grid place-items-center rounded-[2rem] border-4 border-white/20 bg-black px-10 py-2">
            <span className="clock-digits font-black" style={{ fontSize: "6.8rem", color: "var(--red-shot)" }}>{periodBig(s.quarter)}</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-1 right-3 text-[11px] font-black uppercase tracking-wider text-white/30">Standard 3</div>
      {showHome && <ThreeBurst color={s.home_color} side="left" />}
      {showAway && <ThreeBurst color={s.away_color} side="right" />}
    </div>
  );
}

/* ---------- Style 5: SCOREBOARD PJY 2 (Pydjian LED 7-segment look) ---------- */
function PydjianLedStyle({ s, hName, aName, hideShot }: { s: GameState; hName: string; aName: string; hideShot: boolean }) {
  const game = useSmoothGameClock(s, true);
  const shot = useSmoothShotTenths(s, true);
  const { mins, secs, tenths } = clockParts(game);
  const sp = shotParts(shot);
  const showHome = useThreePulse("home", s.three_pulse_home);
  const showAway = useThreePulse("away", s.three_pulse_away);
  // Fixed LED palette (matches the Pydjian hardware board, not team colours).
  const LED = { clock: "#f5f5f5", tenths: "#ffd400", shot: "#ff2b2b", fouls: "#ff2b2b", home: "#ff7a00", visitor: "#39ff14" };
  const glow = (c: string) => ({ color: c, textShadow: `0 0 18px ${c}, 0 0 4px ${c}` });

  const Fouls = ({ value }: { value: number }) => (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-black uppercase leading-tight tracking-wide text-white/85">Team</span>
      <span className="mb-2 text-2xl font-black uppercase leading-tight tracking-wide text-white/85">Fouls</span>
      <span className="clock-digits font-black leading-none" style={{ fontSize: "clamp(3rem, 12vh, 8rem)", ...glow(LED.fouls) }}>{pad2(value)}</span>
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 bg-black p-6">
      {/* Clock row with team fouls flanking */}
      <div className="flex w-full items-center justify-between gap-6">
        <Fouls value={s.home_fouls} />
        <span className="clock-digits font-black leading-none" style={{ fontSize: "clamp(6rem, 26vh, 18rem)", ...glow(LED.clock) }}>
          {pad2(mins)}<span style={glow(LED.clock)}>:</span>{pad2(secs)}
          <span style={glow(LED.tenths)}>.{tenths}</span>
        </span>
        <Fouls value={s.away_fouls} />
      </div>

      {/* Shot clock */}
      {!hideShot && (
        <div className="flex flex-col items-center">
          <span className="clock-digits font-black leading-none" style={{ fontSize: "clamp(3.5rem, 16vh, 11rem)", ...glow(LED.shot) }}>
            {sp.whole}{sp.sub10 && <span style={glow(LED.tenths)}>.{sp.tenth}</span>}
          </span>
          <span className="text-2xl font-black uppercase tracking-[0.3em] text-white/80">Shotclock</span>
        </div>
      )}

      {/* Scores */}
      <div className="grid w-full grid-cols-2 gap-10">
        {([["home", hName, s.home_score, LED.home], ["away", aName, s.away_score, LED.visitor]] as const).map(([side, name, score, c]) => {
          const inBonus = (side === "home" ? s.away_fouls : s.home_fouls) >= 5; // opponent at 5 → this side in bonus
          return (
          <div key={side} className="flex flex-col items-center">
            <div className="mb-1 flex items-center gap-3">
              <span className="text-5xl font-black uppercase tracking-wide text-white">{side === "home" ? "HOME" : "VISITOR"}</span>
              {inBonus && <span className="rounded px-2 py-0.5 text-lg font-black uppercase leading-none" style={{ background: LED.fouls, color: "#fff", textShadow: `0 0 12px ${LED.fouls}` }}>Bonus</span>}
            </div>
            <span className="clock-digits font-black leading-none" style={{ fontSize: "clamp(6rem, 26vh, 18rem)", ...glow(c) }}>{score}</span>
            <span className="mt-1 truncate text-xl font-bold uppercase tracking-wider text-white/50">{name}</span>
          </div>
          );
        })}
      </div>

      <div className="absolute bottom-1 right-3 text-[11px] font-black uppercase tracking-wider text-white/25">Scoreboard PJY 2</div>
      {showHome && <ThreeBurst color={s.home_color} side="left" />}
      {showAway && <ThreeBurst color={s.away_color} side="right" />}
    </div>
  );
}
