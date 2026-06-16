import type { GameState, Player } from "@/lib/game-state";
import { scoreFromAction, logPlayerStat } from "@/lib/game-state";

const MADE_ACTIONS: Array<{ key: "2PT_MADE" | "3PT_MADE" | "FT_MADE"; label: string; pts: number }> = [
  { key: "2PT_MADE", label: "+2 MADE", pts: 2 },
  { key: "3PT_MADE", label: "+3 MADE", pts: 3 },
  { key: "FT_MADE", label: "+1 FT MADE", pts: 1 },
];
const MISS_ACTIONS = [
  { key: "2PT_MISS", label: "2PT miss" },
  { key: "3PT_MISS", label: "3PT miss" },
  { key: "FT_MISS", label: "FT miss" },
];
const STAT_ACTIONS = [
  { key: "REB", label: "REB" },
  { key: "AST", label: "AST" },
  { key: "STL", label: "STL" },
  { key: "BLK", label: "BLK" },
  { key: "TO",  label: "TO"  },
  { key: "FOUL", label: "FOUL" },
];

export function PlayByPlayPad({
  s, side, player, onCleared,
}: {
  s: GameState;
  side: "home" | "away";
  player: Player;
  onCleared: () => void;
}) {
  const color = side === "home" ? s.home_color : s.away_color;
  const meta = { id: player.id, name: player.name, jersey_number: player.jersey_number };

  return (
    <div className="rounded-2xl border-2 bg-card p-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl text-xl font-black text-white" style={{ background: color }}>
            {player.jersey_number || "—"}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Logging for {side === "home" ? s.home_name : s.away_name}
            </p>
            <p className="text-lg font-black leading-tight">{player.name}</p>
            {player.position && <p className="text-[10px] uppercase text-muted-foreground">{player.position}</p>}
          </div>
        </div>
        <button onClick={onCleared} className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-secondary">
          Done
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {MADE_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => scoreFromAction(s, side, a.key, meta)}
            className="rounded-lg py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90"
            style={{ background: color }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {MISS_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => logPlayerStat(s, side, a.key, meta)}
            className="rounded-lg border-2 py-2 text-xs font-bold hover:bg-secondary"
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {STAT_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => logPlayerStat(s, side, a.key, meta)}
            className={`rounded-md border py-2 text-xs font-bold transition hover:bg-secondary ${a.key === "FOUL" ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" : ""}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
