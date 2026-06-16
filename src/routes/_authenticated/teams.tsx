import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import type { Team } from "@/lib/game-state";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Team Library — BDC" }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [q, setQ] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.from("teams").select("*").order("created_at", { ascending: false }).then(({ data }) => setTeams(data ?? []));
  }, [refreshKey]);

  const filtered = teams.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-3xl font-black tracking-tight">Team Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">All teams with logos and photos.</p>

        <PreviewCarousel teams={teams} />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams…"
            className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm"
          />
          <TeamForm onCreated={() => setRefreshKey((k) => k + 1)} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => <TeamCard key={t.id} team={t} />)}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
        </div>
      </main>
    </div>
  );
}

function PreviewCarousel({ teams }: { teams: Team[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || teams.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % teams.length), 5000);
    return () => clearInterval(id);
  }, [paused, teams.length]);

  if (teams.length === 0) {
    return (
      <div className="mt-6 grid h-80 place-items-center rounded-3xl border-2 border-dashed bg-card text-sm text-muted-foreground">
        Add your first team to see it featured here.
      </div>
    );
  }

  const t = teams[i % teams.length];
  const bg = t.photo_url ?? t.logo_url ?? "";
  const next = () => setI((n) => (n + 1) % teams.length);
  const prev = () => setI((n) => (n - 1 + teams.length) % teams.length);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="mt-6 overflow-hidden rounded-3xl border bg-card shadow-sm"
    >
      <div className="grid md:grid-cols-2">
        <div className="flex flex-col justify-center gap-4 p-8" style={{ background: `linear-gradient(135deg, ${t.primary_color}22, transparent)` }}>
          {t.logo_url && <img src={t.logo_url} alt="" className="h-20 w-20 rounded-xl border bg-white object-contain" />}
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Featured team</p>
            <h2 className="mt-1 text-3xl font-black" style={{ color: t.primary_color }}>{t.name}</h2>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{t.abbreviation}</p>
          </div>
          {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
        </div>
        <div className="relative aspect-video bg-secondary md:aspect-auto">
          {bg ? (
            <img key={t.id} src={bg} alt={t.name} className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">No photo</div>
          )}
          <button onClick={prev} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-background/80 backdrop-blur"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={next} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-background/80 backdrop-blur"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {teams.map((_, idx) => (
              <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-foreground" : "w-1.5 bg-foreground/40"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ team }: { team: Team }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        {team.logo_url ? <img src={team.logo_url} alt="" className="h-12 w-12 rounded-lg border bg-white object-contain" /> : <div className="h-12 w-12 rounded-lg" style={{ background: team.primary_color }} />}
        <div className="min-w-0">
          <h3 className="truncate font-bold" style={{ color: team.primary_color }}>{team.name}</h3>
          <p className="text-xs text-muted-foreground">{team.abbreviation}</p>
        </div>
      </div>
      {team.photo_url && <img src={team.photo_url} alt="" className="mt-3 aspect-video w-full rounded-lg object-cover" />}
    </div>
  );
}

function TeamForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [color, setColor] = useState("#1e3a8a");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadFile(bucket: string, file: File) {
    const path = `${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const logo_url = logoFile ? await uploadFile("team-logos", logoFile) : null;
      const photo_url = photoFile ? await uploadFile("team-photos", photoFile) : null;
      const { error } = await supabase.from("teams").insert({
        name, abbreviation: abbr || name.slice(0, 3).toUpperCase(), primary_color: color, logo_url, photo_url,
      });
      if (error) throw error;
      toast.success("Team added");
      setOpen(false); setName(""); setAbbr(""); setColor("#1e3a8a"); setLogoFile(null); setPhotoFile(null);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setBusy(false); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background">+ Add team</button>;
  }

  return (
    <form onSubmit={submit} className="w-full rounded-xl border bg-card p-4 md:max-w-md">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="col-span-2"><span className="font-semibold">Name</span><input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5" /></label>
        <label><span className="font-semibold">Abbreviation</span><input value={abbr} onChange={(e) => setAbbr(e.target.value)} maxLength={4} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 uppercase" /></label>
        <label><span className="font-semibold">Color</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-9 w-full rounded-md border" /></label>
        <label><span className="font-semibold">Logo</span><input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-[10px]" /></label>
        <label><span className="font-semibold">Photo</span><input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-[10px]" /></label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-50">{busy ? "Saving…" : "Save team"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-4 py-2 text-xs font-medium">Cancel</button>
      </div>
    </form>
  );
}
