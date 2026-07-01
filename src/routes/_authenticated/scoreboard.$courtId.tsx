import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Lock, Unlock, Volume2, VolumeX, Undo2, Maximize, Keyboard, ClipboardList, Zap } from "lucide-react";
import { FullscreenClocks } from "@/components/FullscreenClocks";
import { TopNav } from "@/components/Nav";
import { ClockBuzzer } from "@/components/Buzzer";
import { saveGame, gameHasResult } from "@/lib/games";
import { toast } from "sonner";
import { nonWhite, contrastText } from "@/lib/color";
import { ControlBar } from "@/components/ControlBar";
import { CourtSelector } from "@/components/CourtSelector";
import { ScoreBox } from "@/components/ScoreBox";
import { RosterPanel } from "@/components/RosterPanel";
import { ShotPopup } from "@/components/ShotPopup";
import { BoxScoreTable } from "@/components/BoxScoreTable";
import { LiveFixturePanel } from "@/components/LiveFixturePanel";
import { Standard3Control } from "@/components/Standard3Control";
import { PossessionButtonsLight } from "@/components/Possession";
import { ExtendDisplayButton } from "@/components/ExtendDisplayButton";
import { supabase } from "@/integrations/supabase/client";
import bdseaEventLogo from "@/assets/bdsea-event-logo.png";

const SB_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || "";
import {
  useGameState, useGameEvents,
  useSmoothGameClock, useSmoothShotTenths,
  formatClock, formatShotClock, computeGameClockSeconds,
  addScore, resetScore, addFoul, addTimeout, timeoutMaxForQuarter,
  startGameClock, pauseGameClock, adjustGameClock, startBothClocks, pauseBothClocks,
  startShotClock, pauseShotClock, resetShotClock, adjustShotClock,
  setQuarter, advanceQuarter, handlePeriodExpiry, resetClocksForQuarter, isShotLocked,
  startNewGame, buzzer, patchGameState, undoLast,
  scoreFromAction, logPlayerStat,
  type Player, type GameState,
} from "@/lib/game-state";

export const Route = createFileRoute("/_authenticated/scoreboard/$courtId")({
  head: () => ({ meta: [{ title: "Court control — BDC" }] }),
  component: CourtControl,
});

function CourtControl() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const events = useGameEvents(courtId);
  const [popup, setPopup] = useState<{ side: "home" | "away"; player: Player } | null>(null);
  const [hotkeys, setHotkeys] = useState<Record<HotAction, string>>(loadHotkeys);
  // Made/Miss tracking (per device). On = tapping a player opens the full Made/Miss FIBA popup;
  // off = quick made-only score (no miss step). Optional so a lone operator can score fast.
  const [madeMiss, setMadeMiss] = useState(() => loadMadeMiss(courtId));
  const toggleMadeMiss = () => setMadeMiss((v) => { const next = !v; saveMadeMiss(courtId, next); return next; });
  const [controlStyle, setControlStyle] = useState<ControlStyle>(() => loadControlStyle(courtId));
  const pickControlStyle = (v: ControlStyle) => { setControlStyle(v); saveControlStyle(courtId, v); };
  const isStandard3 = controlStyle === "standard3";
  const noRosters = isStandard3;
  usePeriodExpiry(s);
  useScoreboardHotkeys(s, hotkeys);

  if (!s) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <main className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">Loading court…</main>
      </div>
    );
  }

  const isFull = s.mode === "full";

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <ControlBar s={s} />
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{s.mode.toUpperCase()} MODE</p>
            <h1 className="text-3xl font-black tracking-tight">Court Control</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border p-0.5" title="Control-panel layout for this device — Standard 3 is the Pydjian-style board (default); Standard has full player rosters for per-player Made/Miss entry.">
              {CONTROL_STYLES.map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => pickControlStyle(val)}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${controlStyle === val ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <ExtendDisplayButton courtId={courtId} />
            {!noRosters && (
              <button
                onClick={toggleMadeMiss}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${madeMiss ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : "text-muted-foreground hover:bg-secondary"}`}
                title={madeMiss ? "Made/Miss tracking ON — tapping a player asks Made or Miss (full FIBA box score). Click for quick scoring." : "Made/Miss tracking OFF — tapping a player scores instantly (made only, no miss tracking). Click to track Made/Miss."}
              >
                {madeMiss ? <ClipboardList className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                {madeMiss ? "Made/Miss: on" : "Made/Miss: off"}
              </button>
            )}
            <ScoreboardToolbar courtId={courtId} hotkeys={hotkeys} onChange={(hk) => { setHotkeys(hk); saveHotkeys(hk); }} />
            <CourtSelector activeId={courtId} />
          </div>
        </div>

        {/* Add game — pick/bind the fixture for this court. Sits at the top of the console. */}
        <div className="mt-5">
          <LiveFixturePanel s={s} />
        </div>

        <TournamentBar s={s} />

        {isStandard3 ? (
          /* Standard 3 — Pydjian PRO look; self-contained clocks + score + fouls + timeouts. (Default) */
          <div className="mt-6">
            <Standard3Control s={s} />
          </div>
        ) : (
          /* Standard — team scores spread to the left/right sides; player rosters drop below
             for per-player Made/Miss entry (feeds the FIBA report). */
          <>
            {/* Timer + shot-clock control on top (full width). */}
            <div className="mt-5">
              <ClockBar s={s} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <TeamPanel side="home" s={s} />
              <TeamPanel side="away" s={s} />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <RosterPanel
                s={s}
                side="home"
                activePlayerId={popup?.side === "home" ? popup.player.id : null}
                onSelectPlayer={(p) => p && setPopup({ side: "home", player: p })}
              />
              <RosterPanel
                s={s}
                side="away"
                activePlayerId={popup?.side === "away" ? popup.player.id : null}
                onSelectPlayer={(p) => p && setPopup({ side: "away", player: p })}
              />
            </div>
          </>
        )}

        {isFull && !noRosters && (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <BoxScoreTable s={s} side="home" events={events} />
            <BoxScoreTable s={s} side="away" events={events} />
          </div>
        )}

        {popup && !noRosters && <ShotPopup s={s} side={popup.side} player={popup.player} tracksMisses={madeMiss} onClose={() => setPopup(null)} />}
      </main>
    </div>
  );
}


const timerLocked = (courtId: string) => typeof window !== "undefined" && localStorage.getItem(`bdc_timerlock_${courtId}`) === "1";

/* ---------- Operator hotkeys (rebindable, saved per device) ---------- */
type HotAction = "shotToggle" | "reset24" | "reset14" | "shotPlus" | "shotMinus" | "buzzer" | "sync" | "unsync" | "prevQ" | "nextQ";
const HOTKEY_DEFAULTS: Record<HotAction, string> = {
  shotToggle: " ", reset24: "r", reset14: "f", shotPlus: "ArrowUp", shotMinus: "ArrowDown",
  buzzer: "b", sync: "s", unsync: "u", prevQ: "[", nextQ: "]",
};
const HOTKEY_LABELS: Record<HotAction, string> = {
  shotToggle: "Start / Pause both clocks", reset24: "Reset 24s", reset14: "Reset 14s",
  shotPlus: "Shot clock +1s", shotMinus: "Shot clock −1s", buzzer: "Buzzer",
  sync: "Sync (run both clocks)", unsync: "Unsync (stop shot clock)", prevQ: "Previous quarter", nextQ: "Next quarter",
};
const HOTKEY_ACTIONS = Object.keys(HOTKEY_DEFAULTS) as HotAction[];
const HOTKEYS_LS = "bdc_hotkeys";
function loadHotkeys(): Record<HotAction, string> {
  if (typeof window === "undefined") return { ...HOTKEY_DEFAULTS };
  try { return { ...HOTKEY_DEFAULTS, ...JSON.parse(localStorage.getItem(HOTKEYS_LS) || "{}") }; } catch { return { ...HOTKEY_DEFAULTS }; }
}
function saveHotkeys(map: Record<HotAction, string>) { try { localStorage.setItem(HOTKEYS_LS, JSON.stringify(map)); } catch { /* ignore */ } }
const MADEMISS_LS = (courtId: string) => `bdc_mademiss_${courtId}`;
function loadMadeMiss(courtId: string): boolean { return typeof window === "undefined" ? true : localStorage.getItem(MADEMISS_LS(courtId)) !== "0"; }
function saveMadeMiss(courtId: string, on: boolean) { try { localStorage.setItem(MADEMISS_LS(courtId), on ? "1" : "0"); } catch { /* ignore */ } }

// Control-panel layout (per device): "Standard 3" — the Pydjian-style board — is the default;
// "Standard" is the full panel with player rosters for per-player Made/Miss entry.
// Both drive the same shared game state.
type ControlStyle = "standard" | "standard3";
const CTRLSTYLE_LS = (courtId: string) => `bdc_ctrlstyle_${courtId}`;
function loadControlStyle(courtId: string): ControlStyle {
  if (typeof window === "undefined") return "standard3";
  return localStorage.getItem(CTRLSTYLE_LS(courtId)) === "standard" ? "standard" : "standard3";
}
function saveControlStyle(courtId: string, v: ControlStyle) { try { localStorage.setItem(CTRLSTYLE_LS(courtId), v); } catch { /* ignore */ } }
const CONTROL_STYLES: [ControlStyle, string][] = [["standard3", "Standard 3"], ["standard", "Standard"]];
function keyLabel(k: string): string {
  if (k === " ") return "Space";
  if (k === "ArrowUp") return "↑"; if (k === "ArrowDown") return "↓"; if (k === "ArrowLeft") return "←"; if (k === "ArrowRight") return "→";
  return k.length === 1 ? k.toUpperCase() : k;
}
const keyMatches = (cfg: string, ev: string) => !!cfg && (cfg === ev || (cfg.length === 1 && ev.length === 1 && cfg.toLowerCase() === ev.toLowerCase()));

// Auto-advance the period when the game clock hits 0: next quarter, or a fresh overtime when
// the score is tied at the end of Q4 / an OT, otherwise the game ends. Fires once per expiry.
function usePeriodExpiry(s: GameState | null) {
  const handled = useRef(false);
  const sRef = useRef(s); sRef.current = s;
  useEffect(() => {
    const id = setInterval(() => {
      const cur = sRef.current;
      if (!cur) return;
      const remaining = computeGameClockSeconds(cur);
      if (!cur.game_clock_running || remaining > 0.05) { if (remaining > 0.05) handled.current = false; return; }
      if (handled.current) return;
      handled.current = true;
      handlePeriodExpiry(cur).then((r) => {
        if (r === "overtime") toast.message("Scores tied — overtime started");
        else if (r === "final") toast.success("Final — clock expired");
        else toast.message(`Quarter ${cur.quarter} over — on to Q${cur.quarter + 1}`);
      }).catch(() => {});
    }, 200);
    return () => clearInterval(id);
  }, []);
}

// Broadcast-style keyboard shortcuts for the operator (mirrors the printed shortcut card).
// Ignored while typing in a field; clock keys are disabled while the timer is locked.
function useScoreboardHotkeys(s: GameState | null, hotkeys: Record<HotAction, string>) {
  const sRef = useRef(s); sRef.current = s;
  const hkRef = useRef(hotkeys); hkRef.current = hotkeys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = sRef.current; if (!cur) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoLast(cur.court_id).then((l) => l && toast.message(`Undid ${l}`)); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") { e.preventDefault(); const shotL = isShotLocked(cur.court_id); resetClocksForQuarter(cur, !shotL); toast.message(shotL ? "Game clock reset (shot clock is Ref 2's)" : "Clocks reset"); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const action = HOTKEY_ACTIONS.find((a) => keyMatches(hkRef.current[a], e.key));
      if (!action) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();       // stop page scroll
      const locked = timerLocked(cur.court_id);
      const clockKey = (fn: () => void) => { if (locked) { toast.message("Timer is locked"); return; } fn(); };
      switch (action) {
        case "shotToggle": clockKey(() => ((cur.shot_clock_running || cur.game_clock_running) ? pauseBothClocks(cur) : startBothClocks(cur))); break;
        case "reset24": clockKey(() => resetShotClock(cur, 240)); break;
        case "reset14": clockKey(() => resetShotClock(cur, 140)); break;
        case "shotPlus": clockKey(() => adjustShotClock(cur, 10)); break;
        case "shotMinus": clockKey(() => adjustShotClock(cur, -10)); break;
        case "buzzer": buzzer(cur); break;
        case "sync": clockKey(() => startBothClocks(cur)); break;
        case "unsync": clockKey(() => pauseShotClock(cur)); break;
        case "prevQ": clockKey(() => advanceQuarter(cur, Math.max(1, cur.quarter - 1))); break;
        case "nextQ": clockKey(() => advanceQuarter(cur, cur.quarter + 1)); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function ScoreboardToolbar({ courtId, hotkeys, onChange }: { courtId: string; hotkeys: Record<HotAction, string>; onChange: (hk: Record<HotAction, string>) => void }) {
  const [help, setHelp] = useState(false);
  const [capturing, setCapturing] = useState<HotAction | null>(null);

  // While rebinding, the NEXT keypress becomes that action's key. Capture phase + stopImmediate
  // so the global hotkey handler doesn't also fire the old binding.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;     // wait for a real key
      if (e.key === "Escape") { setCapturing(null); return; }
      const next = { ...hotkeys, [capturing]: e.key };
      for (const a of HOTKEY_ACTIONS) if (a !== capturing && keyMatches(next[a], e.key)) next[a] = "";   // a key maps to one action
      onChange(next); setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, hotkeys, onChange]);

  function fullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => toast.error("Fullscreen blocked by the browser"));
  }
  return (
    <div className="relative flex items-center gap-1.5">
      <button onClick={() => undoLast(courtId).then((l) => l ? toast.message(`Undid ${l}`) : toast.message("Nothing to undo"))} title="Undo last action (Ctrl+Z)" className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-bold hover:bg-secondary"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
      <button onClick={fullscreen} title="Toggle fullscreen" className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-bold hover:bg-secondary"><Maximize className="h-3.5 w-3.5" /> Full</button>
      <button onClick={() => setHelp((v) => !v)} title="Keyboard shortcuts" className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-bold hover:bg-secondary"><Keyboard className="h-3.5 w-3.5" /> Keys</button>
      {help && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border bg-card p-3 text-xs shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-black uppercase tracking-wider text-muted-foreground">Shortcuts — click a key to rebind</p>
            <button onClick={() => { setCapturing(null); onChange({ ...HOTKEY_DEFAULTS }); }} className="text-[10px] font-bold text-muted-foreground underline hover:text-foreground">Reset</button>
          </div>
          {HOTKEY_ACTIONS.map((a) => (
            <div key={a} className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-muted-foreground">{HOTKEY_LABELS[a]}</span>
              <button onClick={() => setCapturing((c) => (c === a ? null : a))} className={`min-w-[3.25rem] rounded px-1.5 py-0.5 font-mono font-bold ${capturing === a ? "animate-pulse bg-amber-500 text-white" : "bg-secondary hover:bg-secondary/70"}`}>
                {capturing === a ? "Press…" : (hotkeys[a] ? keyLabel(hotkeys[a]) : "—")}
              </button>
            </div>
          ))}
          <p className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">
            {capturing ? "Press any key to assign · Esc to cancel." : <>Fixed: <kbd className="rounded bg-secondary px-1 font-mono">Ctrl+R</kbd> reset clocks · <kbd className="rounded bg-secondary px-1 font-mono">Ctrl+Z</kbd> undo. On an OBS display: <kbd className="rounded bg-secondary px-1 font-mono">H</kbd> hide shot clock, <kbd className="rounded bg-secondary px-1 font-mono">F</kbd> fullscreen.</>}
          </p>
        </div>
      )}
    </div>
  );
}

function TournamentBar({ s }: { s: NonNullable<ReturnType<typeof useGameState>> }) {
  const [name, setName] = useState(s.tournament_name);
  useEffect(() => setName(s.tournament_name), [s.tournament_name]);

  // Swappable tournament logo (shown on the BDSEA26 scorebug). Stored per court in the public
  // player-photos bucket; if none is uploaded the scorebug falls back to the default BUI badge.
  const evtPath = `event-logo/${s.court_id}.png`;
  const [logoV, setLogoV] = useState(0); // cache-bust the local preview after up/remove
  const evtPreview = SB_URL && logoV ? `${SB_URL}/storage/v1/object/public/player-photos/${evtPath}?v=${logoV}` : (SB_URL ? `${SB_URL}/storage/v1/object/public/player-photos/${evtPath}` : bdseaEventLogo);
  async function uploadEventLogo(file: File) {
    try {
      const { error } = await supabase.storage.from("player-photos").upload(evtPath, file, { upsert: true, contentType: file.type || "image/png" });
      if (error) throw error;
      setLogoV(Date.now());
      toast.success("Tournament logo updated — refresh the OBS source to apply");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
  }
  async function resetEventLogo() {
    await supabase.storage.from("player-photos").remove([evtPath]).catch(() => {});
    setLogoV(Date.now());
    toast.success("Reverted to the default tournament logo");
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tournament</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== s.tournament_name && patchGameState(s.court_id, { tournament_name: name })}
        className="min-w-[220px] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm font-semibold"
      />
      <div className="flex items-center gap-1.5" title="Tournament logo shown on the BDSEA26 scorebug">
        <img src={evtPreview} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = bdseaEventLogo; }} className="h-9 w-9 rounded-full border object-contain" style={{ background: "#05528c" }} />
        <label className="cursor-pointer rounded-md border px-2 py-1 text-[11px] font-bold hover:bg-secondary">
          Logo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEventLogo(f); e.currentTarget.value = ""; }} />
        </label>
        <button onClick={resetEventLogo} className="rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary">Reset</button>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Q</span>
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => setQuarter(s, q)}
            title="Set quarter (resets team fouls + clocks for the period)"
            className={`grid h-8 w-8 place-items-center rounded-md border text-sm font-bold ${s.quarter === q ? "bg-foreground text-background" : "hover:bg-secondary"}`}
          >
            {q}
          </button>
        ))}
        <button
          onClick={() => advanceQuarter(s, Math.max(5, s.quarter + 1))}
          title="Start overtime"
          className={`grid h-8 min-w-[2.75rem] place-items-center rounded-md border px-1 text-sm font-bold ${s.quarter >= 5 ? "bg-foreground text-background" : "hover:bg-secondary"}`}
        >
          {s.quarter >= 5 ? `OT${s.quarter - 4}` : "OT"}
        </button>
        <button onClick={() => resetClocksForQuarter(s, !isShotLocked(s.court_id))} className="ml-2 rounded-md border px-2 py-1 text-xs font-medium hover:bg-secondary">
          Reset clocks
        </button>
        <button
          onClick={async () => {
            const had = gameHasResult(s);
            if (!confirm(`Start a new game on this court (${s.home_name} vs ${s.away_name})?\n\n${had ? "The current game is SAVED to history first, then " : ""}score, fouls, timeouts and clock reset and the play-by-play / shot chart clear. Teams stay assigned.`)) return;
            try {
              if (had) await saveGame(s);
              await startNewGame(s);
              toast.success(had ? "Previous game saved · new game started" : "New game started");
            } catch { toast.error("Could not start a new game"); }
          }}
          className="rounded-md border-2 border-destructive px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          New Game
        </button>
      </div>
    </div>
  );
}

function ClockBar({ s }: { s: NonNullable<ReturnType<typeof useGameState>> }) {
  // Smooth, self-ticking clocks (no backward snap on pause) — re-renders only here.
  const gameClock = useSmoothGameClock(s);
  const shotTenths = useSmoothShotTenths(s);

  // Optional lock: hand the clock to the dedicated Time Keeper. While locked, this
  // panel's clock buttons are disabled (so nobody here touches the clock by accident);
  // the display still updates live from whatever the Time Keeper does. Local to this device.
  const lockKey = `bdc_timerlock_${s.court_id}`;
  const [locked, setLocked] = useState(() => (typeof window !== "undefined" && localStorage.getItem(lockKey) === "1"));
  function toggleLock() {
    setLocked((v) => {
      const next = !v;
      if (typeof window !== "undefined") localStorage.setItem(lockKey, next ? "1" : "0");
      return next;
    });
  }

  // Shot-clock lock — hand JUST the shot clock to a second official (Ref 2 / Shot Clock control).
  // While on, this panel runs game time + score + fouls + timeouts; the shot-clock buttons are off.
  const shotKey = `bdc_shotlock_${s.court_id}`;
  const [shotLocked, setShotLocked] = useState(() => (typeof window !== "undefined" && localStorage.getItem(shotKey) === "1"));
  function toggleShotLock() {
    setShotLocked((v) => {
      const next = !v;
      if (typeof window !== "undefined") localStorage.setItem(shotKey, next ? "1" : "0");
      return next;
    });
  }
  const shotOff = locked || shotLocked;

  // Buzzer sound on/off for THIS device (default on). The OBS timer always buzzes.
  const soundKey = `bdc_buzzer_${s.court_id}`;
  const [sound, setSound] = useState(() => (typeof window === "undefined" ? true : localStorage.getItem(soundKey) !== "0"));
  function toggleSound() {
    setSound((v) => {
      const next = !v;
      if (typeof window !== "undefined") localStorage.setItem(soundKey, next ? "1" : "0");
      return next;
    });
  }

  // Full-screen presentation: a clean, chrome-free clock view (game + shot) for the bench/scorer's
  // table. Uses the Fullscreen API to hide the browser toolbars; if blocked, the overlay still shows.
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

  return (
    <div className={`rounded-2xl border bg-card p-5 ${locked ? "ring-2 ring-amber-500/40" : ""}`}>
      <ClockBuzzer s={s} enabled={sound} />
      {/* Toolbar on its own row so it never overlaps the Start/Pause/Buzzer buttons */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={toggleSound}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${sound ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : "text-muted-foreground hover:bg-secondary"}`}
          title={sound ? "Buzzer sound ON (shot-clock 24s / time-up / manual). Click to mute on this device." : "Buzzer sound muted on this device. Click to enable."}
        >
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {sound ? "Buzzer on" : "Buzzer off"}
        </button>
        <button
          onClick={toggleLock}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${locked ? "border-amber-500 bg-amber-500/15 text-amber-600" : "hover:bg-secondary"}`}
          title={locked ? "Timer is locked — controlled by the Time Keeper. Click to unlock." : "Lock the timer so only the Time Keeper controls it."}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {locked ? "Timer locked" : "Lock timer"}
        </button>
        <button
          onClick={toggleShotLock}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${shotLocked ? "border-amber-500 bg-amber-500/15 text-amber-600" : "hover:bg-secondary"}`}
          title={shotLocked ? "Shot clock handed to Ref 2 — this panel runs game time + score only. Click to take it back." : "Hand the shot clock to Ref 2 (Shot Clock control). This panel keeps game time + score + fouls + timeouts."}
        >
          {shotLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {shotLocked ? "Shot: Ref 2" : "Lock shot clock"}
        </button>
        <button
          onClick={() => setPresenting(true)}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold hover:bg-secondary"
          title="Show the clock full-screen (no browser toolbars) — press Esc to exit"
        >
          <Maximize className="h-3.5 w-3.5" /> Fullscreen
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Game Clock</p>
        <p className="clock-digits mt-1 text-6xl font-black" style={{ color: "var(--amber-clock)" }}>{formatClock(gameClock)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, 60)}>+1m</ClockBtn>
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, 10)}>+10s</ClockBtn>
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, -10)}>-10s</ClockBtn>
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, -60)}>-1m</ClockBtn>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Shot Clock {shotLocked && <span className="text-amber-600">→ Ref 2</span>}</p>
        <p className="clock-digits mt-1 text-6xl font-black" style={{ color: "var(--red-shot)", opacity: shotOff ? 0.4 : 1 }}>{formatShotClock(shotTenths)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <ClockBtn locked={shotOff} onClick={() => resetShotClock(s, 240)}>24</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => resetShotClock(s, 140)}>14</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => adjustShotClock(s, 50)}>+5s</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => adjustShotClock(s, -10)}>-1s</ClockBtn>
        </div>
        <PossessionButtonsLight s={s} className="mt-3" />
      </div>
      <div className="flex flex-col items-stretch justify-center gap-2">
        <button
          disabled={locked}
          onClick={() => (s.game_clock_running ? pauseGameClock(s) : startGameClock(s))}
          className={`rounded-xl px-5 py-3 text-sm font-bold ${s.game_clock_running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"} ${locked ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {s.game_clock_running ? "Pause Game" : "Start Game"}
        </button>
        <button
          disabled={shotOff}
          onClick={() => (s.shot_clock_running ? pauseShotClock(s) : startShotClock(s))}
          className={`rounded-xl border px-5 py-2 text-xs font-bold ${s.shot_clock_running ? "border-destructive text-destructive" : ""} ${shotOff ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {shotLocked ? "Shot → Ref 2" : s.shot_clock_running ? "Pause Shot" : "Start Shot"}
        </button>
        <button disabled={locked} onClick={() => buzzer(s)} className={`rounded-xl bg-destructive py-2 text-xs font-bold text-destructive-foreground ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
          BUZZER
        </button>
      </div>

      {locked && (
        <div className="md:col-span-3 -mt-1 text-[11px] font-semibold text-amber-600">
          Timer locked — controlled by the Time Keeper. This panel only displays the clock.
        </div>
      )}
      </div>

      {presenting && (
        <FullscreenClocks fsRef={fsRef} s={s} gameClock={gameClock} shotTenths={shotTenths} onExit={exitPresent} />
      )}
    </div>
  );
}

function ClockBtn({ children, onClick, locked }: { children: React.ReactNode; onClick: () => void; locked?: boolean }) {
  return (
    <button onClick={onClick} disabled={locked} className={`rounded-md border px-2.5 py-1 font-semibold hover:bg-secondary ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
      {children}
    </button>
  );
}

/* Center clock console for the redesigned Standard layout — game clock + shot clock stacked in the
   MIDDLE column, flanked by the two team score panels. Its ~60fps clock re-render is isolated here,
   so the sibling TeamPanels' score buttons never remount (this is why taps never drop). */
function CenterClock({ s }: { s: NonNullable<ReturnType<typeof useGameState>> }) {
  const gameClock = useSmoothGameClock(s);
  const shotTenths = useSmoothShotTenths(s);

  // Timer lock — hand the clock to the dedicated Time Keeper (disables clock buttons here).
  const lockKey = `bdc_timerlock_${s.court_id}`;
  const [locked, setLocked] = useState(() => (typeof window !== "undefined" && localStorage.getItem(lockKey) === "1"));
  const toggleLock = () => setLocked((v) => { const n = !v; if (typeof window !== "undefined") localStorage.setItem(lockKey, n ? "1" : "0"); return n; });

  // Shot-clock lock — hand JUST the shot clock to a second official (Ref 2 / Shot Clock control).
  // When on, this panel controls only game time + score + fouls + timeouts.
  const shotKey = `bdc_shotlock_${s.court_id}`;
  const [shotLocked, setShotLocked] = useState(() => (typeof window !== "undefined" && localStorage.getItem(shotKey) === "1"));
  const toggleShotLock = () => setShotLocked((v) => { const n = !v; if (typeof window !== "undefined") localStorage.setItem(shotKey, n ? "1" : "0"); return n; });
  const shotOff = locked || shotLocked;

  // Buzzer sound for THIS device.
  const soundKey = `bdc_buzzer_${s.court_id}`;
  const [sound, setSound] = useState(() => (typeof window === "undefined" ? true : localStorage.getItem(soundKey) !== "0"));
  const toggleSound = () => setSound((v) => { const n = !v; if (typeof window !== "undefined") localStorage.setItem(soundKey, n ? "1" : "0"); return n; });

  // Full-screen clock view (bench / scorer's table).
  const fsRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => { if (presenting && fsRef.current && !document.fullscreenElement) fsRef.current.requestFullscreen?.().catch(() => { /* overlay still covers */ }); }, [presenting]);
  useEffect(() => { const onFs = () => { if (!document.fullscreenElement) setPresenting(false); }; document.addEventListener("fullscreenchange", onFs); return () => document.removeEventListener("fullscreenchange", onFs); }, []);
  const exitPresent = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setPresenting(false); };

  // With the shot clock handed to Ref 2, the main button runs ONLY the game clock.
  const running = shotLocked ? s.game_clock_running : (s.game_clock_running || s.shot_clock_running);
  const toggleRun = () => {
    if (locked) return;
    if (shotLocked) return s.game_clock_running ? pauseGameClock(s) : startGameClock(s);
    return running ? pauseBothClocks(s) : startBothClocks(s);
  };

  const tBtn = "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold";

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 ${locked ? "ring-2 ring-amber-500/40" : ""}`}>
      <ClockBuzzer s={s} enabled={sound} />

      {/* Toolbar: buzzer mute · timer lock · shot-clock lock · fullscreen */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button onClick={toggleSound} className={`${tBtn} ${sound ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : "text-muted-foreground hover:bg-secondary"}`} title={sound ? "Buzzer sound on — click to mute this device" : "Buzzer muted — click to enable"}>
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <button onClick={toggleLock} className={`${tBtn} ${locked ? "border-amber-500 bg-amber-500/15 text-amber-600" : "hover:bg-secondary"}`} title={locked ? "Timer locked to the Time Keeper — click to unlock" : "Lock the timer so only the Time Keeper controls it"}>
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {locked ? "Timer locked" : "Lock timer"}
        </button>
        <button onClick={toggleShotLock} className={`${tBtn} ${shotLocked ? "border-amber-500 bg-amber-500/15 text-amber-600" : "hover:bg-secondary"}`} title={shotLocked ? "Shot clock handed to Ref 2 — this panel runs game time + score only. Click to take it back." : "Hand the shot clock to Ref 2 (Shot Clock control). This panel keeps game time + score + fouls + timeouts."}>
          {shotLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {shotLocked ? "Shot: Ref 2" : "Lock shot clock"}
        </button>
        <button onClick={() => setPresenting(true)} className={`${tBtn} hover:bg-secondary`} title="Show the clock full-screen — Esc to exit">
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Game clock */}
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Game Clock</p>
        <p className="clock-digits text-6xl font-black leading-none" style={{ color: "var(--amber-clock)" }}>{formatClock(gameClock)}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs">
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, 60)}>+1m</ClockBtn>
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, 10)}>+10s</ClockBtn>
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, -10)}>-10s</ClockBtn>
          <ClockBtn locked={locked} onClick={() => adjustGameClock(s, -60)}>-1m</ClockBtn>
        </div>
      </div>

      {/* Shot clock */}
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Shot Clock {shotLocked && <span className="text-amber-600">→ Ref 2</span>}</p>
        <p className="clock-digits text-6xl font-black leading-none" style={{ color: "var(--red-shot)", opacity: shotOff ? 0.4 : 1 }}>{formatShotClock(shotTenths)}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs">
          <ClockBtn locked={shotOff} onClick={() => resetShotClock(s, 240)}>24</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => resetShotClock(s, 140)}>14</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => adjustShotClock(s, 50)}>+5s</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => adjustShotClock(s, -10)}>-1s</ClockBtn>
          <ClockBtn locked={shotOff} onClick={() => (s.shot_clock_running ? pauseShotClock(s) : startShotClock(s))}>{s.shot_clock_running ? "Stop" : "Run"}</ClockBtn>
        </div>
      </div>

      {/* Transport — Start/Pause (both, or game only when shot clock is Ref 2's) + buzzer */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button disabled={locked} onClick={toggleRun} className={`rounded-xl px-4 py-3 text-sm font-black ${running ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"} ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
          {running ? (shotLocked ? "Pause Game" : "Pause") : (shotLocked ? "Start Game" : "Start")}
        </button>
        <button disabled={locked} onClick={() => buzzer(s)} className={`rounded-xl bg-destructive px-4 py-3 text-xs font-black text-destructive-foreground ${locked ? "cursor-not-allowed opacity-40" : ""}`}>BUZZER</button>
      </div>

      {/* Quarter */}
      <div className="flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4].map((q) => (
          <button key={q} onClick={() => setQuarter(s, q)} title="Set quarter (resets team fouls + clocks)" className={`grid h-8 w-8 place-items-center rounded-md border text-xs font-black ${s.quarter === q ? "bg-foreground text-background" : "hover:bg-secondary"}`}>{q}</button>
        ))}
        <button onClick={() => advanceQuarter(s, Math.max(5, s.quarter + 1))} title="Overtime" className={`grid h-8 min-w-[2.5rem] place-items-center rounded-md border px-1 text-xs font-black ${s.quarter >= 5 ? "bg-foreground text-background" : "hover:bg-secondary"}`}>{s.quarter >= 5 ? `OT${s.quarter - 4}` : "OT"}</button>
        <button onClick={() => resetClocksForQuarter(s, !shotLocked)} title={shotLocked ? "Reset game clock (shot clock is Ref 2's)" : "Reset clocks for the quarter"} className="ml-1 rounded-md border-2 border-destructive px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground">Reset</button>
      </div>

      {presenting && <FullscreenClocks fsRef={fsRef} s={s} gameClock={gameClock} shotTenths={shotTenths} onExit={exitPresent} />}
    </div>
  );
}

function TeamPanel({ side, s }: { side: "home" | "away"; s: NonNullable<ReturnType<typeof useGameState>> }) {
  const isHome = side === "home";
  const name = isHome ? s.home_name : s.away_name;
  const color = isHome ? s.home_color : s.away_color;
  const score = isHome ? s.home_score : s.away_score;
  const fouls = isHome ? s.home_fouls : s.away_fouls;
  const timeouts = isHome ? s.home_timeouts : s.away_timeouts;
  const opponentFouls = isHome ? s.away_fouls : s.home_fouls;
  const threePulse = isHome ? s.three_pulse_home : s.three_pulse_away;
  const inBonus = opponentFouls >= 5;

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [colorInput, setColorInput] = useState(color);
  useEffect(() => { setNameInput(name); setColorInput(color); }, [name, color]);

  async function saveTeam() {
    const safe = nonWhite(colorInput); // white is invisible on the white UI / scorebug
    if (safe !== colorInput) { setColorInput(safe); toast.message("White isn't usable on the white background — saved a dark shade instead."); }
    if (isHome) await patchGameState(s.court_id, { home_name: nameInput, home_color: safe });
    else await patchGameState(s.court_id, { away_name: nameInput, away_color: safe });
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{isHome ? "HOME" : "AWAY"}</p>
          {editing ? (
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="mt-1 flex min-h-[4rem] w-full rounded-md border bg-background px-2 py-1 text-xl font-bold" />
          ) : (
            <h3 className="flex min-h-[4rem] items-start text-2xl font-black leading-tight" style={{ color }}>{name}</h3>
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
        <ScoreBtn label="+3" onClick={() => scoreFromAction(s, side, "3PT_MADE")} accent={color} />
        <ScoreBtn label="+2" onClick={() => scoreFromAction(s, side, "2PT_MADE")} accent={color} />
        <ScoreBtn label="+1" onClick={() => scoreFromAction(s, side, "FT_MADE")} accent={color} />
        <ScoreBtn label="-1" onClick={() => addScore(s, side, -1)} accent={color} dim />
        <ScoreBtn label="-2" onClick={() => addScore(s, side, -2)} accent={color} dim />
        <ScoreBtn label="RST" onClick={() => { if (confirm(`Reset ${name}'s score to 0?`)) resetScore(s, side); }} danger />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatStepper label="Team Fouls" value={fouls} onAdd={() => addFoul(s, side, 1)} onSub={() => addFoul(s, side, -1)} hi={fouls >= 5} hiLabel="BONUS" />
        <StatStepper label="Timeouts used" value={timeouts} max={timeoutMaxForQuarter(s.quarter)} onAdd={() => { addTimeout(s, side, 1); logPlayerStat(s, side, "TIMEOUT"); }} onSub={() => addTimeout(s, side, -1)} hi={timeouts >= timeoutMaxForQuarter(s.quarter)} hiLabel="NONE LEFT" />
      </div>
    </div>
  );
}

function ScoreBtn({ label, onClick, accent, danger, dim }: { label: string; onClick: () => void; accent?: string; danger?: boolean; dim?: boolean }) {
  if (danger) {
    return <button onClick={onClick} className="rounded-lg border-2 border-destructive py-3 text-base font-black text-destructive transition hover:bg-destructive hover:text-destructive-foreground">{label}</button>;
  }
  // Solid team colour, label in a contrasting ink so it stands out on any colour.
  // The −1/−2 share the team colour but are dimmed so they read as secondary.
  const bg = accent || "#111827";
  return (
    <button
      onClick={onClick}
      className="rounded-lg py-3 text-base font-black shadow-sm ring-1 ring-black/10 transition hover:brightness-110 active:scale-[0.98]"
      style={{ background: bg, color: contrastText(bg), opacity: dim ? 0.55 : 1 }}
    >
      {label}
    </button>
  );
}

function StatStepper({ label, value, max, onAdd, onSub, hi, hiLabel }: { label: string; value: number; max?: number; onAdd: () => void; onSub: () => void; hi?: boolean; hiLabel?: string }) {
  return (
    <div className={`rounded-lg border bg-background p-3 ${hi ? "border-destructive ring-1 ring-destructive/40" : ""}`}>
      <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{label}{max ? ` (${value}/${max})` : ""}</span>
        {hi && hiLabel && <span className="rounded bg-destructive px-1.5 py-0.5 text-[9px] text-destructive-foreground">{hiLabel}</span>}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <button onClick={onSub} className="grid h-8 w-8 place-items-center rounded-md border font-bold hover:bg-secondary">−</button>
        <span className={`clock-digits text-3xl font-black ${hi ? "text-destructive" : ""}`}>{value}</span>
        <button onClick={onAdd} className="grid h-8 w-8 place-items-center rounded-md border font-bold hover:bg-secondary">+</button>
      </div>
    </div>
  );
}

