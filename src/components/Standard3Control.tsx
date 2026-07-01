import { useState } from "react";
import { Play, Pause, Lock, Unlock } from "lucide-react";
import {
  type GameState,
  useSmoothGameClock, useSmoothShotTenths, serverNow,
  scoreFromAction, addScore, addFoul, addTimeout, timeoutMaxForQuarter,
  adjustGameClock, adjustShotClock, resetShotClock,
  startBothClocks, pauseBothClocks, startGameClock, pauseGameClock,
  setQuarter, advanceQuarter, resetClocksForQuarter, buzzer,
} from "@/lib/game-state";
import { setBreak } from "@/lib/ads";
import { ClockBuzzer } from "@/components/Buzzer";
import { PossessionButtons } from "@/components/Possession";

/* SCOREBOARD "Standard 3" — styled after the Pydjian Scoreboard PRO console.
   Drives the same shared game state as every other control panel.

   AVOIDS the dropped-tap bug that killed the old PJY panels:
   - the ~60fps smooth clock lives ONLY inside <GameDigits>/<ShotDigits>, so the board
     around them does NOT re-render every frame;
   - every score / foul / timeout block is a STABLE top-level component (not an inline
     function defined during render), so its buttons are never unmounted/remounted on a
     state change — taps always land, even with the clock running. */

const pad2 = (n: number) => String(Math.max(0, n)).padStart(2, "0");
function clockParts(sec: number) {
  const t = Math.max(0, sec);
  return { mins: Math.floor(t / 60), secs: Math.floor(t % 60), tenths: Math.floor((t * 10) % 10) };
}
const periodBig = (q: number) => (q <= 4 ? (["1ST", "2ND", "3RD", "4TH"][q - 1] ?? `${q}TH`) : `OT${q - 4}`);
const toRemain = (s: GameState, side: "home" | "away") =>
  Math.max(0, timeoutMaxForQuarter(s.quarter) - (side === "home" ? s.home_timeouts : s.away_timeouts));
const nowIso = () => new Date(serverNow()).toISOString();

/* ---- Isolated clock digits: ONLY these re-render on the rAF tick ---- */
function GameDigits({ s }: { s: GameState }) {
  const { mins, secs, tenths } = clockParts(useSmoothGameClock(s));
  return (
    <div className="clock-digits flex items-baseline justify-center font-black leading-none text-white">
      <span className="text-[5.5rem]">{pad2(mins)}</span>
      <span className="text-[5.5rem] text-white/60">:</span>
      <span className="text-[5.5rem]">{pad2(secs)}</span>
      <span className="ml-1 w-[2.4rem] text-[3.4rem] text-amber-400">.{tenths}</span>
    </div>
  );
}
function ShotDigits({ s, dimmed }: { s: GameState; dimmed?: boolean }) {
  const t = Math.max(0, useSmoothShotTenths(s));
  const whole = Math.floor(t / 10), tenth = t % 10;
  return (
    <div className="clock-digits flex items-baseline justify-center font-black leading-none" style={{ opacity: dimmed ? 0.4 : 1 }}>
      <span className="text-[5.5rem] text-red-500">{whole}</span>
      <span className="ml-1 w-[2rem] text-[3.2rem] text-amber-400">.{tenth}</span>
    </div>
  );
}

function Chip({ children, onClick, disabled, tone = "dark" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "dark" | "danger" | "go" }) {
  const cls =
    tone === "danger" ? "border-red-500/60 text-red-300 hover:bg-red-600 hover:text-white"
    : tone === "go" ? "border-emerald-500/60 text-emerald-300 hover:bg-emerald-600 hover:text-white"
    : "border-white/20 text-white/85 hover:bg-white/10";
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-md border px-2.5 py-1.5 text-xs font-black uppercase tracking-wide transition ${cls} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
      {children}
    </button>
  );
}

/* ---- Stable team blocks (never remount on a tick) ---- */
function ScoreBlock({ s, side }: { s: GameState; side: "home" | "away" }) {
  const isHome = side === "home";
  const name = isHome ? s.home_name : s.away_name;
  const color = isHome ? s.home_color : s.away_color;
  const score = isHome ? s.home_score : s.away_score;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="max-w-[15rem] truncate text-3xl font-black uppercase tracking-wide" style={{ color }}>{name}</p>
      <div className="grid w-[15rem] place-items-center rounded-2xl border-4 border-white/80 bg-black py-2">
        <span className="clock-digits text-[6rem] font-black leading-none text-white">{score}</span>
      </div>
      <div className="flex gap-1.5">
        <Chip onClick={() => addScore(s, side, -1)}>-1</Chip>
        <Chip onClick={() => scoreFromAction(s, side, "FT_MADE")} tone="go">+1</Chip>
        <Chip onClick={() => scoreFromAction(s, side, "2PT_MADE")} tone="go">+2</Chip>
        <Chip onClick={() => scoreFromAction(s, side, "3PT_MADE")} tone="go">+3</Chip>
      </div>
    </div>
  );
}
function FoulsBlock({ s, side }: { s: GameState; side: "home" | "away" }) {
  const fouls = side === "home" ? s.home_fouls : s.away_fouls;
  const hot = fouls >= 5;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-lg font-black uppercase tracking-wide text-white/80">Fouls</p>
      <div className={`grid h-24 w-24 place-items-center rounded-2xl border-4 ${hot ? "border-red-500 bg-red-600" : "border-white/80 bg-black"}`}>
        <span className="clock-digits text-6xl font-black leading-none text-white">{fouls}</span>
      </div>
      <div className="flex gap-1.5"><Chip onClick={() => addFoul(s, side, -1)}>-1</Chip><Chip onClick={() => addFoul(s, side, 1)}>+1</Chip></div>
      <Chip onClick={() => addFoul(s, side, -fouls)} tone="danger">Reset</Chip>
    </div>
  );
}
function TimeoutBlock({ s, side }: { s: GameState; side: "home" | "away" }) {
  const remain = toRemain(s, side);
  const used = side === "home" ? s.home_timeouts : s.away_timeouts;
  const startTO = (seconds: number) => { addTimeout(s, side, 1); setBreak(s.court_id, { show: true, running: true, started_at: nowIso(), seconds, label: "TIME OUT" }).catch(() => { /* ignore */ }); };
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-lg font-black uppercase tracking-wide text-white/80">T.O.L</p>
      <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-white/80 bg-black">
        <span className="clock-digits text-6xl font-black leading-none text-white">{remain}</span>
      </div>
      {/* -1 uses a timeout (fewer left); +1 gives one back */}
      <div className="flex gap-1.5"><Chip onClick={() => addTimeout(s, side, 1)}>-1</Chip><Chip onClick={() => addTimeout(s, side, -1)}>+1</Chip></div>
      <Chip onClick={() => addTimeout(s, side, -used)} tone="danger">Reset</Chip>
      <div className="flex gap-1.5"><Chip onClick={() => startTO(60)}>60</Chip><Chip onClick={() => startTO(30)}>30</Chip></div>
      <Chip onClick={() => setBreak(s.court_id, { show: true, running: true, started_at: nowIso(), seconds: 60, label: "TIME OUT" }).catch(() => { /* ignore */ })}>Timeout</Chip>
    </div>
  );
}

function QuarterBar({ s }: { s: GameState }) {
  const cell = (active: boolean) => `grid h-9 place-items-center rounded-md text-sm font-black ${active ? "bg-white text-black" : "border border-white/20 bg-black text-white/70 hover:bg-white/10"}`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4].map((q) => (
          <button key={q} onClick={() => setQuarter(s, q)} title="Set quarter (resets team fouls + clocks)" className={`w-9 ${cell(s.quarter === q)}`}>{q}</button>
        ))}
        <span className="mx-1 text-lg font-black uppercase tracking-wider text-white/80">Quarter</span>
        <button onClick={() => advanceQuarter(s, Math.max(5, s.quarter + 1))} title="Overtime" className={`min-w-[2.6rem] px-1 ${cell(s.quarter >= 5)}`}>{s.quarter >= 5 ? `OT${s.quarter - 4}` : "OT"}</button>
      </div>
      <div className="grid min-w-[9rem] place-items-center rounded-2xl border-4 border-white/80 bg-black px-6 py-1">
        <span className="clock-digits text-5xl font-black text-white">{periodBig(s.quarter)}</span>
      </div>
    </div>
  );
}

/* ---- SCOREBOARD Standard 3 (Pydjian PRO look) ---- */
export function Standard3Control({ s }: { s: GameState }) {
  const soundOn = typeof window === "undefined" ? true : localStorage.getItem(`bdc_buzzer_${s.court_id}`) !== "0";
  const locked = typeof window !== "undefined" && localStorage.getItem(`bdc_timerlock_${s.court_id}`) === "1";

  const shotKey = `bdc_shotlock_${s.court_id}`;
  const [shotLocked, setShotLocked] = useState(() => typeof window !== "undefined" && localStorage.getItem(shotKey) === "1");
  const toggleShotLock = () => setShotLocked((v) => { const n = !v; try { localStorage.setItem(shotKey, n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const shotOff = locked || shotLocked;

  const running = shotLocked ? s.game_clock_running : (s.game_clock_running || s.shot_clock_running);
  const toggleRun = () => {
    if (locked) return;
    if (shotLocked) return s.game_clock_running ? pauseGameClock(s) : startGameClock(s);
    return running ? pauseBothClocks(s) : startBothClocks(s);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-6 text-white">
      <ClockBuzzer s={s} enabled={soundOn} />

      {/* Clocks */}
      <div className="flex flex-wrap items-start justify-center gap-10">
        <div className="flex flex-col items-center">
          <div className="mb-1 flex w-full justify-between gap-6 px-4 text-sm font-black uppercase tracking-wide text-white/60"><span>Minutes</span><span>Seconds</span><span className="text-amber-400">MS</span></div>
          <div className="relative rounded-2xl border-4 border-white/80 bg-black px-6 py-2">
            <button disabled={locked} onClick={() => resetClocksForQuarter(s, !shotLocked)} title={shotLocked ? "Reset game clock (shot clock is Ref 2's)" : "Reset clocks for the quarter"} className={`absolute right-2 top-2 rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-black text-white/70 hover:bg-white/10 ${locked ? "opacity-40" : ""}`}>RESET</button>
            <GameDigits s={s} />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -1)}>◄</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 1)}>►</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -10)}>-10s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 10)}>+10s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -60)}>-1m</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 60)}>+1m</Chip>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="mb-1 text-sm font-black uppercase tracking-wide text-white/80">Shotclock {shotLocked && <span className="text-amber-400">→ Ref 2</span>}</div>
          <div className="rounded-2xl border-4 border-white/80 bg-black px-6 py-2">
            <ShotDigits s={s} dimmed={shotOff} />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Chip disabled={shotOff} onClick={() => adjustShotClock(s, -10)}>◄</Chip>
            <Chip disabled={shotOff} onClick={() => adjustShotClock(s, 10)}>►</Chip>
            <Chip disabled={shotOff} onClick={() => resetShotClock(s, 240)}>24</Chip>
            <Chip disabled={shotOff} onClick={() => resetShotClock(s, 140)}>14</Chip>
          </div>
          <PossessionButtons s={s} className="mt-2 justify-center" />
        </div>
      </div>

      {/* Quarter */}
      <div className="my-5"><QuarterBar s={s} /></div>

      {/* Teams flank the central control cluster (PHILIPPINES · CONTROL · BRAZIL) */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-5">
          <ScoreBlock s={s} side="home" />
          <TimeoutBlock s={s} side="home" />
          <FoulsBlock s={s} side="home" />
        </div>

        <div className="flex flex-col items-center gap-3 px-2">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-white/45">Control</p>
          <button disabled={locked} onClick={toggleRun} title={shotLocked ? "Start / pause the game clock (shot clock is Ref 2's)" : "Start / pause both clocks"} className={`grid h-20 w-20 place-items-center rounded-full text-white shadow-lg transition ${running ? "bg-red-600 hover:bg-red-500" : "bg-sky-500 hover:bg-sky-400"} ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
            {running ? <Pause className="h-9 w-9" /> : <Play className="h-9 w-9" />}
          </button>
          <div className="flex gap-1.5">
            <Chip disabled={shotOff} onClick={() => resetShotClock(s, 240)}>24</Chip>
            <Chip disabled={shotOff} onClick={() => resetShotClock(s, 140)}>14</Chip>
            <Chip onClick={() => buzzer(s)} tone="danger">Horn</Chip>
          </div>
          <button onClick={toggleShotLock} title={shotLocked ? "Shot clock handed to Ref 2 — click to take it back" : "Hand the shot clock to Ref 2 (this panel keeps game time + score + fouls + timeouts)"} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide transition ${shotLocked ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/20 text-white/70 hover:bg-white/10"}`}>
            {shotLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {shotLocked ? "Shot clock: Ref 2" : "Lock shot clock"}
          </button>
        </div>

        <div className="flex items-start gap-5">
          <FoulsBlock s={s} side="away" />
          <TimeoutBlock s={s} side="away" />
          <ScoreBlock s={s} side="away" />
        </div>
      </div>
    </div>
  );
}
