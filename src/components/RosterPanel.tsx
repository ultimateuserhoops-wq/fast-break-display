import { useState } from "react";
import type { GameState, Player, Team } from "@/lib/game-state";
import { useTeams, usePlayers, assignTeamToSide, addPlayerToTeam, setOnCourt } from "@/lib/game-state";
import { Plus, ArrowDown, ArrowUp } from "lucide-react";

export function RosterPanel({
  s, side, onSelectPlayer, activePlayerId,
}: {
  s: GameState;
  side: "home" | "away";
  onSelectPlayer: (p: Player | null) => void;
  activePlayerId: string | null;
}) {
  const teamId = side === "home" ? s.home_team_id : s.away_team_id;
  const onCourtIds = (side === "home" ? s.home_on_court : s.away_on_court) ?? [];
  const players = usePlayers(teamId);
  const teams = useTeams();
  const color = side === "home" ? s.home_color : s.away_color;
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  const onCourt = onCourtIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const bench = players.filter((p) => !onCourtIds.includes(p.id));

  async function pickTeam(t: Team) {
    await assignTeamToSide(s, side, t);
    setShowTeamPicker(false);
    onSelectPlayer(null);
  }

  async function moveToCourt(p: Player) {
    if (onCourtIds.length >= 5) return;
    await setOnCourt(s, side, [...onCourtIds, p.id]);
  }
  async function moveToBench(p: Player) {
    await setOnCourt(s, side, onCourtIds.filter((id) => id !== p.id));
    if (activePlayerId === p.id) onSelectPlayer(null);
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <h4 className="text-sm font-black uppercase tracking-wider">
            {side === "home" ? s.home_name : s.away_name} · Roster
          </h4>
        </div>
        <button
          onClick={() => setShowTeamPicker((v) => !v)}
          className="rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary"
        >
          {teamId ? "Change team" : "Pick team"}
        </button>
      </div>

      {showTeamPicker && (
        <div className="mt-3 max-h-44 overflow-y-auto rounded-md border bg-background p-2 text-xs">
          {teams.length === 0 && <p className="text-muted-foreground">No teams in library yet.</p>}
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTeam(t)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
            >
              <span className="h-3 w-3 rounded" style={{ background: t.primary_color }} />
              <span className="font-semibold">{t.name}</span>
              <span className="ml-auto text-[10px] uppercase text-muted-foreground">{t.abbreviation}</span>
            </button>
          ))}
        </div>
      )}

      {!teamId ? (
        <p className="mt-3 text-xs text-muted-foreground">Pick a team to enable roster + play-by-play.</p>
      ) : (
        <>
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              On court ({onCourt.length}/5)
            </p>
            <div className="mt-1 grid grid-cols-5 gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => {
                const p = onCourt[i];
                if (!p) {
                  return (
                    <div key={i} className="grid aspect-square place-items-center rounded-lg border-2 border-dashed text-[10px] text-muted-foreground">
                      empty
                    </div>
                  );
                }
                const active = activePlayerId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPlayer(active ? null : p)}
                    className={`group relative grid aspect-square place-items-center rounded-lg border-2 text-center text-xs font-bold leading-tight transition ${active ? "scale-[1.03] shadow-md" : "hover:bg-secondary"}`}
                    style={active ? { borderColor: color, background: `${color}22` } : undefined}
                  >
                    <div>
                      <div className="clock-digits text-lg leading-none" style={{ color }}>{p.jersey_number || "—"}</div>
                      <div className="mt-0.5 line-clamp-1 px-1 text-[9px] uppercase">{p.name.split(" ").slice(-1)[0]}</div>
                    </div>
                    <span
                      onClick={(e) => { e.stopPropagation(); moveToBench(p); }}
                      className="absolute -right-1 -top-1 hidden h-5 w-5 cursor-pointer place-items-center rounded-full bg-foreground text-background group-hover:grid"
                      title="Bench"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Bench ({bench.length})
              </p>
              <AddPlayerButton teamId={teamId} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {bench.length === 0 && <p className="text-[11px] text-muted-foreground">No bench players.</p>}
              {bench.map((p) => (
                <button
                  key={p.id}
                  onClick={() => moveToCourt(p)}
                  disabled={onCourtIds.length >= 5}
                  className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary disabled:opacity-40"
                  title="Send to court"
                >
                  <span className="clock-digits" style={{ color }}>{p.jersey_number || "—"}</span>
                  <span>{p.name}</span>
                  <ArrowUp className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AddPlayerButton({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [pos, setPos] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addPlayerToTeam(teamId, { name: name.trim(), jersey_number: num.trim(), position: pos.trim() });
    setName(""); setNum(""); setPos(""); setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold hover:bg-secondary">
        <Plus className="h-3 w-3" /> Add
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1 text-[10px]">
      <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="#" className="w-10 rounded border bg-background px-1 py-0.5" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required className="w-24 rounded border bg-background px-1 py-0.5" />
      <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Pos" className="w-10 rounded border bg-background px-1 py-0.5" />
      <button type="submit" className="rounded bg-foreground px-1.5 py-0.5 font-bold text-background">+</button>
      <button type="button" onClick={() => setOpen(false)} className="rounded border px-1.5 py-0.5">×</button>
    </form>
  );
}
