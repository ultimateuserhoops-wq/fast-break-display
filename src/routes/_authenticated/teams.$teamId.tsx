import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import { usePlayers, addPlayerToTeam, isStaff, staffRole, type Team } from "@/lib/game-state";
import { toast } from "sonner";
import { ArrowLeft, Trash2, ImagePlus, AlertTriangle } from "lucide-react";
import { ink } from "@/lib/color";

export const Route = createFileRoute("/_authenticated/teams/$teamId")({
  head: () => ({ meta: [{ title: "Team Roster — BDC" }] }),
  component: TeamPlayersPage,
});

function TeamPlayersPage() {
  const { teamId } = Route.useParams();
  const [team, setTeam] = useState<Team | null>(null);
  const players = usePlayers(teamId);
  const playersOnly = players.filter((p) => !isStaff(p));
  const staff = players.filter(isStaff);
  // Jersey numbers must be unique within a team — flag any that repeat.
  const numCounts = playersOnly.reduce<Record<string, number>>((m, p) => { const n = (p.jersey_number || "").trim(); if (n) m[n] = (m[n] || 0) + 1; return m; }, {});
  const dupNumbers = new Set(Object.keys(numCounts).filter((n) => numCounts[n] > 1));
  const takenNumbers = new Set(playersOnly.map((p) => (p.jersey_number || "").trim()).filter(Boolean));

  useEffect(() => {
    supabase.from("teams").select("*").eq("id", teamId).maybeSingle().then(({ data }) => setTeam(data));
  }, [teamId]);

  async function removePlayer(id: string, name: string) {
    if (!confirm(`Remove ${name} from this team?`)) return;
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Player removed");
  }

  async function uploadPhoto(playerId: string, file: File) {
    try {
      const path = `${playerId}-${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
      const { error: upErr } = await supabase.storage.from("player-photos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from("player-photos").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("players").update({ photo_url: url }).eq("id", playerId);
      if (error) throw error;
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const color = ink(team?.primary_color, "#1e3a8a");

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Link to="/teams" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Team Library
        </Link>

        <div className="mt-4 flex items-center gap-4">
          {team?.logo_url
            ? <img src={team.logo_url} alt="" className="h-16 w-16 rounded-xl border bg-white object-contain" />
            : <div className="h-16 w-16 rounded-xl" style={{ background: color }} />}
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color }}>{team?.name ?? "Team"}</h1>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {team?.abbreviation} · {playersOnly.length} player{playersOnly.length === 1 ? "" : "s"}{staff.length > 0 ? ` · ${staff.length} staff` : ""}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wider">Roster</h2>
          </div>

          <div className="divide-y">
            {playersOnly.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No players yet. Add the first one below.</p>
            )}
            {playersOnly.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                {p.photo_url
                  ? <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full border object-cover" />
                  : <div className="grid h-10 w-10 place-items-center rounded-full text-sm font-black text-white" style={{ background: color }}>{p.jersey_number || "—"}</div>}
                <div className="w-10 text-center">
                  <span className="clock-digits text-lg font-black" style={{ color }}>{p.jersey_number || "—"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold">
                    {p.name}
                    {dupNumbers.has((p.jersey_number || "").trim()) && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600" title={`Number ${p.jersey_number} is used by more than one player`}><AlertTriangle className="h-3 w-3" /> Duplicate #</span>
                    )}
                  </p>
                  {p.position && <p className="text-[11px] uppercase text-muted-foreground">{p.position}</p>}
                </div>
                <label className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary" title="Upload player photo">
                  <ImagePlus className="h-3.5 w-3.5" /> Photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(p.id, f); e.currentTarget.value = ""; }} />
                </label>
                <button onClick={() => removePlayer(p.id, p.name)} className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground" title="Remove player">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <AddPlayerForm teamId={teamId} takenNumbers={takenNumbers} />
        </div>

        {staff.length > 0 && (
          <div className="mt-6 rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-black uppercase tracking-wider">Coaches &amp; Managers</h2>
            </div>
            <div className="divide-y">
              {staff.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  {p.photo_url
                    ? <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full border object-cover" />
                    : <div className="grid h-10 w-10 place-items-center rounded-full text-xs font-black text-white" style={{ background: color }}>{(p.jersey_number || "").toUpperCase()}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-[11px] uppercase text-muted-foreground">{staffRole(p)}</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-secondary" title="Upload photo">
                    <ImagePlus className="h-3.5 w-3.5" /> Photo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(p.id, f); e.currentTarget.value = ""; }} />
                  </label>
                  <button onClick={() => removePlayer(p.id, p.name)} className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          Tip: to add a coach or manager, use the add form above with number <b>C</b> (head coach), <b>AC</b> (assistant coach), or <b>MGR</b> (manager).
        </p>
      </main>
    </div>
  );
}

function AddPlayerForm({ teamId, takenNumbers }: { teamId: string; takenNumbers: Set<string> }) {
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [pos, setPos] = useState("");
  const [busy, setBusy] = useState(false);
  const dup = num.trim() !== "" && takenNumbers.has(num.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (dup && !confirm(`Number ${num.trim()} is already used on this team. Add ${name.trim()} anyway?`)) return;
    setBusy(true);
    try {
      await addPlayerToTeam(teamId, { name: name.trim(), jersey_number: num.trim(), position: pos.trim() });
      setName(""); setNum(""); setPos("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t bg-secondary/30 px-4 py-3 text-xs">
      <label className="w-16"><span className="font-semibold">#</span><input value={num} onChange={(e) => setNum(e.target.value)} maxLength={3} className={`mt-1 w-full rounded-md border bg-background px-2 py-1.5 ${dup ? "border-amber-500 ring-1 ring-amber-500" : ""}`} /></label>
      <label className="min-w-[10rem] flex-1"><span className="font-semibold">Player name</span><input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5" /></label>
      <label className="w-20"><span className="font-semibold">Pos</span><input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="PG" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 uppercase" /></label>
      <button type="submit" disabled={busy} className="rounded-md bg-foreground px-4 py-2 font-bold text-background disabled:opacity-50">{busy ? "Adding…" : "+ Add player"}</button>
      {dup && <p className="flex w-full items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> Number {num.trim()} is already on this team.</p>}
    </form>
  );
}
