import { useEffect, useRef, useState } from "react";
import type { GameState, Player, Team } from "@/lib/game-state";
import { supabase } from "@/integrations/supabase/client";
import { useTeams, usePlayers, assignTeamToSide, addPlayerToTeam, setOnCourt, isStaff, staffRole } from "@/lib/game-state";
import { getGameRoster, setGameRoster } from "@/lib/ads";
import { Plus, ArrowDown, ArrowUp, Users } from "lucide-react";
import { ink } from "@/lib/color";

function jerseyNum(j: string | null): number {
  const n = parseInt((j ?? "").replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? 9999 : n;
}
function byNumber(a: Player, b: Player) {
  return jerseyNum(a.jersey_number) - jerseyNum(b.jersey_number) || (a.jersey_number ?? "").localeCompare(b.jersey_number ?? "");
}

// Inline-editable jersey number — a player's number can change game to game, so saving it here
// updates the team's player record. Looks like plain text until hovered/focused.
function JerseyInput({ player, color, big }: { player: Player; color: string; big?: boolean }) {
  const [v, setV] = useState(player.jersey_number ?? "");
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(player.jersey_number ?? ""); }, [player.jersey_number]);
  async function save(raw: string) {
    const next = raw.trim().replace(/\s+/g, "").slice(0, 3);
    setV(next);
    if (next === (player.jersey_number ?? "")) return;
    await supabase.from("players").update({ jersey_number: next }).eq("id", player.id);
  }
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onBlur={(e) => { focused.current = false; save(e.currentTarget.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(player.jersey_number ?? ""); (e.target as HTMLInputElement).blur(); } }}
      maxLength={3}
      title="Jersey number — click to edit"
      aria-label={`${player.name} jersey number`}
      className={`clock-digits rounded border border-transparent bg-transparent text-center font-black outline-none hover:border-input focus:border-input focus:bg-background ${big ? "w-10 text-lg leading-none" : "w-9 py-0.5 text-base"}`}
      style={{ color }}
    />
  );
}

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
  const color = ink(side === "home" ? s.home_color : s.away_color);
  const team = teams.find((t) => t.id === teamId);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showSquad, setShowSquad] = useState(false);

  // Game roster (the dressed squad for this game) — stored in shared storage so it
  // syncs across the control device and the OBS displays.
  const [roster, setRoster] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    getGameRoster(s.court_id, side).then((v) => { if (active) setRoster(v); });
    return () => { active = false; };
  }, [s.court_id, side]);
  function saveRoster(ids: string[] | null) {
    setRoster(ids);
    setGameRoster(s.court_id, side, ids).catch(() => {});
  }

  // Coaches/managers are kept out of the player pool and shown separately.
  const playersOnly = players.filter((p) => !isStaff(p));
  const staff = players.filter(isStaff);
  // Player pool = chosen game roster (if any) else every player on the team.
  const pool = roster ? playersOnly.filter((p) => roster.includes(p.id)) : playersOnly;
  const onCourt = onCourtIds.map((id) => playersOnly.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const bench = pool.filter((p) => !onCourtIds.includes(p.id)).sort(byNumber);

  async function pickTeam(t: Team) {
    await assignTeamToSide(s, side, t);
    setShowTeamPicker(false);
    onSelectPlayer(null);
    saveRoster(null);    // reset game roster for the new team
    setShowSquad(true);  // prompt to choose the game roster (optional)
  }
  async function moveToCourt(p: Player) {
    if (onCourtIds.length >= 5) return;
    await setOnCourt(s, side, [...onCourtIds, p.id]);
  }
  async function moveToBench(p: Player) {
    await setOnCourt(s, side, onCourtIds.filter((id) => id !== p.id));
    if (activePlayerId === p.id) onSelectPlayer(null);
  }
  async function saveAbbr(v: string) {
    if (!teamId) return;
    await supabase.from("teams").update({ abbreviation: v.toUpperCase().slice(0, 6) }).eq("id", teamId);
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <h4 className="text-sm font-black uppercase tracking-wider">
            {side === "home" ? s.home_name : s.away_name} · Roster
          </h4>
        </div>
        <div className="flex items-center gap-1">
          {teamId && (
            <button onClick={() => setShowSquad(true)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary">
              <Users className="h-3 w-3" /> Squad{roster ? ` (${roster.length})` : ""}
            </button>
          )}
          <button onClick={() => setShowTeamPicker((v) => !v)} className="rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary">
            {teamId ? "Change team" : "Pick team"}
          </button>
        </div>
      </div>

      {teamId && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Abbr</label>
          <input
            key={team?.id}
            defaultValue={team?.abbreviation ?? ""}
            onBlur={(e) => saveAbbr(e.target.value)}
            placeholder="e.g. HHT"
            maxLength={6}
            className="w-24 rounded-md border bg-background px-2 py-1 text-xs font-bold uppercase"
          />
          <span className="text-[10px] text-muted-foreground">shown on broadcast displays (blank = full name)</span>
        </div>
      )}

      {showTeamPicker && (
        <div className="mt-3 max-h-44 overflow-y-auto rounded-md border bg-background p-2 text-xs">
          {teams.length === 0 && <p className="text-muted-foreground">No teams in library yet.</p>}
          {teams.map((t) => (
            <button key={t.id} onClick={() => pickTeam(t)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary">
              <span className="h-3 w-3 rounded" style={{ background: ink(t.primary_color) }} />
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
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">On court ({onCourt.length}/5)</p>
            <div className="mt-1 grid grid-cols-5 gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => {
                const p = onCourt[i];
                if (!p) {
                  return <div key={i} className="grid aspect-square place-items-center rounded-lg border-2 border-dashed text-[10px] text-muted-foreground">empty</div>;
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
                      <JerseyInput player={p} color={color} big />
                      <div className="mt-0.5 line-clamp-1 px-1 text-[9px] uppercase">{p.name.split(" ").slice(-1)[0]}</div>
                    </div>
                    <span onClick={(e) => { e.stopPropagation(); moveToBench(p); }} className="absolute -right-1 -top-1 hidden h-5 w-5 cursor-pointer place-items-center rounded-full bg-foreground text-background group-hover:grid" title="Bench">
                      <ArrowDown className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bench ({bench.length})</p>
              <AddPlayerButton teamId={teamId} />
            </div>
            <div className="mt-1 divide-y overflow-hidden rounded-lg border">
              {bench.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">No bench players.</p>}
              {bench.map((p) => (
                <div key={p.id} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary">
                  <JerseyInput player={p} color={color} />
                  <button
                    onClick={() => moveToCourt(p)}
                    disabled={onCourtIds.length >= 5}
                    className="flex flex-1 items-center gap-2 text-left disabled:opacity-40"
                    title="Send to court"
                  >
                    <span className="flex-1 font-semibold">{p.name}</span>
                    {p.position && <span className="text-[10px] uppercase text-muted-foreground">{p.position}</span>}
                    <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {staff.length > 0 && (
            <div className="mt-3">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Users className="h-3 w-3" /> Coaches &amp; Managers</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[...staff].sort(byNumber).map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 rounded-md border bg-secondary/40 px-2 py-1 text-[11px]">
                    <span className="font-black" style={{ color }}>{p.jersey_number}</span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-[9px] uppercase text-muted-foreground">{staffRole(p)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showSquad && teamId && (
        <SquadModal
          players={[...playersOnly].sort(byNumber)}
          selected={roster}
          color={color}
          teamName={side === "home" ? s.home_name : s.away_name}
          onClose={() => setShowSquad(false)}
          onSave={(ids) => { saveRoster(ids); setShowSquad(false); }}
        />
      )}
    </div>
  );
}

function SquadModal({
  players, selected, color, teamName, onClose, onSave,
}: {
  players: Player[];
  selected: string[] | null;
  color: string;
  teamName: string;
  onClose: () => void;
  onSave: (ids: string[] | null) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected ?? players.map((p) => p.id)));
  function toggle(id: string) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border-2 bg-card p-5 shadow-2xl" style={{ borderColor: color }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{teamName}</p>
            <h3 className="text-lg font-black">Game roster <span className="text-xs font-normal text-muted-foreground">(optional · {picked.size} selected)</span></h3>
          </div>
          <button onClick={onClose} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">✕</button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Choose who's dressed for this game — only these players appear in the roster. Saved on this device.</p>

        <div className="mt-3 flex gap-2 text-[11px]">
          <button onClick={() => setPicked(new Set(players.map((p) => p.id)))} className="rounded-md border px-2 py-1 font-semibold hover:bg-secondary">Select all</button>
          <button onClick={() => setPicked(new Set())} className="rounded-md border px-2 py-1 font-semibold hover:bg-secondary">Clear</button>
        </div>

        <div className="mt-3 flex-1 divide-y overflow-y-auto rounded-lg border">
          {players.map((p) => {
            const on = picked.has(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary">
                <span className="grid h-5 w-5 place-items-center rounded border-2 text-[10px] font-black" style={on ? { background: color, borderColor: color, color: "#fff" } : { borderColor: "#ccc", color: "transparent" }}>✓</span>
                <span className="clock-digits w-7 text-center font-black" style={{ color }}>{p.jersey_number || "—"}</span>
                <span className="flex-1 font-semibold">{p.name}</span>
                {p.position && <span className="text-[10px] uppercase text-muted-foreground">{p.position}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => onSave(null)} className="rounded-md border px-4 py-2 text-xs font-semibold hover:bg-secondary">Use full team</button>
          <button onClick={() => onSave([...picked])} className="rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background">Save roster</button>
        </div>
      </div>
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
