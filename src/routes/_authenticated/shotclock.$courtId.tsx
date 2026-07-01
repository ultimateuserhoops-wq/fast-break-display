import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { Maximize, Minimize } from "lucide-react";
import {
  useGameState, useSmoothShotTenths, formatShotClock,
  startShotClock, pauseShotClock, resetShotClock, adjustShotClock, buzzer,
} from "@/lib/game-state";
import { ClockBuzzer } from "@/components/Buzzer";
import { PossessionButtonsLight } from "@/components/Possession";

export const Route = createFileRoute("/_authenticated/shotclock/$courtId")({
  head: () => ({ meta: [{ title: "Shot Clock — BDC" }] }),
  component: ShotClockOnly,
});

// A shot-clock-ONLY control for a second official (Ref 2). Ref 1 runs score + game clock on the
// scoreboard panel (with "Lock shot clock" on); Ref 2 runs just the shot clock from here. Both
// write to the same shared game state, so every display + the control panel mirror it instantly.
function ShotClockOnly() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const shot = useSmoothShotTenths(s);
  const sound = typeof window === "undefined" ? true : localStorage.getItem(`bdc_buzzer_${courtId}`) !== "0";

  const fsRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    if (presenting && fsRef.current && !document.fullscreenElement) fsRef.current.requestFullscreen?.().catch(() => {});
  }, [presenting]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const exitPresent = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setPresenting(false); };

  // Space / R hotkeys: start-stop / reset 24 — the two actions a shot-clock operator needs.
  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === " ") { e.preventDefault(); s.shot_clock_running ? pauseShotClock(s) : startShotClock(s); }
      else if (e.key.toLowerCase() === "r") { e.preventDefault(); resetShotClock(s, 240); }
      else if (e.key.toLowerCase() === "f") { e.preventDefault(); resetShotClock(s, 140); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  if (!s) {
    return (<div className="min-h-screen bg-background"><TopNav /><main className="p-8 text-sm">Loading…</main></div>);
  }
  const running = s.shot_clock_running;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <ClockBuzzer s={s} enabled={sound} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Shot Clock</h1>
            <p className="text-xs text-muted-foreground">Ref 2 control — runs only the shot clock. Score &amp; game clock stay with Ref 1 (turn on “Lock shot clock” on their panel).</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPresenting(true)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-secondary" title="Show full-screen — press Esc to exit">
              <Maximize className="h-3.5 w-3.5" /> Fullscreen
            </button>
            <CourtSelector activeId={courtId} />
          </div>
        </div>

        <div className="mt-6 rounded-3xl border bg-card p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Shot Clock · {s.tournament_name || courtId}</p>
          <p className="clock-digits my-4 text-[12rem] font-black leading-none" style={{ color: "var(--red-shot)" }}>{formatShotClock(shot)}</p>

          <button
            onClick={() => (running ? pauseShotClock(s) : startShotClock(s))}
            className={`w-full rounded-2xl py-6 text-2xl font-black tracking-wide ${running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"}`}
          >
            {running ? "■  STOP SHOT" : "▶  START SHOT"}
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Btn onClick={() => resetShotClock(s, 240)} big>24</Btn>
            <Btn onClick={() => resetShotClock(s, 140)} big>14</Btn>
            <Btn onClick={() => adjustShotClock(s, 10)}>+1s</Btn>
            <Btn onClick={() => adjustShotClock(s, -10)}>-1s</Btn>
          </div>

          <button onClick={() => buzzer(s)} className="mt-4 w-full rounded-xl bg-destructive py-3 text-sm font-bold text-destructive-foreground">BUZZER</button>

          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Possession / held-ball arrow</p>
            <PossessionButtonsLight s={s} className="justify-center" />
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">Keys: <kbd className="rounded bg-secondary px-1 font-mono">Space</kbd> start/stop · <kbd className="rounded bg-secondary px-1 font-mono">R</kbd> reset 24 · <kbd className="rounded bg-secondary px-1 font-mono">F</kbd> reset 14</p>
        </div>
      </main>

      {presenting && (
        <div ref={fsRef} className="fixed inset-0 z-[100] flex flex-col items-center justify-center" style={{ background: "radial-gradient(circle at 50% 40%, #161b22 0%, #000 72%)" }}>
          <p className="font-bold uppercase tracking-[0.4em] text-white/35" style={{ fontSize: "2.2vh" }}>Shot Clock</p>
          <p className="clock-digits font-black leading-none" style={{ color: "var(--red-shot)", fontSize: "min(70vh, 80vw)", textShadow: "0 0 80px rgba(220,40,40,0.5)" }}>{formatShotClock(shot)}</p>
          <button onClick={exitPresent} className="absolute right-6 top-6 flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10">
            <Minimize className="h-3.5 w-3.5" /> Exit (Esc)
          </button>
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, big }: { children: React.ReactNode; onClick: () => void; big?: boolean }) {
  return <button onClick={onClick} className={`rounded-md border font-semibold hover:bg-secondary ${big ? "py-3 text-lg font-black" : "py-2 text-sm"}`}>{children}</button>;
}
