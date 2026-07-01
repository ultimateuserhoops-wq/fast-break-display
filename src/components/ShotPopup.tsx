import type { GameState, Player } from "@/lib/game-state";
import { scoreFromAction, logPlayerStat } from "@/lib/game-state";

const SHOTS: Array<{ made: "2PT_MADE" | "3PT_MADE" | "FT_MADE"; miss: string; label: string }> = [
  { made: "2PT_MADE", miss: "2PT_MISS", label: "2 PT" },
  { made: "3PT_MADE", miss: "3PT_MISS", label: "3 PT" },
  { made: "FT_MADE", miss: "FT_MISS", label: "Free throw" },
];
const STATS = ["REB", "AST", "STL", "BLK", "TO", "FOUL"] as const;

export function ShotPopup({
  s, side, player, onClose, tracksMisses = true,
}: {
  s: GameState;
  side: "home" | "away";
  player: Player;
  onClose: () => void;
  tracksMisses?: boolean; // false = quick mode: tap a shot to score it (made only, no miss step)
}) {
  const color = side === "home" ? s.home_color : s.away_color;
  const teamName = side === "home" ? s.home_name : s.away_name;
  const meta = { id: player.id, name: player.name, jersey_number: player.jersey_number };

  // Close instantly, then persist in the background. Never block the close on the
  // network — if the write is slow or fails, the popup must still dismiss right away.
  function made(type: "2PT_MADE" | "3PT_MADE" | "FT_MADE") { onClose(); scoreFromAction(s, side, type, meta).catch(() => {}); }
  function logAndClose(type: string) { onClose(); logPlayerStat(s, side, type, meta).catch(() => {}); }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border-2 bg-card p-5 shadow-2xl"
        style={{ borderColor: color }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-xl text-2xl font-black text-white" style={{ background: color }}>
            {player.jersey_number || "—"}
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{teamName}</p>
            <p className="text-xl font-black leading-tight">{player.name}</p>
            {player.position && <p className="text-[10px] uppercase text-muted-foreground">{player.position}</p>}
          </div>
          <button onClick={onClose} className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-secondary">✕</button>
        </div>

        {tracksMisses ? (
          <div className="mt-4 space-y-2">
            {SHOTS.map((sh) => (
              <div key={sh.label} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{sh.label}</span>
                <button onClick={() => made(sh.made)} className="rounded-lg bg-emerald-600 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-500">MADE</button>
                <button onClick={() => logAndClose(sh.miss)} className="rounded-lg bg-rose-600 py-3 text-sm font-black text-white shadow-sm transition hover:bg-rose-500">MISS</button>
              </div>
            ))}
          </div>
        ) : (
          // Quick mode: one tap = score that shot (made only, no miss tracking).
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tap to score (made/miss off)</p>
            <div className="grid grid-cols-3 gap-2">
              {SHOTS.map((sh) => (
                <button key={sh.label} onClick={() => made(sh.made)} className="rounded-lg bg-emerald-600 py-4 text-base font-black text-white shadow-sm transition hover:bg-emerald-500">
                  +{sh.made === "3PT_MADE" ? 3 : sh.made === "2PT_MADE" ? 2 : 1}
                  <span className="ml-1 text-[10px] font-bold opacity-80">{sh.label.replace(" PT", "PT").replace("Free throw", "FT")}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Other stat</p>
          <div className="grid grid-cols-6 gap-1.5">
            {STATS.map((st) => (
              <button
                key={st}
                onClick={() => logAndClose(st)}
                className={`rounded-md border py-2 text-xs font-bold transition hover:bg-secondary ${st === "FOUL" ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" : ""}`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
