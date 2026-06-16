import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import type { Tournament } from "@/lib/game-state";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tournaments")({
  head: () => ({ meta: [{ title: "Tournaments — BDC" }] }),
  component: TournamentsPage,
});

function TournamentsPage() {
  const [list, setList] = useState<Tournament[]>([]);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    supabase.from("tournaments").select("*").order("created_at", { ascending: false }).then(({ data }) => setList(data ?? []));
  }, [tick]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("tournaments").insert({
      name, start_date: start || null, end_date: end || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Tournament added");
    setName(""); setStart(""); setEnd(""); setTick((t) => t + 1);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-black tracking-tight">Tournament Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage tournaments and link teams.</p>

        <form onSubmit={add} className="mt-6 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_auto_auto_auto]">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournament name" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md bg-foreground px-4 py-2 text-sm font-bold text-background">Add</button>
        </form>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {list.map((t) => (
            <div key={t.id} className="rounded-2xl border bg-card p-4">
              <h3 className="font-bold">{t.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t.start_date ?? "—"} → {t.end_date ?? "—"}</p>
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-muted-foreground">No tournaments yet.</p>}
        </div>
      </main>
    </div>
  );
}
