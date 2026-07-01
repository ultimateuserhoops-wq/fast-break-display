import { Minimize } from "lucide-react";
import { formatClock, formatShotClock, type GameState } from "@/lib/game-state";
import { periodLabel } from "@/lib/obs-toggles";

// Chrome-free fullscreen clock view for the scorer's table. The SHOT CLOCK is the focus —
// it fills the right ~2/3 of the screen; the tournament name, period and game clock sit in
// the left ~1/3. (On a portrait screen it stacks: timer block on top, shot clock below.)
export function FullscreenClocks({
  fsRef, s, gameClock, shotTenths, onExit,
}: {
  fsRef: React.RefObject<HTMLDivElement | null>;
  s: GameState;
  gameClock: number;
  shotTenths: number;
  onExit: () => void;
}) {
  return (
    <div ref={fsRef} className="fixed inset-0 z-[100] flex flex-col md:flex-row" style={{ background: "radial-gradient(circle at 50% 40%, #161b22 0%, #000 72%)" }}>
      {/* Left third — tournament name + period + game clock */}
      <div className="flex w-full flex-col items-center justify-center gap-[2vh] px-[2vw] py-[3vh] md:w-1/3 md:border-r md:border-white/10">
        <p className="text-center font-bold uppercase tracking-[0.3em] text-white/40" style={{ fontSize: "min(2.4vh, 2.6vw)" }}>
          {s.tournament_name || "BDC"}
        </p>
        <p className="font-black uppercase tracking-[0.2em] text-white/55" style={{ fontSize: "min(3.4vh, 3.6vw)" }}>{periodLabel(s.quarter)}</p>
        <div className="flex flex-col items-center">
          <span className="font-bold uppercase tracking-[0.35em] text-white/35" style={{ fontSize: "min(2vh, 2.2vw)" }}>Game</span>
          <span className="clock-digits font-black leading-none" style={{ color: "var(--amber-clock)", fontSize: "min(16vh, 13vw)", textShadow: "0 0 35px rgba(255,180,0,0.35)" }}>{formatClock(gameClock)}</span>
        </div>
      </div>

      {/* Right two-thirds — shot clock (the main focus) */}
      <div className="flex w-full flex-1 flex-col items-center justify-center px-[2vw] md:w-2/3">
        <span className="font-bold uppercase tracking-[0.4em] text-white/35" style={{ fontSize: "min(2.4vh, 2vw)" }}>Shot Clock</span>
        <span className="clock-digits font-black leading-none" style={{ color: "var(--red-shot)", fontSize: "min(78vh, 52vw)", textShadow: "0 0 80px rgba(220,40,40,0.5)" }}>{formatShotClock(shotTenths)}</span>
      </div>

      <button onClick={onExit} className="absolute right-6 top-6 flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10">
        <Minimize className="h-3.5 w-3.5" /> Exit (Esc)
      </button>
    </div>
  );
}
