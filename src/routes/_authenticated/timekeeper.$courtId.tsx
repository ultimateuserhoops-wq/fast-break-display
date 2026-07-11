import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { Maximize, SplitSquareHorizontal } from "lucide-react";
import { FullscreenClocks } from "@/components/FullscreenClocks";
import {
  useGameState, useSmoothGameClock, useSmoothShotTenths, serverNow,
  formatClock, formatShotClock,
  adjustGameClock, startShotClock, pauseShotClock, resetShotClock, adjustShotClock,
  startBothClocks, pauseBothClocks, buzzer, resetClocksForQuarter, isShotLocked,
  type GameState,
} from "@/lib/game-state";
import { setBreak, useBreak, type BreakState } from "@/lib/ads";
import { loadHotkeys, useScoreboardHotkeys, loadSplitClock, saveSplitClock } from "@/lib/hotkeys";

export const Route = createFileRoute("/_authenticated/timekeeper/$courtId")({
  head: () => ({ meta: [{ title: "Time Keeper — BDC" }] }),
  component: TimeKeeper,
});

function nowIso() { return new Date(serverNow()).toISOString(); }

function TimeKeeper() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const gameClock = useSmoothGameClock(s);   // live (no display delay) — matches court control exactly
  const shotTenths = useSmoothShotTenths(s);
  // Same macropad/keyboard hotkeys as the Court Control panel, using the bindings saved on this
  // device — so a scorer's-table keypad drives the clock (and split-clock mode) here too.
  const [hotkeys] = useState(loadHotkeys);
  useScoreboardHotkeys(s, hotkeys);
  // Split-clock toggle: when on, Space runs the GAME clock and A runs the SHOT clock (two operators).
  const [split, setSplit] = useState(() => loadSplitClock(courtId));
  const toggleSplit = () => setSplit((v) => { const n = !v; saveSplitClock(courtId, n); return n; });
  useEffect(() => { setSplit(loadSplitClock(courtId)); }, [courtId]); // reflect the new court's setting after a court switch

  // Full-screen, chrome-free clock view (game on top, big shot below) for the scorer's table.
  const fsRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    if (presenting && fsRef.current && !document.fullscreenElement) fsRef.current.requestFullscreen?.().catch(() => { /* overlay still covers the screen */ });
  }, [presenting]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const exitPresent = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setPresenting(false); };

  if (!s) {
    return (<div className="min-h-screen bg-background"><TopNav /><main className="p-8 text-sm">Loading…</main></div>);
  }

  const running = s.game_clock_running;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Time Keeper</h1>
            <p className="text-xs text-muted-foreground">Controls the clock for this court — the court control panel mirrors every change instantly.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSplit}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${split ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : "hover:bg-secondary"}`}
              title={split ? "Split clocks ON — the SPACE key runs the game clock and A runs the shot clock. Click to control both together again." : "Split the clocks for two operators — the SPACE key runs the game clock, A runs the shot clock."}
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" /> {split ? "Split: Space = game · A = shot" : "Split clocks"}
            </button>
            <button
              onClick={() => setPresenting(true)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-secondary"
              title="Show the clock full-screen (no browser toolbars) — press Esc to exit"
            >
              <Maximize className="h-3.5 w-3.5" /> Fullscreen
            </button>
            <CourtSelector activeId={courtId} />
          </div>
        </div>

        {split && (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">
            Split clocks on · keyboard: <kbd className="rounded bg-emerald-500/20 px-1 font-mono">Space</kbd> = game clock · <kbd className="rounded bg-emerald-500/20 px-1 font-mono">A</kbd> = shot clock. The buttons below still run both together.
          </p>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Game Clock</p>
            <p className="clock-digits my-4 text-[8rem] font-black leading-none" style={{ color: "var(--amber-clock)" }}>
              {formatClock(gameClock)}
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <Btn onClick={() => adjustGameClock(s, 60)}>+1m</Btn>
              <Btn onClick={() => adjustGameClock(s, 10)}>+10s</Btn>
              <Btn onClick={() => adjustGameClock(s, -10)}>-10s</Btn>
              <Btn onClick={() => adjustGameClock(s, -60)}>-1m</Btn>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Shot Clock</p>
            <p className="clock-digits my-4 text-[8rem] font-black leading-none" style={{ color: "var(--red-shot)" }}>
              {formatShotClock(shotTenths)}
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <Btn onClick={() => resetShotClock(s, 240)}>24</Btn>
              <Btn onClick={() => resetShotClock(s, 140)}>14</Btn>
              <Btn onClick={() => adjustShotClock(s, 50)}>+5s</Btn>
              <Btn onClick={() => adjustShotClock(s, -10)}>-1s</Btn>
            </div>
            <button
              onClick={() => (s.shot_clock_running ? pauseShotClock(s) : startShotClock(s))}
              className={`mt-4 w-full rounded-xl py-3 text-sm font-bold ${s.shot_clock_running ? "border-2 border-destructive text-destructive" : "border-2"}`}
            >
              {s.shot_clock_running ? "Pause Shot Only" : "Start Shot Only"}
            </button>
          </div>
        </div>

        {/* Combined control — game + shot run together */}
        <button
          onClick={() => (running ? pauseBothClocks(s) : startBothClocks(s))}
          className={`mt-6 w-full rounded-2xl py-6 text-2xl font-black tracking-wide ${running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"}`}
        >
          {running ? "■  STOP — GAME + SHOT" : "▶  START — GAME + SHOT"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Runs both clocks together. Use “Pause Shot Only” to stop just the shot clock (the game clock keeps running).
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button onClick={() => buzzer(s)} className="rounded-xl bg-destructive px-6 py-3 text-sm font-bold text-destructive-foreground">BUZZER</button>
          <button onClick={() => resetClocksForQuarter(s, !isShotLocked(s.court_id))} className="rounded-xl border px-6 py-3 text-sm font-bold hover:bg-secondary">Reset clocks for quarter</button>
        </div>

        <BreakControls courtId={courtId} s={s} />
      </main>

      {presenting && (
        <FullscreenClocks fsRef={fsRef} s={s} gameClock={gameClock} shotTenths={shotTenths} onExit={exitPresent} />
      )}
    </div>
  );
}

function breakRemaining(b: BreakState): number {
  if (b.running && b.started_at) return Math.max(0, b.seconds - (serverNow() - new Date(b.started_at).getTime()) / 1000);
  return Math.max(0, b.seconds);
}

const PRESETS: Array<{ label: string; seconds: number; text: string }> = [
  { label: "TIME OUT", seconds: 60, text: "Time-out 1:00" },
  { label: "TIME OUT", seconds: 30, text: "Time-out 0:30" },
  { label: "HALF TIME", seconds: 600, text: "Half-time 10:00" },
  { label: "BREAK", seconds: 120, text: "Quarter break 2:00" },
];

function BreakControls({ courtId, s }: { courtId: string; s: GameState }) {
  const brk = useBreak(courtId);
  const [label, setLabel] = useState("TIME OUT");
  const [mins, setMins] = useState("1");
  const [secs, setSecs] = useState("00");
  const [, tick] = useState(0);

  // keep the live preview ticking even when the game clock is stopped
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  function startBreak(lbl: string, seconds: number) {
    setBreak(courtId, { show: true, running: true, started_at: nowIso(), seconds, label: lbl }).catch(() => {});
  }
  function startCustom() {
    const total = Math.max(0, (parseInt(mins || "0", 10) || 0) * 60 + (parseInt(secs || "0", 10) || 0));
    if (total > 0) startBreak(label.trim().toUpperCase() || "BREAK", total);
  }
  function toggleShow() {
    if (!brk) return;
    setBreak(courtId, { ...stripTs(brk), show: !brk.show }).catch(() => {});
  }
  function pauseResume() {
    if (!brk) return;
    if (brk.running) setBreak(courtId, { ...stripTs(brk), running: false, started_at: null, seconds: breakRemaining(brk) }).catch(() => {});
    else setBreak(courtId, { ...stripTs(brk), running: true, started_at: nowIso() }).catch(() => {});
  }
  function stopBreak() {
    setBreak(courtId, { show: false, running: false, started_at: null, seconds: 0, label: brk?.label || "" }).catch(() => {});
  }

  const active = !!brk && (brk.show || brk.running);

  return (
    <div className="mt-8 rounded-2xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider">Break / Interval timer</h2>
        {brk?.show && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">On display</span>}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Countdown shown full-screen on the OBS Timer display — for time-outs, half-time, or before tip-off.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.text} onClick={() => startBreak(p.label, p.seconds)} className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-secondary">
            {p.text}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-40 rounded-md border bg-background px-2 py-1.5 text-sm font-semibold" />
        </label>
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Min
          <input value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} className="mt-1 w-16 rounded-md border bg-background px-2 py-1.5 text-center text-sm font-semibold" />
        </label>
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Sec
          <input value={secs} onChange={(e) => setSecs(e.target.value.replace(/\D/g, ""))} className="mt-1 w-16 rounded-md border bg-background px-2 py-1.5 text-center text-sm font-semibold" />
        </label>
        <button onClick={startCustom} className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background">Start &amp; show</button>
      </div>

      {active && brk && (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border bg-background p-4">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{brk.label}</p>
            <p className="clock-digits text-4xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(breakRemaining(brk))}</p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={pauseResume} className="rounded-lg border px-4 py-2 text-xs font-bold hover:bg-secondary">{brk.running ? "Pause" : "Resume"}</button>
            <button onClick={toggleShow} className="rounded-lg border px-4 py-2 text-xs font-bold hover:bg-secondary">{brk.show ? "Hide from display" : "Show on display"}</button>
            <button onClick={stopBreak} className="rounded-lg border-2 border-destructive px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground">Stop break</button>
          </div>
        </div>
      )}
    </div>
  );
}

function stripTs(b: BreakState): Omit<BreakState, "ts"> {
  const { ts: _ts, ...rest } = b;
  return rest;
}

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-md border px-3 py-1.5 font-semibold hover:bg-secondary">{children}</button>;
}
