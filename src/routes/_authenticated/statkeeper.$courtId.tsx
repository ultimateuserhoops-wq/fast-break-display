import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { RosterPanel } from "@/components/RosterPanel";
import { BoxScoreTable } from "@/components/BoxScoreTable";
import { ShotChart, type ShotMarker } from "@/components/ShotChart";
import { useCourtImage } from "@/lib/ads";
import { toast } from "sonner";
import {
  useGameState, useGameEvents, computeGameClockSeconds, formatClock,
  logEvent, removeLastStat, aggregateBoxScore,
  type GameState, type Player,
} from "@/lib/game-state";

const FOUL_OUT = 5;

export const Route = createFileRoute("/_authenticated/statkeeper/$courtId")({
  head: () => ({ meta: [{ title: "Player Stat Keeping — BDC" }] }),
  component: StatKeeper,
});

type Scope = "both" | "home" | "away";
type Active = { side: "home" | "away"; player: Player } | null;

function StatKeeper() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const events = useGameEvents(courtId);
  const [, setNow] = useState(0);
  const [active, setActive] = useState<Active>(null);
  const [pending, setPending] = useState<{ x: number; y: number; three: boolean } | null>(null);
  const [scope, setScope] = useState<Scope>(() => {
    if (typeof window === "undefined") return "both";
    return (localStorage.getItem(`bdc_statscope_${courtId}`) as Scope) || "both";
  });
  function changeScope(v: Scope) {
    setScope(v);
    if (typeof window !== "undefined") localStorage.setItem(`bdc_statscope_${courtId}`, v);
  }

  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  const box = useMemo(() => aggregateBoxScore(events), [events]);
  const activeFouls = active ? (box.get(active.player.id)?.fls ?? 0) : 0;

  const markers: ShotMarker[] = useMemo(() => {
    if (!s) return [];
    return events.flatMap((e) => {
      if (!e.note || !e.event_type.startsWith("2PT") && !e.event_type.startsWith("3PT")) return [];
      try {
        const loc = JSON.parse(e.note);
        if (typeof loc?.x !== "number") return [];
        return [{ x: loc.x, y: loc.y, made: e.event_type.endsWith("_MADE"), color: e.team_side === "home" ? s.home_color : s.away_color }];
      } catch { return []; }
    });
  }, [events, s]);

  if (!s) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <main className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">Loading court…</main>
      </div>
    );
  }

  const meta = (p: Player) => ({ id: p.id, name: p.name, jersey_number: p.jersey_number });
  function flash(label: string, good?: boolean) {
    if (!active) return;
    const who = `#${active.player.jersey_number || "—"} ${active.player.name}`;
    (good ? toast.success : toast)(`${who} — ${label}`, { duration: 1000 });
  }
  // Stat keeping is logging-only — it records events for the box score / FIBA report
  // and NEVER mutates the live game_state (score, team fouls, 3-pt pulse). The
  // scoreboard operator owns the official displayed score.
  async function logFor(type: string, points: number, note?: string) {
    if (!active) return;
    const p = active.player;
    await logEvent(s!, { side: active.side, type, points, playerId: p.id, playerName: p.name, playerNumber: p.jersey_number, note });
  }
  async function commitShot(made: boolean) {
    if (!active) return;
    const three = pending?.three ?? false;
    const type = three ? (made ? "3PT_MADE" : "3PT_MISS") : (made ? "2PT_MADE" : "2PT_MISS");
    await logFor(type, made ? (three ? 3 : 2) : 0, pending ? JSON.stringify({ x: Math.round(pending.x), y: Math.round(pending.y) }) : undefined);
    flash(`${three ? 3 : 2}PT ${made ? "MADE ✓" : "Miss ✗"}`, made);
    setPending(null);
  }
  async function ft(made: boolean) {
    await logFor(made ? "FT_MADE" : "FT_MISS", made ? 1 : 0);
    flash(`Free throw ${made ? "MADE ✓" : "Miss ✗"}`, made);
  }
  async function stat(type: string, label?: string) {
    await logFor(type, 0);
    flash(label ?? type);
  }
  // Personal fouls: log up to FOUL_OUT, then lock the player out; the − removes the latest foul.
  async function foul() {
    if (!active) return;
    if (activeFouls >= FOUL_OUT) { toast.error(`#${active.player.jersey_number || "—"} ${active.player.name} has fouled out`); return; }
    await logFor("FOUL", 0);
    const n = activeFouls + 1;
    if (n >= FOUL_OUT) toast.error(`#${active.player.jersey_number || "—"} ${active.player.name} — FOULED OUT (${n})`);
    else flash(`Foul ${n}/${FOUL_OUT}`);
  }
  async function foulMinus() {
    if (!active || activeFouls <= 0) return;
    const ok = await removeLastStat(courtId, active.player.id, "FOUL");
    if (ok) flash(`Foul removed (${activeFouls - 1}/${FOUL_OUT})`, true);
  }

  const cols = scope === "both" ? "lg:grid-cols-[1fr_1.5fr_1fr]" : scope === "home" ? "lg:grid-cols-[1fr_1.5fr]" : "lg:grid-cols-[1.5fr_1fr]";
  const showHome = scope !== "away";
  const showAway = scope !== "home";

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Stat table</p>
            <h1 className="text-3xl font-black tracking-tight">Player Stat Keeping</h1>
          </div>
          <CourtSelector activeId={courtId} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card px-5 py-3">
          <div className="flex items-center gap-3">
            <Scoreline name={s.home_name} color={s.home_color} score={s.home_score} />
            <span className="text-muted-foreground">vs</span>
            <Scoreline name={s.away_name} color={s.away_color} score={s.away_score} reverse />
          </div>
          <div className="text-center">
            <p className="clock-digits text-2xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(computeGameClockSeconds(s))}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Q{s.quarter}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Keep</span>
            {(["both", "home", "away"] as Scope[]).map((v) => (
              <button key={v} onClick={() => changeScope(v)} className={`rounded-md border px-3 py-1.5 text-xs font-bold ${scope === v ? "bg-foreground text-background" : "hover:bg-secondary"}`}>
                {v === "home" ? s.home_name : v === "away" ? s.away_name : "Both"}
              </button>
            ))}
          </div>
        </div>

        <div className={`mt-5 grid gap-4 ${cols}`}>
          {showHome && (
            <RosterPanel s={s} side="home" activePlayerId={active?.side === "home" ? active.player.id : null} onSelectPlayer={(p) => { setActive(p ? { side: "home", player: p } : null); setPending(null); }} />
          )}
          <CenterPanel s={s} active={active} markers={markers} pending={pending} activeFouls={activeFouls}
            onPick={(loc, three) => setPending({ ...loc, three })}
            onMade={() => commitShot(true)} onMiss={() => commitShot(false)}
            onFt={ft} onStat={stat} onFoul={foul} onFoulMinus={foulMinus} onClear={() => setPending(null)} />
          {showAway && (
            <RosterPanel s={s} side="away" activePlayerId={active?.side === "away" ? active.player.id : null} onSelectPlayer={(p) => { setActive(p ? { side: "away", player: p } : null); setPending(null); }} />
          )}
        </div>

        <div className={`mt-5 grid gap-4 ${showHome && showAway ? "lg:grid-cols-2" : ""}`}>
          {showHome && <BoxScoreTable s={s} side="home" events={events} />}
          {showAway && <BoxScoreTable s={s} side="away" events={events} />}
        </div>
      </main>
    </div>
  );
}

function CenterPanel({
  s, active, markers, pending, activeFouls, onPick, onMade, onMiss, onFt, onStat, onFoul, onFoulMinus, onClear,
}: {
  s: GameState;
  active: Active;
  markers: ShotMarker[];
  pending: { x: number; y: number; three: boolean } | null;
  activeFouls: number;
  onPick: (loc: { x: number; y: number }, three: boolean) => void;
  onMade: () => void;
  onMiss: () => void;
  onFt: (made: boolean) => void;
  onStat: (type: string, label?: string) => void;
  onFoul: () => void;
  onFoulMinus: () => void;
  onClear: () => void;
}) {
  const color = active ? (active.side === "home" ? s.home_color : s.away_color) : "#94a3b8";
  const teamName = active ? (active.side === "home" ? s.home_name : s.away_name) : "";
  const dis = !active;
  const fouledOut = activeFouls >= FOUL_OUT;
  const court = useCourtImage();

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex min-h-[2.75rem] items-center justify-between">
        <div>
          {active ? (
            <p className="text-lg font-black leading-tight">
              <span className="clock-digits mr-1" style={{ color }}>#{active.player.jersey_number || "—"}</span>
              {active.player.name}
              <span className="ml-2 text-[10px] font-bold uppercase text-muted-foreground">{teamName}</span>
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${fouledOut ? "bg-destructive text-destructive-foreground" : "bg-secondary text-muted-foreground"}`}>{fouledOut ? "Fouled out" : `Fouls ${activeFouls}/${FOUL_OUT}`}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Tap a player on either side to start logging.</p>
          )}
          {pending && <p className="text-xs font-black uppercase" style={{ color }}>{pending.three ? "3-POINT" : "2-POINT"} attempt — tap Made or Miss</p>}
        </div>
        {pending && <button onClick={onClear} className="rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary">Clear spot</button>}
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        <ShotChart markers={markers} pending={pending} pendingColor={color} onPick={onPick} bgImage={court} />
      </div>

      {pending ? (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onMade} disabled={dis} className="rounded-xl bg-emerald-600 py-4 text-xl font-black text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40">MADE</button>
          <button onClick={onMiss} disabled={dis} className="rounded-xl bg-rose-600 py-4 text-xl font-black text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-40">MISS</button>
        </div>
      ) : (
        <p className="rounded-lg bg-secondary/50 py-2 text-center text-[11px] text-muted-foreground">
          Tap the shot spot on the court → Made / Miss (2 or 3 detected by location). Or use the buttons below.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Act onClick={() => onFt(true)} disabled={dis} tone="green">FT Made</Act>
        <Act onClick={() => onFt(false)} disabled={dis} tone="red">FT Miss</Act>
        <Act onClick={() => onStat("AST", "Assist")} disabled={dis}>AST</Act>
        <Act onClick={() => onStat("REB", "Off Rebound")} disabled={dis}>OFF REB</Act>
        <Act onClick={() => onStat("REB", "Def Rebound")} disabled={dis}>DEF REB</Act>
        <Act onClick={() => onStat("STL", "Steal")} disabled={dis}>STL</Act>
        <Act onClick={() => onStat("BLK", "Block")} disabled={dis}>BLK</Act>
        <Act onClick={() => onStat("TO", "Turnover")} disabled={dis}>TO</Act>
        <div className="col-span-1 flex items-stretch gap-1.5">
          <button onClick={onFoulMinus} disabled={dis || activeFouls <= 0} title="Remove last foul" className="grid w-10 shrink-0 place-items-center rounded-lg border-2 text-lg font-black transition hover:bg-secondary disabled:opacity-30">−</button>
          <button onClick={onFoul} disabled={dis || fouledOut} title={fouledOut ? "Fouled out" : "Add foul"} className={`flex-1 rounded-lg py-3 text-sm font-black uppercase transition disabled:opacity-40 ${fouledOut ? "bg-destructive text-destructive-foreground" : "border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"}`}>{fouledOut ? "OUT" : "FOUL"}</button>
        </div>
      </div>
    </div>
  );
}

function Act({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "green" | "red" | "foul" }) {
  const cls =
    tone === "green" ? "bg-emerald-600 text-white hover:bg-emerald-500"
    : tone === "red" ? "bg-rose-600 text-white hover:bg-rose-500"
    : tone === "foul" ? "border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
    : "border-2 hover:bg-secondary";
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg py-3 text-sm font-black uppercase transition disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

function Scoreline({ name, color, score, reverse }: { name: string; color: string; score: number; reverse?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="max-w-[11rem] truncate text-sm font-bold uppercase">{name}</span>
      <span className="clock-digits text-2xl font-black" style={{ color }}>{score}</span>
    </div>
  );
}
