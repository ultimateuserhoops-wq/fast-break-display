import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  type GameState,
  scoreFromAction, addScore, addFoul, undoLast,
  startBothClocks, pauseBothClocks, startGameClock, pauseGameClock, startShotClock, pauseShotClock,
  resetShotClock, adjustShotClock, resetClocksForQuarter, advanceQuarter, buzzer, isShotLocked,
} from "@/lib/game-state";

/* ---------- Operator hotkeys (rebindable, saved per device) ----------
 * Shared by the Court Control panel AND the Time Keeper page, so a scorer's-table macropad
 * drives whichever page is open with the exact same keys and saved bindings. */

const timerLocked = (courtId: string) => typeof window !== "undefined" && localStorage.getItem(`bdc_timerlock_${courtId}`) === "1";

export type HotAction =
  | "shotToggle" | "reset24" | "reset14" | "shotPlus" | "shotMinus" | "buzzer" | "sync" | "unsync" | "prevQ" | "nextQ"
  | "homePlus1" | "homePlus2" | "homePlus3" | "homeMinus1" | "homeFoul"
  | "awayPlus1" | "awayPlus2" | "awayPlus3" | "awayMinus1" | "awayFoul"
  | "undo";
// Defaults match the scorer's-table MACROPAD (one-handed keypad, knob on the left):
//   W/E/R = home +1/+2/+3 · A/S/D = away +1/+2/+3 · Z/C = home/away foul · X = undo
//   TAB = home −1 · . = away −1 · T = shot 24 · DEL = shot 14 · SPACE = clocks · ENTER = buzzer
// ESC and the modifier keys stay unbound on purpose: ESC so an accidental press does nothing,
// modifiers because a lone Control/Alt binding would also fire on every Ctrl+Z / Ctrl+R combo.
export const HOTKEY_DEFAULTS: Record<HotAction, string> = {
  shotToggle: " ", reset24: "t", reset14: "Delete", shotPlus: "ArrowUp", shotMinus: "ArrowDown",
  buzzer: "Enter", sync: "", unsync: "", prevQ: "", nextQ: "",
  homePlus1: "w", homePlus2: "e", homePlus3: "r", homeMinus1: "Tab", homeFoul: "z",
  awayPlus1: "a", awayPlus2: "s", awayPlus3: "d", awayMinus1: ".", awayFoul: "c",
  undo: "x",
};
export const HOTKEY_LABELS: Record<HotAction, string> = {
  shotToggle: "Start / Pause both clocks", reset24: "Reset 24s", reset14: "Reset 14s",
  shotPlus: "Shot clock +1s", shotMinus: "Shot clock −1s", buzzer: "Buzzer",
  sync: "Sync (run both clocks)", unsync: "Unsync (stop shot clock)", prevQ: "Previous quarter", nextQ: "Next quarter",
  homePlus1: "Home +1", homePlus2: "Home +2", homePlus3: "Home +3", homeMinus1: "Home −1", homeFoul: "Home foul +1",
  awayPlus1: "Away +1", awayPlus2: "Away +2", awayPlus3: "Away +3", awayMinus1: "Away −1", awayFoul: "Away foul +1",
  undo: "Undo last",
};
export const HOTKEY_ACTIONS = Object.keys(HOTKEY_DEFAULTS) as HotAction[];
// Keys-dialog grouping (the flat list got long once scores/fouls joined the clock actions).
export const HOTKEY_GROUPS: [string, HotAction[]][] = [
  ["Clock", ["shotToggle", "reset24", "reset14", "shotPlus", "shotMinus", "buzzer"]],
  ["Home team", ["homePlus1", "homePlus2", "homePlus3", "homeMinus1", "homeFoul"]],
  ["Away team", ["awayPlus1", "awayPlus2", "awayPlus3", "awayMinus1", "awayFoul"]],
  ["Game", ["undo", "sync", "unsync", "prevQ", "nextQ"]],
];
const HOTKEYS_LS = "bdc_hotkeys";
const HOTKEYS_VER_LS = "bdc_hotkeys_ver";
// Bump when the DEFAULTS change in a way that makes an older saved map actively wrong. A pre-macropad
// map (sync="s", reset24="r", …) has no score keys AND collides with the new score bindings — and the
// old action wins by list order — so 's'/'r' etc. fired the clock instead of scoring. On a version
// mismatch we discard the saved map and hand back clean macropad defaults; the operator can rebind after.
const HOTKEYS_VER = "2-macropad";
export function loadHotkeys(): Record<HotAction, string> {
  if (typeof window === "undefined") return { ...HOTKEY_DEFAULTS };
  try {
    if (localStorage.getItem(HOTKEYS_VER_LS) !== HOTKEYS_VER) return { ...HOTKEY_DEFAULTS };
    return { ...HOTKEY_DEFAULTS, ...JSON.parse(localStorage.getItem(HOTKEYS_LS) || "{}") };
  } catch { return { ...HOTKEY_DEFAULTS }; }
}
export function saveHotkeys(map: Record<HotAction, string>) {
  try { localStorage.setItem(HOTKEYS_LS, JSON.stringify(map)); localStorage.setItem(HOTKEYS_VER_LS, HOTKEYS_VER); } catch { /* ignore */ }
}

export function keyLabel(k: string): string {
  if (k === " ") return "Space";
  if (k === "ArrowUp") return "↑"; if (k === "ArrowDown") return "↓"; if (k === "ArrowLeft") return "←"; if (k === "ArrowRight") return "→";
  return k.length === 1 ? k.toUpperCase() : k;
}
export const keyMatches = (cfg: string, ev: string) => !!cfg && (cfg === ev || (cfg.length === 1 && ev.length === 1 && cfg.toLowerCase() === ev.toLowerCase()));

// Split-clock keys (per device). OFF (default): Space starts/pauses BOTH clocks together.
// ON: Space runs the GAME clock only and A runs the SHOT clock only — for a two-operator setup
// (one person on game time, one on the shot clock). While ON, A no longer scores Away +1.
const SPLITCLOCK_LS = (courtId: string) => `bdc_splitclock_${courtId}`;
export function loadSplitClock(courtId: string): boolean { return typeof window !== "undefined" && localStorage.getItem(SPLITCLOCK_LS(courtId)) === "1"; }
export function saveSplitClock(courtId: string, on: boolean) { try { localStorage.setItem(SPLITCLOCK_LS(courtId), on ? "1" : "0"); } catch { /* ignore */ } }

// Broadcast-style keyboard shortcuts for the operator (mirrors the printed shortcut card).
// Ignored while typing in a field; clock keys are disabled while the timer is locked.
export function useScoreboardHotkeys(s: GameState | null, hotkeys: Record<HotAction, string>) {
  const sRef = useRef(s); sRef.current = s;
  const hkRef = useRef(hotkeys); hkRef.current = hotkeys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = sRef.current; if (!cur) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // The pad must never let Space/Enter re-fire a focused on-screen button or reopen a menu.
      const blurActive = () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); };

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoLast(cur.court_id).then((l) => l && toast.message(`Undid ${l}`)); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") { e.preventDefault(); const shotL = isShotLocked(cur.court_id); resetClocksForQuarter(cur, !shotL); toast.message(shotL ? "Game clock reset (shot clock is Ref 2's)" : "Clocks reset"); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Split-clock mode takes priority over the normal key map: Space = game clock only,
      // A = shot clock only. (A stops scoring Away +1 while this is on.)
      if (loadSplitClock(cur.court_id)) {
        const runClock = (running: boolean, start: () => void, pause: () => void) => {
          if (timerLocked(cur.court_id)) { toast.message("Timer is locked"); return; }
          running ? pause() : start();
        };
        if (e.key === " ") { e.preventDefault(); blurActive(); runClock(cur.game_clock_running, () => startGameClock(cur), () => pauseGameClock(cur)); toast.message("Game clock"); return; }
        if (e.key.length === 1 && e.key.toLowerCase() === "a") { e.preventDefault(); blurActive(); runClock(cur.shot_clock_running, () => startShotClock(cur), () => pauseShotClock(cur)); toast.message("Shot clock"); return; }
      }

      const action = HOTKEY_ACTIONS.find((a) => keyMatches(hkRef.current[a], e.key));
      if (!action) return;
      if (e.key === " " || e.key === "Enter" || e.key === "Tab" || e.key.startsWith("Arrow")) e.preventDefault();   // stop scroll / focus-move / re-firing a focused button
      blurActive();
      const locked = timerLocked(cur.court_id);
      const clockKey = (fn: () => void) => { if (locked) { toast.message("Timer is locked"); return; } fn(); };
      // Score/foul keys reuse the exact functions the on-screen buttons call, so the play-by-play
      // and box score stay in step. They aren't gated by the timer lock (that lock is clock-only).
      // Each one toasts so a macropad operator gets confirmation without looking at the screen.
      const score = (side: "home" | "away", a: "FT_MADE" | "2PT_MADE" | "3PT_MADE", pts: number) => {
        scoreFromAction(cur, side, a);
        toast.message(`${side === "home" ? cur.home_name : cur.away_name} +${pts}`);
      };
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
        case "homePlus1": score("home", "FT_MADE", 1); break;
        case "homePlus2": score("home", "2PT_MADE", 2); break;
        case "homePlus3": score("home", "3PT_MADE", 3); break;
        case "awayPlus1": score("away", "FT_MADE", 1); break;
        case "awayPlus2": score("away", "2PT_MADE", 2); break;
        case "awayPlus3": score("away", "3PT_MADE", 3); break;
        case "homeMinus1": addScore(cur, "home", -1); toast.message(`${cur.home_name} −1`); break;
        case "awayMinus1": addScore(cur, "away", -1); toast.message(`${cur.away_name} −1`); break;
        case "homeFoul": addFoul(cur, "home", 1); toast.message(`${cur.home_name} foul`); break;
        case "awayFoul": addFoul(cur, "away", 1); toast.message(`${cur.away_name} foul`); break;
        case "undo": undoLast(cur.court_id).then((l) => toast.message(l ? `Undid ${l}` : "Nothing to undo")); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
