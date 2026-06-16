import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { ScoreBox } from "@/components/ScoreBox";
import {
  useGameState, computeGameClockSeconds, computeShotClockTenths,
  formatClock, formatShotClock,
  addScore, resetScore, addFoul, addTimeout,
  startGameClock, pauseGameClock, adjustGameClock,
  startShotClock, pauseShotClock, resetShotClock, adjustShotClock,
  setQuarter, resetClocksForQuarter, buzzer, patchGameState, logEvent,
} from "@/lib/game-state";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scoreboard/$courtId")({
  head: () => ({ meta: [{ title: "Court control — BDC" }] }),
  component: CourtControl,
});

function CourtControl() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const [, setNow] = useState(0);
  const [threeHomePulse, setThreeHomePulse] = useState(0);
  const [threeAwayPulse, setThreeAwayPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!s) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <main className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">Loading court…</main>
      </div>
    );
  }

  const gameClock = computeGameClockSeconds(s);
  const shotTenths = computeShotClockTenths(s);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{s.mode.toUpperCase()} MODE</p>
            <h1 className="text-3xl font-black tracking-tight">Court Control</h1>
          </div>
          <CourtSelector activeId={courtId} />
        </div>

        <TournamentBar s={s} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <ClockBar s={s} gameClock={gameClock} shotTenths={shotTenths} />
            <div className="grid gap-6 md:grid-cols-2">
              <TeamPanel
                side="home"
                s={s}
                onThree={() => setThreeHomePulse((n) => n + 1)}
                threePulse={threeHomePulse}
              />
              <TeamPanel
                side="away"
                s={s}
                onThree={() => setThreeAwayPulse((n) => n + 1)}
                threePulse={threeAwayPulse}
              />
            </div>
          </div>
          <Sidebar s={s} />
        </div>
      </main>
    </div>
  );
}

function TournamentBar({ s }: { s: ReturnType<typeof useGameState> & {} }) {
  if (!s) return null;
  const [name, setName] = useState(s.tournament_name);
  useEffect(() => setName(s.tournament_name), [s.tournament_name]);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tournament</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== s.tournament_name && patchGameState(s.court_id, { tournament_name: name })}
        className="min-w-[260px] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm font-semibold"
      />
      <div className="flex items-center gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Q</span>
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => setQuarter(s, q)}
            className={`grid h-8 w-8 place-items-center rounded-md border text-sm font-bold ${s.quarter === q ? "bg-foreground text-background" : "hover:bg-secondary"}`}
          >
            {q}
          </button>
        ))}
        <button onClick={() => resetClocksForQuarter(s)} className="ml-2 rounded-md border px-2 py-1 text-xs font-medium hover:bg-secondary">
          Reset clocks
        </button>
      </div>
    </div>
  );
}

function ClockBar({ s, gameClock, shotTenths }: { s: NonNullable<ReturnType<typeof useGameState>>; gameClock: number; shotTenths: number }) {
  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-5 md:grid-cols-[1fr_1fr_auto]">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Game Clock</p>
        <p className="clock-digits mt-1 text-6xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(gameClock)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <ClockBtn onClick={() => adjustGameClock(s, 60)}>+1m</ClockBtn>
          <ClockBtn onClick={() => adjustGameClock(s, 10)}>+10s</ClockBtn>
          <ClockBtn onClick={() => adjustGameClock(s, -10)}>-10s</ClockBtn>
          <ClockBtn onClick={() => adjustGameClock(s, -60)}>-1m</ClockBtn>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Shot Clock</p>
        <p className="clock-digits mt-1 text-6xl font-black" style={{ color: "var(--red-shot)" }}>{formatShotClock(shotTenths)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <ClockBtn onClick={() => resetShotClock(s, 240)}>24</ClockBtn>
          <ClockBtn onClick={() => resetShotClock(s, 140)}>14</ClockBtn>
          <ClockBtn onClick={() => adjustShotClock(s, 50)}>+5s</ClockBtn>
          <ClockBtn onClick={() => adjustShotClock(s, -10)}>-1s</ClockBtn>
        </div>
      </div>
      <div className="flex flex-col items-stretch justify-center gap-2">
        <button
          onClick={() => (s.game_clock_running ? pauseGameClock(s) : startGameClock(s))}
          className={`rounded-xl px-5 py-3 text-sm font-bold ${s.game_clock_running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"}`}
        >
          {s.game_clock_running ? "Pause Game" : "Start Game"}
        </button>
        <button
          onClick={() => (s.shot_clock_running ? pauseShotClock(s) : startShotClock(s))}
          className={`rounded-xl border px-5 py-2 text-xs font-bold ${s.shot_clock_running ? "border-destructive text-destructive" : ""}`}
        >
          {s.shot_clock_running ? "Pause Shot" : "Start Shot"}
        </button>
        <button onClick={() => buzzer(s)} className="rounded-xl bg-destructive py-2 text-xs font-bold text-destructive-foreground">
          BUZZER
        </button>
      </div>
    </div>
  );
}

function ClockBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md border px-2.5 py-1 font-semibold hover:bg-secondary">
      {children}
    </button>
  );
}

function TeamPanel({
  side, s, onThree, threePulse,
}: {
  side: "home" | "away";
  s: NonNullable<ReturnType<typeof useGameState>>;
  onThree: () => void;
  threePulse: number;
}) {
  const isHome = side === "home";
  const name = isHome ? s.home_name : s.away_name;
  const color = isHome ? s.home_color : s.away_color;
  const score = isHome ? s.home_score : s.away_score;
  const fouls = isHome ? s.home_fouls : s.away_fouls;
  const timeouts = isHome ? s.home_timeouts : s.away_timeouts;
  const opponentFouls = isHome ? s.away_fouls : s.home_fouls;
  const inBonus = opponentFouls >= 5;

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [colorInput, setColorInput] = useState(color);
  useEffect(() => { setNameInput(name); setColorInput(color); }, [name, color]);

  async function saveTeam() {
    if (isHome) await patchGameState(s.court_id, { home_name: nameInput, home_color: colorInput });
    else await patchGameState(s.court_id, { away_name: nameInput, away_color: colorInput });
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{isHome ? "HOME" : "AWAY"}</p>
          {editing ? (
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="mt-1 rounded-md border bg-background px-2 py-1 text-xl font-bold"
            />
          ) : (
            <h3 className="text-2xl font-black" style={{ color }}>{name}</h3>
          )}
          {inBonus && <span className="mt-1 inline-block rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase text-destructive-foreground">Bonus</span>}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <input type="color" value={colorInput} onChange={(e) => setColorInput(e.target.value)} className="h-9 w-12 rounded-md border" />
              <button onClick={saveTeam} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-bold text-background">Save</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Edit</button>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <ScoreBox score={score} color={color} threePulse={threePulse} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <ScoreBtn label="+3" onClick={() => { addScore(s, side, 3); onThree(); logEvent(s, { side, type: "3PT_MADE", points: 3 }); }} accent={color} />
        <ScoreBtn label="+2" onClick={() => { addScore(s, side, 2); logEvent(s, { side, type: "2PT_MADE", points: 2 }); }} accent={color} />
        <ScoreBtn label="+1" onClick={() => { addScore(s, side, 1); logEvent(s, { side, type: "FT_MADE", points: 1 }); }} accent={color} />
        <ScoreBtn label="-1" onClick={() => { addScore(s, side, -1); logEvent(s, { side, type: "ADJUST", points: -1 }); }} />
        <ScoreBtn label="-2" onClick={() => { addScore(s, side, -2); logEvent(s, { side, type: "ADJUST", points: -2 }); }} />
        <ScoreBtn label="RST" onClick={() => { if (confirm(`Reset ${name}'s score to 0?`)) resetScore(s, side); }} danger />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatStepper label="Fouls" value={fouls} max={5} onAdd={() => { addFoul(s, side, 1); logEvent(s, { side, type: "FOUL" }); }} onSub={() => addFoul(s, side, -1)} />
        <StatStepper label="Timeouts" value={timeouts} onAdd={() => addTimeout(s, side, 1)} onSub={() => { addTimeout(s, side, -1); logEvent(s, { side, type: "TIMEOUT" }); }} />
      </div>
    </div>
  );
}

function ScoreBtn({ label, onClick, accent, danger }: { label: string; onClick: () => void; accent?: string; danger?: boolean }) {
  const style = accent ? { background: accent, color: "white" } : undefined;
  const cls = danger
    ? "rounded-lg border-2 border-destructive py-3 font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground"
    : accent
      ? "rounded-lg py-3 font-bold shadow-sm hover:opacity-90"
      : "rounded-lg border-2 py-3 font-bold hover:bg-secondary";
  return <button onClick={onClick} className={cls} style={style}>{label}</button>;
}

function StatStepper({ label, value, max, onAdd, onSub }: { label: string; value: number; max?: number; onAdd: () => void; onSub: () => void }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}{max ? ` (max ${max})` : ""}</p>
      <div className="mt-1 flex items-center justify-between">
        <button onClick={onSub} className="grid h-8 w-8 place-items-center rounded-md border font-bold hover:bg-secondary">−</button>
        <span className="clock-digits text-3xl font-black">{value}</span>
        <button onClick={onAdd} className="grid h-8 w-8 place-items-center rounded-md border font-bold hover:bg-secondary">+</button>
      </div>
    </div>
  );
}

function Sidebar({ s }: { s: NonNullable<ReturnType<typeof useGameState>> }) {
  const obsLinks = useMemo(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return [
      { label: "OBS Timer", path: `${base}/obs/timer/${s.court_id}` },
      { label: "OBS Display 1 (Arena)", path: `${base}/obs/display1/${s.court_id}` },
      { label: "OBS Display 2 (Scorebug)", path: `${base}/obs/display2/${s.court_id}` },
    ];
  }, [s.court_id]);

  function copy(u: string) { navigator.clipboard.writeText(u); toast.success("Copied OBS URL"); }

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Display style</p>
        <div className="mt-3 space-y-2 text-xs">
          <StyleRow label="Timer" value={s.timer_style} options={[["rectangular","Rectangular"],["round","Round"]]} onChange={(v) => patchGameState(s.court_id, { timer_style: v })} />
          <StyleRow label="Display 1" value={s.display_style_1} options={[["katigo","Katigo"],["arena","Arena Board"],["led","Arena LED"]]} onChange={(v) => patchGameState(s.court_id, { display_style_1: v })} />
          <StyleRow label="Display 2" value={s.display_style_2} options={[["espn1","ESPN 1"],["espn2","ESPN 2"],["nba","NBA"]]} onChange={(v) => patchGameState(s.court_id, { display_style_2: v })} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">OBS Browser Sources</p>
        <ul className="mt-3 space-y-2 text-xs">
          {obsLinks.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span className="w-24 font-semibold">{l.label}</span>
              <code className="flex-1 truncate rounded bg-secondary px-2 py-1 text-[10px]">{l.path}</code>
              <button onClick={() => copy(l.path)} className="rounded-md border p-1.5 hover:bg-secondary"><Copy className="h-3 w-3" /></button>
              <a href={l.path} target="_blank" rel="noopener noreferrer" className="rounded-md border px-2 py-1 font-medium hover:bg-secondary">Open</a>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Quick links</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Link to="/timekeeper/$courtId" params={{ courtId: s.court_id }} className="rounded-md border px-3 py-2 text-center font-semibold hover:bg-secondary">Time Keeper</Link>
          <Link to="/teams" className="rounded-md border px-3 py-2 text-center font-semibold hover:bg-secondary">Teams</Link>
        </div>
      </div>
    </aside>
  );
}

function StyleRow({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${value === val ? "bg-foreground text-background" : "hover:bg-secondary"}`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
