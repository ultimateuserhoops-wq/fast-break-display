import { useState } from "react";
import { Play, Pause, Lock, Unlock } from "lucide-react";
import {
  type GameState,
  useSmoothGameClock, useSmoothShotTenths,
  scoreFromAction, addScore, resetScore, addFoul, addTimeout, timeoutMaxForQuarter,
  adjustGameClock, adjustShotClock, resetShotClock,
  startBothClocks, pauseBothClocks, startGameClock, pauseGameClock, startShotClock, pauseShotClock,
  setQuarter, advanceQuarter, resetClocksForQuarter, buzzer,
} from "@/lib/game-state";
import { ClockBuzzer } from "@/components/Buzzer";
import { contrastText } from "@/lib/color";

/* Operator control panels styled to match the SCOREBOARD PJY 1 / PJY 2 OBS displays.
   Every button writes to the same shared game state as the standard control panel. */

const pad2 = (n: number) => String(Math.max(0, n)).padStart(2, "0");
function clockParts(seconds: number) {
  const total = Math.max(0, seconds);
  return { mins: Math.floor(total / 60), secs: Math.floor(total % 60), tenths: Math.floor((total * 10) % 10) };
}
function shotParts(tenths: number) {
  const t = Math.max(0, tenths);
  return { whole: Math.floor(t / 10), tenth: t % 10, sub10: t < 100 };
}
const periodBig = (q: number) => (q <= 4 ? (["1ST", "2ND", "3RD", "4TH"][q - 1] ?? `${q}TH`) : `OT${q - 4}`);
const toRemain = (s: GameState, side: "home" | "away") => Math.max(0, timeoutMaxForQuarter(s.quarter) - (side === "home" ? s.home_timeouts : s.away_timeouts));

function useLock(courtId: string) {
  return typeof window !== "undefined" && localStorage.getItem(`bdc_timerlock_${courtId}`) === "1";
}
function useSound(courtId: string) {
  return typeof window === "undefined" ? true : localStorage.getItem(`bdc_buzzer_${courtId}`) !== "0";
}
// Per-device "hand the shot clock to Ref 2" lock. When on, THIS panel won't touch the shot clock,
// so a second official can run it from the Shot Clock control without conflicts.
function useShotLock(courtId: string) {
  const key = `bdc_shotlock_${courtId}`;
  const [on, setOn] = useState(() => typeof window !== "undefined" && localStorage.getItem(key) === "1");
  const toggle = () => setOn((v) => { const n = !v; try { localStorage.setItem(key, n ? "1" : "0"); } catch { /* ignore */ } return n; });
  return [on, toggle] as const;
}

function ShotLockToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={on ? "Shot clock is handed to Ref 2 — this panel won't change it. Click to take it back." : "Hand the shot clock to a second official (Ref 2). This panel keeps score + game clock only."}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide transition ${on ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/20 text-white/70 hover:bg-white/10"}`}>
      {on ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      {on ? "Shot clock: Ref 2" : "Lock shot clock"}
    </button>
  );
}

/* A small dark control button (the ◄ ► / +/- chips on the board). */
function Chip({ children, onClick, disabled, tone = "dark" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "dark" | "danger" | "go" }) {
  const cls =
    tone === "danger" ? "border-red-500/60 text-red-300 hover:bg-red-600 hover:text-white"
    : tone === "go" ? "border-emerald-500/60 text-emerald-300 hover:bg-emerald-600 hover:text-white"
    : "border-white/15 text-white/85 hover:bg-white/10";
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-md border px-2.5 py-1.5 text-xs font-black uppercase tracking-wide transition ${cls} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
      {children}
    </button>
  );
}

function QuarterStrip({ s }: { s: GameState }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4].map((q) => (
        <button key={q} onClick={() => setQuarter(s, q)} title="Set quarter (resets team fouls + clocks)"
          className={`grid h-9 w-9 place-items-center rounded-md border text-sm font-black ${s.quarter === q ? "bg-white text-black" : "border-white/15 text-white/80 hover:bg-white/10"}`}>
          {q}
        </button>
      ))}
      <button onClick={() => advanceQuarter(s, Math.max(5, s.quarter + 1))} title="Overtime"
        className={`grid h-9 min-w-[2.75rem] place-items-center rounded-md border px-2 text-sm font-black ${s.quarter >= 5 ? "bg-white text-black" : "border-white/15 text-white/80 hover:bg-white/10"}`}>
        {s.quarter >= 5 ? `OT${s.quarter - 4}` : "OT"}
      </button>
      <div className="ml-2 grid place-items-center rounded-xl border-[3px] border-white/20 bg-black px-6 py-1">
        <span className="clock-digits text-3xl font-black" style={{ color: "var(--red-shot)" }}>{periodBig(s.quarter)}</span>
      </div>
    </div>
  );
}

function Transport({ s, locked, shotLocked }: { s: GameState; locked: boolean; shotLocked?: boolean }) {
  // When the shot clock is handed to Ref 2, the play button runs only the GAME clock.
  const running = shotLocked ? s.game_clock_running : (s.game_clock_running || s.shot_clock_running);
  const toggle = () => {
    if (shotLocked) return s.game_clock_running ? pauseGameClock(s) : startGameClock(s);
    return running ? pauseBothClocks(s) : startBothClocks(s);
  };
  return (
    <div className="flex items-center justify-center gap-3">
      <button disabled={locked} onClick={toggle} title={shotLocked ? "Start / pause the game clock (shot clock is Ref 2's)" : "Start / pause both clocks"}
        className={`grid h-16 w-16 place-items-center rounded-full text-white shadow-lg transition ${running ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"} ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
        {running ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
      </button>
      <button disabled={locked} onClick={() => buzzer(s)} title="Horn"
        className={`grid h-12 w-12 place-items-center rounded-xl bg-red-700 text-[10px] font-black uppercase text-white hover:bg-red-600 ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
        Horn
      </button>
    </div>
  );
}

// LED palette (module scope, shared by the LED digit + score components).
const LED = { clock: "#f5f5f5", tenths: "#ffd400", shot: "#ff2b2b", fouls: "#ff2b2b", home: "#ff7a00", visitor: "#39ff14" };
const glow = (c: string) => ({ color: c, textShadow: `0 0 16px ${c}` });

/* Isolated clock digits — ONLY these re-render on the ~60fps rAF tick, so the surrounding board
   (score buttons etc.) stays static and responsive while the clock runs. */
function ProGameDigits({ s }: { s: GameState }) {
  const { mins, secs, tenths } = clockParts(useSmoothGameClock(s));
  return <span className="clock-digits text-7xl font-black">{pad2(mins)}<span className="text-white/70">:</span>{pad2(secs)}<span style={{ color: "var(--amber-clock)" }}>.{tenths}</span></span>;
}
function ProShotDigits({ s }: { s: GameState }) {
  const sp = shotParts(useSmoothShotTenths(s));
  return <span className="clock-digits text-7xl font-black" style={{ color: "var(--red-shot)" }}>{sp.whole}{sp.sub10 && <span style={{ color: "var(--amber-clock)", fontSize: "0.55em" }}>.{sp.tenth}</span>}</span>;
}
function LedGameDigits({ s }: { s: GameState }) {
  const { mins, secs, tenths } = clockParts(useSmoothGameClock(s));
  return <span className="clock-digits text-8xl font-black leading-none" style={glow(LED.clock)}>{pad2(mins)}:{pad2(secs)}<span style={glow(LED.tenths)}>.{tenths}</span></span>;
}
function LedShotDigits({ s }: { s: GameState }) {
  const sp = shotParts(useSmoothShotTenths(s));
  return <span className="clock-digits text-6xl font-black leading-none" style={glow(LED.shot)}>{sp.whole}{sp.sub10 && <span style={glow(LED.tenths)}>.{sp.tenth}</span>}</span>;
}

// Top-level (stable) team block for PJY 1 — NOT an inline component, so its score buttons aren't
// unmounted/remounted on every board re-render (which used to drop taps).
function ProTeam({ s, side }: { s: GameState; side: "home" | "away" }) {
  const isHome = side === "home";
  const name = isHome ? s.home_name : s.away_name;
  const color = isHome ? s.home_color : s.away_color;
  const score = isHome ? s.home_score : s.away_score;
  const fouls = isHome ? s.home_fouls : s.away_fouls;
  const inBonus = (isHome ? s.away_fouls : s.home_fouls) >= 5; // opponent at 5 fouls → this team in bonus
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="truncate text-2xl font-black uppercase" style={{ color }}>{name}</p>
        {inBonus && <span className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-black uppercase text-white">Bonus</span>}
      </div>
      <div className="flex items-stretch gap-4">
        <div className="grid flex-1 place-items-center rounded-2xl border-[3px] border-white/15 bg-black py-2">
          <span className="clock-digits text-7xl font-black leading-none text-white">{score}</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5">
          <span className="text-[10px] font-black uppercase text-white/60">T.O.L</span>
          <div className="grid h-12 w-12 place-items-center rounded-lg border-2 border-white/15 bg-black"><span className="clock-digits text-2xl font-black text-white">{toRemain(s, side)}</span></div>
          <div className="flex gap-1"><Chip onClick={() => addTimeout(s, side, 1)}>TO</Chip><Chip onClick={() => addTimeout(s, side, -1)}>↺</Chip></div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5">
          <span className="text-[10px] font-black uppercase text-white/60">Fouls</span>
          <div className={`grid h-12 w-12 place-items-center rounded-lg border-2 ${fouls >= 5 ? "border-red-500 bg-red-600" : "border-white/15 bg-black"}`}><span className="clock-digits text-2xl font-black text-white">{fouls}</span></div>
          <div className="flex gap-1"><Chip onClick={() => addFoul(s, side, 1)}>+1</Chip><Chip onClick={() => addFoul(s, side, -1)}>−1</Chip></div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {(["3PT_MADE", "2PT_MADE", "FT_MADE"] as const).map((a, i) => (
          <button key={a} onClick={() => scoreFromAction(s, side, a)} className="rounded-lg py-2.5 text-sm font-black shadow-sm ring-1 ring-black/20 transition hover:brightness-110" style={{ background: color, color: contrastText(color) }}>+{[3, 2, 1][i]}</button>
        ))}
        <button onClick={() => addScore(s, side, -1)} className="rounded-lg py-2.5 text-sm font-black text-white/80 ring-1 ring-white/10" style={{ background: color, opacity: 0.55 }}>−1</button>
        <button onClick={() => addScore(s, side, -2)} className="rounded-lg py-2.5 text-sm font-black text-white/80 ring-1 ring-white/10" style={{ background: color, opacity: 0.55 }}>−2</button>
        <button onClick={() => confirm(`Reset ${name}'s score?`) && resetScore(s, side)} className="rounded-lg border-2 border-red-500 py-2.5 text-sm font-black text-red-300 hover:bg-red-600 hover:text-white">RST</button>
      </div>
    </div>
  );
}

/* ---------- SCOREBOARD PJY 1 — Pydjian Pro control ---------- */
export function PydjianProControl({ s }: { s: GameState }) {
  const locked = useLock(s.court_id);
  const [shotLocked, toggleShotLock] = useShotLock(s.court_id);
  const shotOff = locked || shotLocked;
  const sound = useSound(s.court_id);

  return (
    <div className="rounded-2xl border bg-[#16181d] p-5 text-white">
      <ClockBuzzer s={s} enabled={sound} />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Scoreboard PJY 1 — Control</span>
        <ShotLockToggle on={shotLocked} onClick={toggleShotLock} />
      </div>

      <div className="flex flex-wrap items-start justify-center gap-8">
        <div>
          <div className="mb-1 flex justify-around text-sm font-black uppercase tracking-wide text-white/60"><span>Minutes</span><span>Seconds</span><span style={{ color: "var(--amber-clock)" }}>MS</span></div>
          <div className="rounded-2xl border-[3px] border-white/15 bg-black px-6 py-2 text-center">
            <ProGameDigits s={s} />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -60)}>−1m</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -10)}>−10s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -1)}>−1s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 1)}>+1s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 10)}>+10s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 60)}>+1m</Chip>
            <Chip disabled={locked} onClick={() => resetClocksForQuarter(s, !shotLocked)} tone="danger">Reset</Chip>
          </div>
        </div>
        <div>
          <div className="mb-1 text-center text-sm font-black uppercase tracking-wide" style={{ color: "var(--amber-clock)" }}>Shotclock</div>
          <div className="rounded-2xl border-[3px] border-white/15 bg-black px-6 py-2 text-center">
            <ProShotDigits s={s} />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Chip disabled={shotOff} onClick={() => resetShotClock(s, 240)}>24</Chip>
            <Chip disabled={shotOff} onClick={() => resetShotClock(s, 140)}>14</Chip>
            <Chip disabled={shotOff} onClick={() => adjustShotClock(s, -10)}>−1s</Chip>
            <Chip disabled={shotOff} onClick={() => adjustShotClock(s, 10)}>+1s</Chip>
            <Chip disabled={shotOff} onClick={() => (s.shot_clock_running ? pauseShotClock(s) : startShotClock(s))} tone="go">{s.shot_clock_running ? "Stop" : "Run"}</Chip>
          </div>
          {shotLocked && <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-wide text-amber-400/80">Shot clock → Ref 2</p>}
        </div>
      </div>

      <div className="my-4"><QuarterStrip s={s} /></div>
      <div className="my-4"><Transport s={s} locked={locked} shotLocked={shotLocked} /></div>

      <div className="grid gap-5 md:grid-cols-2"><ProTeam s={s} side="home" /><ProTeam s={s} side="away" /></div>
    </div>
  );
}

// Top-level (stable) LED foul + score blocks — same responsiveness fix as ProTeam.
function LedFouls({ s, side }: { s: GameState; side: "home" | "away" }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-center text-sm font-black uppercase leading-tight tracking-wide text-white/80">Team<br />Fouls</span>
      <span className="clock-digits text-6xl font-black leading-none" style={glow(LED.fouls)}>{pad2(side === "home" ? s.home_fouls : s.away_fouls)}</span>
      <div className="flex gap-1"><Chip onClick={() => addFoul(s, side, 1)}>+1</Chip><Chip onClick={() => addFoul(s, side, -1)}>−1</Chip></div>
    </div>
  );
}
function LedScore({ s, side }: { s: GameState; side: "home" | "away" }) {
  const isHome = side === "home";
  const score = isHome ? s.home_score : s.away_score;
  const c = isHome ? LED.home : LED.visitor;
  const name = isHome ? s.home_name : s.away_name;
  const inBonus = (isHome ? s.away_fouls : s.home_fouls) >= 5; // opponent at 5 fouls → this team in bonus
  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-3xl font-black uppercase tracking-wide text-white">{isHome ? "HOME" : "VISITOR"}</span>
        {inBonus && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-black uppercase text-white">Bonus</span>}
      </div>
      <span className="clock-digits text-8xl font-black leading-none" style={glow(c)}>{score}</span>
      <span className="mt-1 truncate text-sm font-bold uppercase tracking-wider text-white/45">{name}</span>
      <div className="mt-2 flex gap-1.5">
        <Chip onClick={() => addScore(s, side, -1)}>−1</Chip>
        <Chip onClick={() => scoreFromAction(s, side, "FT_MADE")} tone="go">+1</Chip>
        <Chip onClick={() => scoreFromAction(s, side, "2PT_MADE")} tone="go">+2</Chip>
        <Chip onClick={() => scoreFromAction(s, side, "3PT_MADE")} tone="go">+3</Chip>
      </div>
    </div>
  );
}

/* ---------- SCOREBOARD PJY 2 — Pydjian LED control ---------- */
export function PydjianLedControl({ s }: { s: GameState }) {
  const locked = useLock(s.court_id);
  const [shotLocked, toggleShotLock] = useShotLock(s.court_id);
  const shotOff = locked || shotLocked;
  const sound = useSound(s.court_id);

  return (
    <div className="rounded-2xl border bg-black p-6 text-white">
      <ClockBuzzer s={s} enabled={sound} />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Scoreboard PJY 2 — Control</span>
        <ShotLockToggle on={shotLocked} onClick={toggleShotLock} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-6">
        <LedFouls s={s} side="home" />
        <div className="flex flex-col items-center gap-2">
          <LedGameDigits s={s} />
          <div className="flex flex-wrap justify-center gap-1.5">
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -60)}>−1m</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -10)}>−10s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, -1)}>−1s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 1)}>+1s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 10)}>+10s</Chip>
            <Chip disabled={locked} onClick={() => adjustGameClock(s, 60)}>+1m</Chip>
            <Chip disabled={locked} onClick={() => resetClocksForQuarter(s, !shotLocked)} tone="danger">Reset</Chip>
          </div>
        </div>
        <LedFouls s={s} side="away" />
      </div>

      {/* Scores brought UP to flank the shot clock / quarter / transport (fills the side space). */}
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <LedScore s={s} side="home" />
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <LedShotDigits s={s} />
            <span className="text-base font-black uppercase tracking-[0.3em] text-white/70">Shotclock</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Chip disabled={shotOff} onClick={() => resetShotClock(s, 240)}>24</Chip>
              <Chip disabled={shotOff} onClick={() => resetShotClock(s, 140)}>14</Chip>
              <Chip disabled={shotOff} onClick={() => adjustShotClock(s, -10)}>−1s</Chip>
              <Chip disabled={shotOff} onClick={() => adjustShotClock(s, 10)}>+1s</Chip>
            </div>
            {shotLocked && <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400/80">Shot clock → Ref 2</span>}
          </div>
          <QuarterStrip s={s} />
          <Transport s={s} locked={locked} shotLocked={shotLocked} />
        </div>
        <LedScore s={s} side="away" />
      </div>
    </div>
  );
}
