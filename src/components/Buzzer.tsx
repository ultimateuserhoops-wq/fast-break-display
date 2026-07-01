import { useEffect, useRef } from "react";
import { useSmoothGameClock, useSmoothShotTenths, type GameState } from "@/lib/game-state";

/**
 * Loud buzzer SOUND for the clocks — notifies the referee on a 24-second shot-clock
 * violation, on period end (game clock 0), and when the manual BUZZER is pressed.
 * Generated with the Web Audio API (harsh dual-oscillator horn) at full gain, so no
 * audio file is needed. Final loudness depends on the device/OBS volume — turn it up.
 */
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function playBuzzer(durationMs = 1400) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const end = t0 + durationMs / 1000;
  const master = c.createGain();
  master.gain.setValueAtTime(1, t0);
  master.gain.setValueAtTime(1, end - 0.06);
  master.gain.linearRampToValueAtTime(0, end); // tiny fade-out to avoid a click
  master.connect(c.destination);
  // Two detuned saw waves → a harsh, attention-grabbing horn (loud).
  for (const f of [180, 233]) {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0.5;
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(end);
  }
}

// Browsers block audio until a user gesture; unlock the context on the first one.
// (OBS's embedded Chromium autoplays, so OBS sources buzz with no interaction.)
if (typeof window !== "undefined") {
  const unlock = () => { getCtx(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/**
 * Mount anywhere that should make the buzzer sound (renders nothing). Watches the
 * authoritative (live) clocks and fires on the 0-crossing + on manual buzzer pulses.
 */
export function ClockBuzzer({ s, enabled = true }: { s: GameState; enabled?: boolean }) {
  const shot = useSmoothShotTenths(s); // live (no display delay) so the buzzer is on time
  const game = useSmoothGameClock(s);
  const prevShot = useRef(shot);
  const prevGame = useRef(game);
  const prevPulse = useRef(s.buzzer_pulse);

  useEffect(() => {
    if (enabled && prevShot.current > 0 && shot <= 0 && s.shot_clock_running) playBuzzer(1200);
    prevShot.current = shot;
  }, [shot, s.shot_clock_running, enabled]);

  useEffect(() => {
    if (enabled && prevGame.current > 0 && game <= 0 && s.game_clock_running) playBuzzer(1600);
    prevGame.current = game;
  }, [game, s.game_clock_running, enabled]);

  useEffect(() => {
    if (s.buzzer_pulse !== prevPulse.current) {
      if (enabled) playBuzzer(1500);
      prevPulse.current = s.buzzer_pulse;
    }
  }, [s.buzzer_pulse, enabled]);

  return null;
}
