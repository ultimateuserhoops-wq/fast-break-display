import { usePossession, togglePossession, type PossSide } from "@/lib/possession";
import type { GameState } from "@/lib/game-state";

/* Operator control: a possession arrow that sits next to the shot clock.
   ◄ = home has the ball, ► = away. Click the lit side again to clear (dead ball).
   This is also the alternating-possession arrow refs read on a held ball. */
export function PossessionButtons({ s, className = "" }: { s: GameState; className?: string }) {
  const poss = usePossession(s.court_id);
  const hName = s.home_name;
  const aName = s.away_name;
  const base = "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-black uppercase tracking-wide transition";
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title="Possession arrow — which team has the ball (and the held-ball / alternating-possession arrow). Click the lit side again to clear.">
      <button
        onClick={() => togglePossession(s.court_id, "home", poss)}
        className={`${base} ${poss === "home" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-white/20 text-white/60 hover:bg-white/10"}`}
      >
        <span className="text-sm leading-none">◄</span>
        <span className="max-w-[6rem] truncate">{hName}</span>
      </button>
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Poss</span>
      <button
        onClick={() => togglePossession(s.court_id, "away", poss)}
        className={`${base} ${poss === "away" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-white/20 text-white/60 hover:bg-white/10"}`}
      >
        <span className="max-w-[6rem] truncate">{aName}</span>
        <span className="text-sm leading-none">►</span>
      </button>
    </div>
  );
}

// Light-UI variant for the standard/standard-2 control (on a white card, not a dark board).
export function PossessionButtonsLight({ s, className = "" }: { s: GameState; className?: string }) {
  const poss = usePossession(s.court_id);
  const base = "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold uppercase tracking-wide transition";
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title="Possession arrow — which team has the ball (and the held-ball / alternating-possession arrow). Click the lit side again to clear.">
      <button
        onClick={() => togglePossession(s.court_id, "home", poss)}
        className={`${base} ${poss === "home" ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : "text-muted-foreground hover:bg-secondary"}`}
      >
        <span className="text-sm leading-none">◄</span>
        <span className="max-w-[6rem] truncate">{s.home_name}</span>
      </button>
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Poss</span>
      <button
        onClick={() => togglePossession(s.court_id, "away", poss)}
        className={`${base} ${poss === "away" ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : "text-muted-foreground hover:bg-secondary"}`}
      >
        <span className="max-w-[6rem] truncate">{s.away_name}</span>
        <span className="text-sm leading-none">►</span>
      </button>
    </div>
  );
}

/* Display indicator: a possession pill shown on the OBS output — an arrow pointing to the
   team that has the ball, in that team's colour. Hidden when possession is cleared. */
export function PossessionBar({ courtId, s, hName, aName }: { courtId: string; s: GameState; hName: string; aName: string }) {
  const poss: PossSide = usePossession(courtId);
  if (!poss) return null;
  const isHome = poss === "home";
  const name = isHome ? hName : aName;
  const color = isHome ? s.home_color : s.away_color;
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-1.5 shadow-xl ring-1 ring-white/25 backdrop-blur">
        {isHome && <span className="text-2xl font-black leading-none" style={{ color }}>◄</span>}
        <span className="text-lg font-black uppercase tracking-wider text-white">{name}</span>
        <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/55">Ball</span>
        {!isHome && <span className="text-2xl font-black leading-none" style={{ color }}>►</span>}
      </div>
    </div>
  );
}
