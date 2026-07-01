import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import { useTeams, type Tournament, type Team } from "@/lib/game-state";
import {
  buildSlots, elimRounds, roundRobinRounds, drawInto, schedulableMatches,
  buildGroupSlots, groupKnockoutRounds, groupName,
  type Slot, type Round, type Match, type Format,
} from "@/lib/bracket";
import { autoSchedule } from "@/lib/schedule";
import { ink } from "@/lib/color";
import { fetchEventResults, bdcseaReadable, type ResultMatch } from "@/lib/bdcsea-read";
import { printSheet, imageSheet, esc } from "@/lib/export-sheet";
import { Download, Printer, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Sparkles, Trophy, ChevronDown, Upload, Plus, Trash2, Shuffle, CalendarClock, Lock } from "lucide-react";

const CLOUD_HOSTS = ["workers.dev", "lovable.app", "lovable.dev"];
const FORMATS: [Format, string][] = [["single_elim", "Single elimination"], ["round_robin", "Round robin"], ["groups_knockout", "Groups → knockout"]];
const fmtLabel = (f?: string | null) => FORMATS.find(([v]) => v === f)?.[1] ?? f ?? "—";

type Seed = { name: string; seed: number };
type Division = {
  id: string; name: string; format: Format;
  entrants: number;
  seeds: Seed[];          // locked, protected positions
  pool: string[];         // unseeded teams to draw (may be short → placeholders)
  logos?: Record<string, string>; // team name → logo url (for the visual draw)
  groupCount?: number; teamsPerGroup?: number; advancePerGroup?: number; // groups_knockout
  consolation?: boolean;  // groups_knockout: also build a 2nd-tier (Division 2) bracket for the lower ranks
  earliestDate?: string;  // this division's games may not be scheduled before this date (e.g. U10 starts day 2)
  maxPerDay?: number;     // cap games/team/day for this division (e.g. girls = 1, never twice a day)
  slots?: Slot[];         // single-elim / group grid after build/draw
  rounds?: Round[];       // current bracket
  drawn: boolean;
};
type ScheduleCfg = { courts: string[]; dates: string[]; startDate?: string; endDate?: string; dayStart: string; dayEnd: string; sessions?: { start: string; end: string }[]; dayOverrides?: Record<string, { courts?: string[]; sessions?: { start: string; end: string }[] }>; divisionStart?: Record<string, string>; divisionMaxPerDay?: Record<string, number>; slotMin: number; restMin: number; maxPerDay: number };
type MultiData = { kind: "multi"; divisions: Division[]; schedule?: ScheduleCfg; liveByCourt?: Record<string, string> };

const DEFAULT_SCHED: ScheduleCfg = { courts: ["Court 1", "Court 2"], dates: [], startDate: "", endDate: "", dayStart: "09:00", dayEnd: "18:00", slotMin: 40, restMin: 60, maxPerDay: 2 };
const uid = () => Math.random().toString(36).slice(2, 9);

/** Expand an inclusive YYYY-MM-DD date range into individual dates (capped at 60 days). */
function expandDates(start?: string, end?: string): string[] {
  if (!start) return [];
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; // local, no UTC shift
  const s = new Date(start + "T00:00:00"), e = new Date((end || start) + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [start];
  const out: string[] = [];
  for (let d = new Date(s); d <= e && out.length < 60; d.setDate(d.getDate() + 1)) out.push(fmt(d));
  return out;
}

function buildRounds(d: Division): { slots?: Slot[]; rounds: Round[] } {
  if (d.format === "groups_knockout") {
    const tpg = d.teamsPerGroup || 3, adv = d.advancePerGroup || 2;
    const slots = buildGroupSlots({ groupCount: d.groupCount || 2, teamsPerGroup: tpg, seeds: d.seeds });
    return { slots, rounds: groupKnockoutRounds(slots, tpg, adv, { consolation: d.consolation }) };
  }
  if (d.format === "round_robin") {
    const members = [...d.seeds.sort((a, b) => a.seed - b.seed).map((s) => s.name), ...d.pool];
    const named = members.length ? members : Array.from({ length: d.entrants }, (_, i) => `Team ${i + 1}`);
    return { rounds: roundRobinRounds(named) };
  }
  const slots = buildSlots({ entrants: d.entrants, seeds: d.seeds });
  return { slots, rounds: elimRounds(slots) };
}

export const Route = createFileRoute("/_authenticated/tournaments")({
  head: () => ({ meta: [{ title: "Tournaments — BDC" }] }),
  component: TournamentsPage,
});

function TournamentsPage() {
  const onGateway = typeof window !== "undefined" && !CLOUD_HOSTS.some((h) => window.location.hostname.endsWith(h));
  const teams = useTeams();
  const [rows, setRows] = useState<Tournament[]>([]);
  const [models, setModels] = useState<Record<string, MultiData>>({}); // optimistic working copies
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tab, setTab] = useState<"setup" | "schedule" | "table">("setup");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    supabase.from("tournaments").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      const list = (data ?? []) as Tournament[];
      setRows(list);
      const m: Record<string, MultiData> = {};
      for (const t of list) { const d = (t as unknown as { data?: MultiData }).data; if (d?.kind === "multi") m[t.id] = d; }
      setModels(m);
      setCurrentId((cur) => (cur && m[cur] ? cur : Object.keys(m)[0] ?? null));
    });
  }, [tick]);

  async function persist(id: string, next: MultiData) {
    setModels((m) => ({ ...m, [id]: next }));
    const { error } = await supabase.from("tournaments").update({ data: next } as never).eq("id", id);
    if (error) toast.error(error.message);
  }
  async function remove(id: string, name: string) {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${name}”? It will be removed from Setup, Schedule and Table.`)) return;
    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
    setModels((m) => { const c = { ...m }; delete c[id]; return c; });
    setCurrentId((cur) => (cur === id ? null : cur));
    toast.success("Tournament deleted");
  }

  const multiRows = rows.filter((t) => models[t.id]);
  const legacyRows = rows.filter((t) => !models[t.id]);
  const current = currentId ? models[currentId] : null;
  const currentName = rows.find((t) => t.id === currentId)?.name;
  const TABS: [typeof tab, string][] = [["setup", "Setup"], ["schedule", "Schedule"], ["table", "Table"]];

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight"><Trophy className="h-7 w-7" /> Tournament Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set up multi-division events, then view the schedule and tables — placeholders show until each division’s draw is held.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {TABS.map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={`rounded-md px-3 py-1.5 text-sm font-bold ${tab === v ? "bg-foreground text-background" : "hover:bg-secondary"}`}>{l}</button>)}
          </div>
          {tab !== "setup" && multiRows.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">Tournament
              <select value={currentId ?? ""} onChange={(e) => setCurrentId(e.target.value)} className="rounded-md border bg-card px-3 py-1.5 text-sm font-bold text-foreground">
                {multiRows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {tab === "setup" && (
          <>
            <EventBuilder teams={teams} onSaved={() => setTick((t) => t + 1)} />
            <div className="mt-8 space-y-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Saved tournaments</h2>
              {multiRows.map((t) => (
                <EventCard key={t.id} t={t} model={models[t.id]} teams={teams} onGateway={onGateway}
                  persist={(next) => persist(t.id, next)} onDelete={() => remove(t.id, t.name)}
                  isCurrent={t.id === currentId} onSelect={() => setCurrentId(t.id)} />
              ))}
              {legacyRows.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-2xl border bg-card p-4">
                  <div><h3 className="font-black">{t.name}</h3><p className="text-xs text-muted-foreground">{t.start_date ?? "—"} → {t.end_date ?? "—"}</p></div>
                  <button onClick={() => remove(t.id, t.name)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
              ))}
              {!multiRows.length && !legacyRows.length && <p className="text-sm text-muted-foreground">No tournaments yet.</p>}
            </div>
          </>
        )}

        {tab === "schedule" && (current ? <ScheduleView multi={current} eventName={currentName} onApply={(next) => persist(currentId!, next)} /> : <p className="mt-8 text-sm text-muted-foreground">Create or select a tournament in Setup first.</p>)}
        {tab === "table" && (current ? <TableView multi={current} eventName={currentName} /> : <p className="mt-8 text-sm text-muted-foreground">Create or select a tournament in Setup first.</p>)}
      </main>
    </div>
  );
}

/* ---------- Create ---------- */
function EventBuilder({ teams, onSaved }: { teams: Team[]; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [divs, setDivs] = useState<Division[]>([]);
  const addDiv = () => setDivs((d) => [...d, { id: uid(), name: `Division ${d.length + 1}`, format: "single_elim", entrants: 8, seeds: [], pool: [], drawn: false }]);
  const patch = (id: string, p: Partial<Division>) => setDivs((d) => d.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const del = (id: string) => setDivs((d) => d.filter((x) => x.id !== id));

  async function save() {
    if (!name.trim()) return toast.error("Name the event");
    if (!divs.length) return toast.error("Add at least one age group / division");
    const built = divs.map((d) => ({ ...d, ...buildRounds(d) }));
    const data: MultiData = { kind: "multi", divisions: built, schedule: { ...DEFAULT_SCHED } };
    const { error } = await supabase.from("tournaments").insert({ name: name.trim(), format: "multi", status: "scheduled", data } as never);
    if (error) return toast.error(error.message);
    toast.success("Tournament created"); setName(""); setDivs([]); onSaved();
  }

  return (
    <div className="mt-6 rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-black"><Plus className="h-4 w-4" /> New tournament</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name (e.g. Summer Cup 2026)" className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm" />

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Age groups / divisions</p>
      <div className="mt-1 space-y-3">
        {divs.map((d) => <DivisionEditor key={d.id} d={d} teams={teams} onPatch={(p) => patch(d.id, p)} onDelete={() => del(d.id)} />)}
      </div>
      <button onClick={addDiv} className="mt-3 flex items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-2 text-sm font-bold hover:bg-secondary"><Plus className="h-4 w-4" /> Add a division</button>

      <div className="mt-4">
        <button onClick={save} disabled={!divs.length} className={`rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background ${!divs.length ? "opacity-40" : "hover:opacity-90"}`}>Create tournament</button>
      </div>
    </div>
  );
}

function DivisionEditor({ d, teams, onPatch, onDelete }: { d: Division; teams: Team[]; onPatch: (p: Partial<Division>) => void; onDelete: () => void }) {
  const [placeholder, setPlaceholder] = useState(d.pool.length === 0 && d.seeds.length === 0);
  const poolText = d.pool.join(", ");
  const seedText = d.seeds.map((s) => s.name).join(", ");

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2">
        <input value={d.name} onChange={(e) => onPatch({ name: e.target.value })} className="flex-1 rounded-md border bg-card px-2.5 py-1.5 text-sm font-bold" />
        <select value={d.format} onChange={(e) => { const f = e.target.value as Format; if (f === "groups_knockout") { const g = d.groupCount ?? 2, t = d.teamsPerGroup ?? 3; onPatch({ format: f, groupCount: g, teamsPerGroup: t, advancePerGroup: d.advancePerGroup ?? 2, entrants: g * t }); } else onPatch({ format: f }); }} className="rounded-md border bg-card px-2 py-1.5 text-xs font-semibold">
          {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={onDelete} className="rounded-md border p-1.5 text-muted-foreground hover:bg-secondary"><Trash2 className="h-4 w-4" /></button>
      </div>

      {d.format === "groups_knockout" ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <label className="font-semibold text-muted-foreground">Groups
            <input type="number" min={2} max={8} value={d.groupCount ?? 2} onChange={(e) => { const g = Math.max(2, +e.target.value || 2); onPatch({ groupCount: g, entrants: g * (d.teamsPerGroup ?? 3) }); }} className="mt-1 w-full rounded-md border bg-card px-2 py-1 text-sm" /></label>
          <label className="font-semibold text-muted-foreground">Teams / group
            <input type="number" min={2} max={12} value={d.teamsPerGroup ?? 3} onChange={(e) => { const t = Math.max(2, +e.target.value || 2); onPatch({ teamsPerGroup: t, entrants: (d.groupCount ?? 2) * t }); }} className="mt-1 w-full rounded-md border bg-card px-2 py-1 text-sm" /></label>
          <label className="font-semibold text-muted-foreground">Advance / group
            <input type="number" min={1} max={d.teamsPerGroup ?? 3} value={d.advancePerGroup ?? 2} onChange={(e) => onPatch({ advancePerGroup: Math.max(1, +e.target.value || 1) })} className="mt-1 w-full rounded-md border bg-card px-2 py-1 text-sm" /></label>
          <p className="col-span-3 text-[11px] text-muted-foreground">{d.groupCount ?? 2} groups × {d.teamsPerGroup ?? 3} = <b>{(d.groupCount ?? 2) * (d.teamsPerGroup ?? 3)} teams</b>; top {d.advancePerGroup ?? 2} of each → knockout ({(d.groupCount ?? 2) * (d.advancePerGroup ?? 2)} teams).</p>
          <label className="col-span-3 flex items-center gap-1.5 text-[11px] font-semibold">
            <input type="checkbox" checked={!!d.consolation} onChange={(e) => onPatch({ consolation: e.target.checked })} />
            Also run a <b>Division 2</b> bracket for the next {d.advancePerGroup ?? 2}/group (e.g. 3rd &amp; 4th place)
          </label>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <label className="font-semibold text-muted-foreground">Teams</label>
          <input type="number" min={2} max={64} value={d.entrants} onChange={(e) => onPatch({ entrants: Math.max(2, +e.target.value || 2) })} className="w-16 rounded-md border bg-card px-2 py-1 text-sm" />
          <label className="ml-2 flex items-center gap-1.5 font-semibold">
            <input type="checkbox" checked={placeholder} onChange={(e) => { setPlaceholder(e.target.checked); if (e.target.checked) onPatch({ pool: [] }); }} />
            Placeholder (draw teams later)
          </label>
        </div>
      )}

      <div className="mt-2 grid gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seeded teams (optional — locked to protected slots), comma-separated, strongest first</p>
          <input defaultValue={seedText} onBlur={(e) => onPatch({ seeds: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).map((name, i) => ({ name, seed: i + 1 })) })}
            placeholder="e.g. Lakers, Celtics" className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-sm" />
        </div>
        {!placeholder && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Other teams (the draw pool), comma-separated</p>
            <input defaultValue={poolText} onBlur={(e) => onPatch({ pool: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              placeholder="e.g. Bulls, Heat, Suns…" className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-sm" />
            {teams.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {teams.slice(0, 24).map((t) => (
                  <button key={t.id} onClick={() => { if (!d.pool.includes(t.name) && !d.seeds.some((s) => s.name === t.name)) onPatch({ pool: [...d.pool, t.name] }); }}
                    className="rounded border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-secondary">+ {t.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {placeholder && <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-600">{d.entrants} placeholder slots — fill them in the Drawing Room after creating.</p>}
      </div>
    </div>
  );
}

/* ---------- Saved event card (Setup tab) ---------- */
function EventCard({ t, model, teams, onGateway, persist, onDelete, isCurrent, onSelect }: { t: Tournament; model: MultiData; teams: Team[]; onGateway: boolean; persist: (d: MultiData) => void; onDelete: () => void; isCurrent: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const [drawDiv, setDrawDiv] = useState<string | null>(null);
  const [drawPick, setDrawPick] = useState(false);
  const [pub, setPub] = useState(false);
  const multi = model;

  const totalMatches = multi.divisions.reduce((n, d) => n + schedulableMatches(d.id, d.rounds ?? []).length, 0);
  const scheduledCount = multi.divisions.reduce((n, d) => n + (d.rounds ?? []).reduce((k, r) => k + r.matches.filter((m) => m.time).length, 0), 0);

  async function publishAll() {
    setPub(true);
    try {
      let totMatches = 0, totTeams = 0;
      for (const d of multi!.divisions) {
        const lib = new Map(teams.map((x) => [x.name.trim().toLowerCase(), x]));
        const names = [...new Set((d.rounds ?? []).flatMap((r) => r.matches.flatMap((m) => [m.home, m.away])))].filter((n) => n && n !== "(bye)" && !/^Winner|^Slot |^Group /.test(n));
        const payloadTeams = names.map((n) => { const m = lib.get(n.trim().toLowerCase()); return { name: n, abbrev: m?.abbreviation ?? null, color: m?.primary_color ?? null }; });
        const res = await fetch(`${window.location.origin}/__gateway/publish-bdcsea`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: `${t.name} — ${d.name}`, format: d.format, teams: payloadTeams, rounds: d.rounds }),
        });
        const r = await res.json();
        if (!res.ok) throw new Error(`${d.name}: ${r.error || res.status}`);
        totMatches += r.createdMatches ?? 0; totTeams += r.createdTeams ?? 0;
      }
      toast.success(`Published to BDCSEA — ${totMatches} matches, ${totTeams} new team(s) across ${multi!.divisions.length} division(s)`);
    } catch (e) { toast.error((e as Error).message); } finally { setPub(false); }
  }

  return (
    <div className={`rounded-2xl border bg-card p-4 ${isCurrent ? "ring-2 ring-foreground" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <button onClick={onSelect} className="min-w-0 text-left">
          <h3 className="flex items-center gap-2 font-black">{t.name}{isCurrent ? <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">current</span> : <span className="text-[10px] font-semibold text-muted-foreground">(tap to select)</span>}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{multi.divisions.length} division(s) · {totalMatches} match(es) · {scheduledCount}/{totalMatches} scheduled</p>
        </button>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => { if (multi.divisions.length === 1) setDrawDiv(multi.divisions[0].id); else setDrawPick((v) => !v); }} className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-xs font-bold text-background hover:opacity-90"><Shuffle className="h-3.5 w-3.5" /> Draw</button>
          <button onClick={() => { if (multi.divisions.length === 1) setDrawDiv(multi.divisions[0].id); else setDrawPick((v) => !v); }} title="Reopen the drawing room to redraw a division" className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-secondary"><Shuffle className="h-3.5 w-3.5" /> Redraw</button>
          <button onClick={publishAll} disabled={!onGateway || pub} title={onGateway ? "Publish all divisions to BDCSEA" : "Open via the gateway to publish"} className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${(!onGateway || pub) ? "opacity-40" : "hover:bg-secondary"}`}><Upload className="h-3.5 w-3.5" /> {pub ? "…" : "BDCSEA"}</button>
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-secondary">Divisions <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
          <button onClick={onDelete} title="Delete tournament" className="rounded-md border p-1.5 text-red-600 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {drawPick && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Draw which division:</span>
          {multi.divisions.map((d) => (
            <button key={d.id} onClick={() => { setDrawDiv(d.id); setDrawPick(false); }} className="rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary">{d.name}{d.drawn ? " ✓" : ""}</button>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-4">
          {multi.divisions.map((d) => (
            <div key={d.id} className="rounded-xl border p-3">
              <p className="font-black">{d.name} <span className="ml-1 text-[11px] font-semibold text-muted-foreground">· {fmtLabel(d.format)} · {d.entrants} teams{d.drawn ? " · drawn ✓" : ""}</span></p>
              <BracketView rounds={d.rounds ?? []} />
            </div>
          ))}
        </div>
      )}

      {drawDiv && (() => {
        const d = multi.divisions.find((x) => x.id === drawDiv);
        return d ? (
          <DrawingRoom
            division={d}
            teams={teams}
            onClose={() => setDrawDiv(null)}
            onSave={(nd) => { persist({ ...multi, divisions: multi.divisions.map((x) => (x.id === d.id ? nd : x)) }); setDrawDiv(null); }}
          />
        ) : null;
      })()}
    </div>
  );
}

/* ---------- Export (PDF / PNG) ---------- */
function metaLine(multi: MultiData, eventName?: string): string {
  const s = multi.schedule;
  const range = s?.startDate ? `${esc(s.startDate)} – ${esc(s.endDate ?? s.startDate)}` : "";
  const courts = s?.courts?.length ? `Courts: ${esc(s.courts.join(", "))}` : "";
  return [esc(eventName), `${multi.divisions.length} divisions`, range, courts].filter(Boolean).join(" &nbsp;·&nbsp; ");
}
function scheduleBodyHtml(multi: MultiData, results: Record<string, ResultMatch[]> = {}): string {
  const rows = multi.divisions.flatMap((d) => (d.rounds ?? []).flatMap((r) => r.matches.filter((m) => m.time).map((m) => ({ division: d.name, round: r.name, home: m.home, away: m.away, court: m.court ?? "", date: m.date ?? "", time: m.time!, note: m.note ?? "" }))));
  if (!rows.length) return `<p style="margin-top:16px;color:#6b7280">No schedule yet — run Auto-schedule first.</p>`;
  const byDate: Record<string, typeof rows> = {};
  for (const r of rows) (byDate[r.date] ||= []).push(r);
  return Object.keys(byDate).sort().map((date, i) => {
    const trs = byDate[date].sort((a, b) => (a.time + a.court).localeCompare(b.time + b.court))
      .map((m) => {
        const res = resultFor(results, m.division, m.round, m.home, m.away);
        return `<tr><td class="tt">${esc(m.time)}</td><td>${esc(m.court)}</td><td>${esc(m.division)}</td><td>${esc(m.round)}</td><td class="tm" style="text-align:right">${esc(m.home)}</td><td class="c tt">${res ? esc(res) : '<span class="vs">vs</span>'}</td><td class="tm">${esc(m.away)}</td><td>${esc(m.note)}</td></tr>`;
      }).join("");
    return `<div class="daygrp"><h2>Day ${i + 1} · ${esc(date || "Date TBD")} — ${esc(phaseLabel(byDate[date]))}</h2><table><thead><tr><th>Time</th><th>Court</th><th>Category</th><th>Round</th><th style="text-align:right">Team A</th><th class="c">Result</th><th>Team B</th><th>Note</th></tr></thead><tbody>${trs}</tbody></table></div>`;
  }).join("");
}
function tableBodyHtml(multi: MultiData, results: Record<string, ResultMatch[]>): string {
  return multi.divisions.map((d) => {
    const rounds = d.rounds ?? [];
    const groupRounds = rounds.filter((r) => /^Group /.test(r.name) || r.name === "Round robin");
    const koRounds = rounds.filter((r) => !groupRounds.includes(r));
    const dm = results[d.name] ?? [];
    const grpHtml = groupRounds.map((r) => {
      const rec = new Map<string, { p: number; w: number; l: number; pf: number; pa: number }>();
      const g = (n: string) => rec.get(n) ?? { p: 0, w: 0, l: 0, pf: 0, pa: 0 };
      for (const m of dm.filter((mm) => mm.round === r.name)) {
        const h = g(m.home), a = g(m.away); h.p++; a.p++; h.pf += m.hs; h.pa += m.as; a.pf += m.as; a.pa += m.hs;
        if (m.hs > m.as) { h.w++; a.l++; } else if (m.as > m.hs) { a.w++; h.l++; }
        rec.set(m.home, h); rec.set(m.away, a);
      }
      const teams = [...new Set(r.matches.flatMap((m) => [m.home, m.away]).filter((x) => x && x !== "(bye)"))];
      const ranked = teams.map((t) => ({ t, ...g(t) })).sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa) || a.t.localeCompare(b.t));
      const trs = ranked.map((x) => `<tr><td class="tm">${esc(x.t)}</td><td class="c">${x.p}</td><td class="c">${x.w}</td><td class="c">${x.l}</td><td class="c">${x.pf}</td><td class="c">${x.pa}</td></tr>`).join("");
      return `<div class="grp"><div class="gh">${esc(r.name)}</div><table><thead><tr><th>Team</th><th class="c">P</th><th class="c">W</th><th class="c">L</th><th class="c">PF</th><th class="c">PA</th></tr></thead><tbody>${trs}</tbody></table></div>`;
    }).join("");
    const koHtml = koRounds.length ? `<div class="ko">${koRounds.map((r) => `<div class="kr">${esc(r.name)}</div>${r.matches.map((m) => `<div class="km"><span>${esc(m.home)}</span><span class="vs">${m.time ? esc(`${m.time} · ${m.court ?? ""}`) : "vs"}</span><span>${esc(m.away)}</span></div>`).join("")}`).join("")}</div>` : "";
    return `<div class="divblk"><h3>${esc(d.name)} <span style="font-size:12px;font-weight:600;color:#6b7280">· ${esc(fmtLabel(d.format))}</span></h3><div class="grpwrap">${grpHtml}</div>${koHtml}</div>`;
  }).join("");
}
/* ---------- Manual drag-and-drop schedule editor ---------- */
function enumerateSlots(s: ScheduleCfg): { date: string; time: string; court: string }[] {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const dates = s.dates?.length ? s.dates : expandDates(s.startDate, s.endDate);
  const slotMin = s.slotMin ?? 70;
  const out: { date: string; time: string; court: string }[] = [];
  for (const date of dates) {
    const ov = s.dayOverrides?.[date];
    const sessions = ov?.sessions?.length ? ov.sessions : (s.sessions?.length ? s.sessions : [{ start: s.dayStart || "08:00", end: s.dayEnd || "18:00" }]);
    const courts = ov?.courts?.length ? ov.courts : (s.courts?.length ? s.courts : ["Court 1"]);
    for (const sess of sessions) { const a = toMin(sess.start), b = toMin(sess.end); for (let t = a; t + slotMin <= b + 1; t += slotMin) for (const c of courts) out.push({ date, time: toHHMM(t), court: c }); }
  }
  return out;
}

function ScheduleEditor({ multi, onSave, onCancel }: { multi: MultiData; onSave: (d: MultiData) => void; onCancel: () => void }) {
  type Pos = { date: string; time: string; court: string; note: string };
  const info = useMemo(() => {
    const g: Record<string, { division: string; home: string; away: string }> = {};
    const init: Record<string, Pos> = {};
    for (const d of multi.divisions) (d.rounds ?? []).forEach((r) => r.matches.forEach((m, i) => {
      if (!m.time) return;
      const key = `${d.id}:${r.name}:${i}`;
      g[key] = { division: d.name, home: m.home, away: m.away };
      init[key] = { date: m.date ?? "", time: m.time, court: m.court ?? "", note: m.note ?? "" };
    }));
    return { g, init };
  }, [multi]);
  const [pos, setPos] = useState<Record<string, Pos>>(() => ({ ...info.init }));
  const [drag, setDrag] = useState<string | null>(null);
  const baseSlots = useMemo(() => enumerateSlots(multi.schedule ?? DEFAULT_SCHED), [multi]);
  const courts = useMemo(() => [...new Set([...baseSlots.map((s) => s.court), ...Object.values(pos).map((p) => p.court)].filter(Boolean))], [baseSlots, pos]);
  const dates = useMemo(() => {
    const set = new Set<string>();
    for (const s of baseSlots) set.add(s.date);
    for (const k in pos) if (pos[k].date) set.add(pos[k].date);
    return [...set].sort();
  }, [baseSlots, pos]);
  const conflict = useMemo(() => {
    const bad = new Set<string>(); const team: Record<string, string> = {}; const court: Record<string, string> = {};
    for (const k in pos) {
      const p = pos[k], gi = info.g[k]; if (!gi) continue;
      const cs = `${p.date}|${p.time}|${p.court}`; if (court[cs]) { bad.add(k); bad.add(court[cs]); } else court[cs] = k; // court double-book (same court, same time)
      for (const t of [gi.home, gi.away]) { if (!t || t === "(bye)") continue; const ts = `${p.date}|${p.time}|${gi.division}|${t}`; if (team[ts]) { bad.add(k); bad.add(team[ts]); } else team[ts] = k; } // team clash (division-scoped)
    }
    return bad;
  }, [pos, info]);

  const colGames = (date: string, courtName: string) => Object.keys(pos).filter((k) => pos[k].date === date && pos[k].court === courtName).sort((a, b) => pos[a].time.localeCompare(pos[b].time));
  const setTime = (gk: string, t: string) => { if (!t) return; setPos((p) => ({ ...p, [gk]: { ...p[gk], time: t } })); };
  const setNote = (gk: string, n: string) => setPos((p) => ({ ...p, [gk]: { ...p[gk], note: n } }));
  const moveToCourt = (date: string, courtName: string) => { if (!drag) return; setPos((p) => ({ ...p, [drag]: { ...p[drag], date, court: courtName } })); setDrag(null); };
  function save() {
    const divisions = multi.divisions.map((d) => ({ ...d, rounds: (d.rounds ?? []).map((r) => ({ ...r, matches: r.matches.map((m, i) => { const p = pos[`${d.id}:${r.name}:${i}`]; return p ? { ...m, date: p.date, time: p.time, court: p.court, note: p.note || undefined } : m; }) })) }));
    onSave({ ...multi, divisions });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
        Each court has its own times — edit a game’s <b>time</b> inline (handy when one court’s games run longer); <b>drag</b> a game onto another court to move it. Clashes (team or court) are outlined red.
        <span className="ml-auto flex gap-2">
          <button onClick={save} className="rounded-md bg-foreground px-3 py-1 text-xs font-bold text-background hover:opacity-90">Save changes</button>
          <button onClick={onCancel} className="rounded-md border bg-card px-3 py-1 text-xs font-bold hover:bg-secondary">Cancel</button>
        </span>
      </div>
      {dates.map((date) => {
        const cols = courts.map((c) => ({ court: c, games: colGames(date, c) }));
        const rows = Math.max(1, ...cols.map((c) => c.games.length));
        return (
          <div key={date} className="overflow-x-auto rounded-xl border">
            <p className="bg-secondary px-3 py-1.5 text-sm font-black">{date}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">{courts.map((c) => <th key={c} colSpan={2} className="border-l px-2 py-1 text-left first:border-l-0">{c}</th>)}</tr>
                <tr className="text-[10px] uppercase text-muted-foreground">{courts.map((c) => <Fragment key={c}><th className="border-l px-2 py-0.5 text-left first:border-l-0">Time</th><th className="px-2 py-0.5 text-left">Match</th></Fragment>)}</tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }).map((_, i) => (
                  <tr key={i} className="border-t align-top">
                    {cols.map(({ court, games }) => {
                      const gk = games[i]; const gi = gk ? info.g[gk] : null;
                      return (
                        <Fragment key={court}>
                          <td className="border-l px-1 py-1 first:border-l-0">{gi ? <input type="time" defaultValue={pos[gk].time} key={gk} onBlur={(e) => setTime(gk, e.target.value)} className="w-[5.25rem] rounded-md border bg-card px-1.5 py-1 font-bold" /> : null}</td>
                          <td className="px-1 py-1" style={{ minWidth: 170 }} onDragOver={(e) => e.preventDefault()} onDrop={() => moveToCourt(date, court)}>
                            {gi ? (
                              <div className="space-y-1">
                                <div draggable onDragStart={() => setDrag(gk)} onDragEnd={() => setDrag(null)} className={`cursor-grab rounded-md border bg-card px-2 py-1 ${conflict.has(gk) ? "border-red-500 ring-1 ring-red-500" : ""}`}>
                                  <div className="text-[10px] text-muted-foreground">{gi.division}</div>
                                  <div className="font-semibold">{gi.home} <span className="text-muted-foreground">vs</span> {gi.away}</div>
                                </div>
                                <input defaultValue={pos[gk].note} key={`${gk}-note`} onBlur={(e) => setNote(gk, e.target.value)} placeholder="note…" className="w-full rounded-md border border-dashed bg-transparent px-1.5 py-0.5 text-[10px] text-muted-foreground placeholder:text-muted-foreground/50" />
                              </div>
                            ) : <div className="min-h-[2.25rem] rounded-md border border-dashed border-muted-foreground/30" />}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t">
                  {courts.map((c) => (
                    <Fragment key={c}>
                      <td className="border-l first:border-l-0" />
                      <td className="px-1 py-1" onDragOver={(e) => e.preventDefault()} onDrop={() => moveToCourt(date, c)}><div className="rounded-md border border-dashed border-muted-foreground/30 px-2 py-1 text-center text-[10px] text-muted-foreground">drop here → {c}</div></td>
                    </Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Schedule tab ---------- */
function ScheduleView({ multi, eventName, onApply }: { multi: MultiData; eventName?: string; onApply: (d: MultiData) => void }) {
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<Record<string, ResultMatch[]>>({});
  useEffect(() => { if (bdcseaReadable()) fetchEventResults(eventName).then(setResults).catch(() => {}); }, [eventName]);
  const meta = metaLine(multi, eventName);
  const body = scheduleBodyHtml(multi, results);
  const title = eventName || "Tournament";
  const fname = `${(eventName || "tournament").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-schedule.png`;
  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{editing ? "Drag games to rearrange, then Save." : "Export a shareable sheet, or edit the schedule by hand."}</p>
        <div className="flex gap-2">
          {!editing && <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary"><Pencil className="h-3.5 w-3.5" /> Edit schedule</button>}
          <button onClick={() => printSheet(title, "Tournament Schedule", meta, body)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary"><Printer className="h-3.5 w-3.5" /> Export PDF</button>
          <button onClick={() => imageSheet(title, "Tournament Schedule", meta, body, fname)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary"><Download className="h-3.5 w-3.5" /> Export image</button>
        </div>
      </div>
      {editing ? (
        <ScheduleEditor multi={multi} onSave={(d) => { onApply(d); setEditing(false); toast.success("Schedule updated"); }} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <SchedulePanel multi={multi} onApply={onApply} />
          <ScheduleGrid multi={multi} results={results} />
        </>
      )}
    </div>
  );
}

// Phase label for a day's rows (Group stage · Semifinals · Finals) — mirrors the organizer's sheet.
function phaseLabel(rws: { round: string }[]): string {
  const group = rws.some((r) => /group|round robin/i.test(r.round));
  const semi = rws.some((r) => /semi|quarter/i.test(r.round));
  const final = rws.some((r) => /final/i.test(r.round) && !/semi/i.test(r.round));
  return [group && "Group stage", semi && "Semifinals", final && "Finals"].filter(Boolean).join(" · ") || "Schedule";
}
// Score for a match if it's been played (BDCSEA results), oriented to the home/away shown.
function resultFor(results: Record<string, ResultMatch[]>, division: string, round: string, home: string, away: string): string {
  const hit = (results[division] ?? []).find((x) => x.round === round && ((x.home === home && x.away === away) || (x.home === away && x.away === home)));
  return hit ? (hit.home === home ? `${hit.hs}–${hit.as}` : `${hit.as}–${hit.hs}`) : "";
}

function ScheduleGrid({ multi, results = {} }: { multi: MultiData; results?: Record<string, ResultMatch[]> }) {
  const [court, setCourt] = useState("all");
  const rows = useMemo(() => multi.divisions.flatMap((d) => (d.rounds ?? []).flatMap((r) => r.matches.filter((m) => m.time).map((m) => ({ division: d.name, round: r.name, home: m.home, away: m.away, court: m.court ?? "", date: m.date ?? "", time: m.time!, note: m.note ?? "" })))), [multi]);
  const courts = useMemo(() => [...new Set([...(multi.schedule?.courts ?? []), ...rows.map((r) => r.court)].filter(Boolean))], [multi, rows]);
  if (!rows.length) return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No schedule yet — set the dates above and hit <b>Auto-schedule</b>.</p>;

  const shown = court === "all" ? rows : rows.filter((r) => r.court === court);
  const dates = [...new Set(shown.map((r) => r.date))].sort();
  const all = court === "all";

  return (
    <div className="space-y-4">
      {/* View all courts at once, or one court at a time for cleaner reading */}
      <div className="flex flex-wrap gap-1.5">
        {["all", ...courts].map((c) => (
          <button key={c} onClick={() => setCourt(c)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${court === c ? "bg-foreground text-background" : "border hover:bg-secondary"}`}>
            {c === "all" ? "All courts" : c}
          </button>
        ))}
      </div>
      {dates.map((date, i) => {
        const dayRows = shown.filter((r) => r.date === date).sort((a, b) => a.time.localeCompare(b.time) || a.court.localeCompare(b.court));
        return (
          <div key={date} className="overflow-x-auto rounded-xl border">
            <div className="flex items-baseline justify-between gap-2 bg-secondary px-3 py-1.5">
              <p className="text-sm font-black">Day {i + 1} <span className="font-bold text-muted-foreground">· {date || "Date TBD"}</span></p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{phaseLabel(dayRows)}{all ? "" : ` · ${court}`}</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-3 py-1.5 text-left">Time</th>
                  {all && <th className="px-2 py-1.5 text-left">Court</th>}
                  <th className="px-2 py-1.5 text-left">Category</th>
                  <th className="px-2 py-1.5 text-left">Round</th>
                  <th className="px-2 py-1.5 text-right">Team A</th>
                  <th className="px-2 py-1.5 text-center">Result</th>
                  <th className="px-2 py-1.5 text-left">Team B</th>
                  <th className="px-2 py-1.5 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((m, j) => {
                  const res = resultFor(results, m.division, m.round, m.home, m.away);
                  return (
                    <tr key={j} className="border-t">
                      <td className="px-3 py-1.5 font-bold tabular-nums">{m.time}</td>
                      {all && <td className="px-2 py-1.5 text-muted-foreground">{m.court}</td>}
                      <td className="px-2 py-1.5 text-muted-foreground">{m.division}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{m.round}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{m.home}</td>
                      <td className="px-2 py-1.5 text-center font-bold tabular-nums">{res || <span className="font-normal text-muted-foreground">vs</span>}</td>
                      <td className="px-2 py-1.5 font-semibold">{m.away}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{m.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Table tab (LIVE group standings + knockout) ---------- */
function TableView({ multi, eventName }: { multi: MultiData; eventName?: string }) {
  const [results, setResults] = useState<Record<string, ResultMatch[]>>({});
  const [loading, setLoading] = useState(false);
  const load = () => { if (!bdcseaReadable()) return; setLoading(true); fetchEventResults(eventName).then(setResults).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, [eventName]);
  const totalResults = Object.values(results).reduce((n, ms) => n + ms.length, 0);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-xs text-muted-foreground">
          {bdcseaReadable() ? <>Live standings from BDCSEA — {totalResults} result(s) in. Slots show placeholders (A1, A2…) until each division’s draw, and W/L fills in as scores are entered.</> : "Connect BDCSEA to show live standings — until then, placeholders and 0s."}
        </p>
        {bdcseaReadable() && <button onClick={load} disabled={loading} className="rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary">{loading ? "Refreshing…" : "↻ Refresh"}</button>}
        <button onClick={() => printSheet(eventName || "Tournament", "Group Standings & Brackets", metaLine(multi, eventName), tableBodyHtml(multi, results))} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary"><Printer className="h-3.5 w-3.5" /> Export PDF</button>
        <button onClick={() => imageSheet(eventName || "Tournament", "Group Standings & Brackets", metaLine(multi, eventName), tableBodyHtml(multi, results), `${(eventName || "tournament").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-table.png`)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary"><Download className="h-3.5 w-3.5" /> Export image</button>
      </div>
      {multi.divisions.map((d) => <DivisionTable key={d.id} d={d} matches={results[d.name] ?? []} />)}
    </div>
  );
}

function DivisionTable({ d, matches }: { d: Division; matches: ResultMatch[] }) {
  const rounds = d.rounds ?? [];
  const groupRounds = rounds.filter((r) => /^Group /.test(r.name) || r.name === "Round robin");
  const koRounds = rounds.filter((r) => !groupRounds.includes(r));
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="font-black">{d.name} <span className="text-xs font-semibold text-muted-foreground">· {fmtLabel(d.format)} · {d.drawn ? "drawn ✓" : "awaiting draw — placeholders"}</span></h3>
      {groupRounds.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{groupRounds.map((r) => <GroupStanding key={r.name} round={r} matches={matches} />)}</div>}
      {koRounds.length > 0 && <><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Knockout</p><BracketView rounds={koRounds} /></>}
    </div>
  );
}

function GroupStanding({ round, matches }: { round: Round; matches: ResultMatch[] }) {
  type Rec = { p: number; w: number; l: number; pf: number; pa: number };
  const rec = new Map<string, Rec>();
  const g = (n: string) => rec.get(n) ?? { p: 0, w: 0, l: 0, pf: 0, pa: 0 };
  for (const m of matches.filter((m) => m.round === round.name)) {
    const h = g(m.home), a = g(m.away);
    h.p++; a.p++; h.pf += m.hs; h.pa += m.as; a.pf += m.as; a.pa += m.hs;
    if (m.hs > m.as) { h.w++; a.l++; } else if (m.as > m.hs) { a.w++; h.l++; }
    rec.set(m.home, h); rec.set(m.away, a);
  }
  const teams = [...new Set(round.matches.flatMap((m) => [m.home, m.away]).filter((x) => x && x !== "(bye)"))];
  const ranked = teams.map((t) => ({ t, ...g(t) })).sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa) || a.t.localeCompare(b.t));
  return (
    <div className="overflow-hidden rounded-lg border">
      <p className="bg-secondary px-2.5 py-1 text-xs font-black">{round.name}</p>
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground"><th className="px-2 py-1 text-left">Team</th><th className="px-1">P</th><th className="px-1">W</th><th className="px-1">L</th><th className="px-1">PF</th><th className="px-1">PA</th></tr></thead>
        <tbody>
          {ranked.map((r) => <tr key={r.t} className="border-t"><td className="px-2 py-1 font-semibold">{r.t}</td><td className="px-1 text-center">{r.p}</td><td className="px-1 text-center font-bold">{r.w}</td><td className="px-1 text-center">{r.l}</td><td className="px-1 text-center">{r.pf}</td><td className="px-1 text-center">{r.pa}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Drawing room (full-screen modal, animated reveal) ---------- */
const DRAW_CSS = `
.draw-card { width: 110px; height: 150px; perspective: 900px; }
.draw-content { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 700ms cubic-bezier(.2,.7,.2,1); border-radius: 8px; box-shadow: 0 0 10px 1px #000000aa; }
.draw-content.revealed { transform: rotateY(180deg); }
.draw-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.draw-back { background: #151515; }
.draw-back .glow { position: absolute; width: 150%; height: 150%; background: linear-gradient(90deg, transparent, #ff9966, #ff9966, #ff9966, transparent); animation: draw_rot 5000ms infinite linear; }
.draw-back .inner { position: absolute; inset: 3px; background: #151515; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #ff9966; font-size: 40px; font-weight: 900; }
.draw-back .inner.counting { color: #fff; font-size: 84px; animation: draw_pulse 1000ms ease-in-out infinite; }
.draw-front { transform: rotateY(180deg); background: #151515; color: #fff; flex-direction: column; gap: 6px; padding: 8px; }
@keyframes draw_rot { 0% { transform: rotateZ(0deg); } 100% { transform: rotateZ(360deg); } }
@keyframes draw_pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.3); } }
`;

function DrawingRoom({ division, teams, onClose, onSave }: { division: Division; teams: Team[]; onClose: () => void; onSave: (d: Division) => void }) {
  const isElim = division.format === "single_elim";
  const isGroups = division.format === "groups_knockout";
  const tpg = division.teamsPerGroup || 3;
  const adv = division.advancePerGroup || 2;
  const seededNames = useMemo(() => [...division.seeds].sort((a, b) => a.seed - b.seed).map((s) => s.name), [division]);
  const initCells = (): Slot[] => isGroups
    ? buildGroupSlots({ groupCount: division.groupCount || 2, teamsPerGroup: tpg, seeds: division.seeds })
    : isElim
    ? buildSlots({ entrants: division.entrants, seeds: division.seeds })
    : Array.from({ length: division.entrants }, (_, i) => ({ pos: i, seed: i + 1, team: seededNames[i] ?? null, bye: false, seeded: i < seededNames.length }));
  const lib = useMemo(() => new Map(teams.map((t) => [t.name.trim().toLowerCase(), t])), [teams]);
  const [rows, setRows] = useState<{ name: string; logo: string }[]>(() => division.pool.map((n) => ({ name: n, logo: division.logos?.[n] ?? "" })));
  const [libQuery, setLibQuery] = useState(""); const [newLogo, setNewLogo] = useState("");
  const [cells, setCells] = useState<Slot[]>(initCells);
  const [phase, setPhase] = useState<"setup" | "drawn" | "counting" | "done">("setup");
  const [count, setCount] = useState(5);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [assignment, setAssignment] = useState<Slot[]>([]); // the drawn result, kept hidden until revealed
  const [revealOrder, setRevealOrder] = useState<number[]>([]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [counting, setCounting] = useState<number | null>(null); // slot currently counting down
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }), []);

  const openCount = cells.filter((c) => !c.bye && !c.seeded && !c.team).length;
  const busy = phase === "counting";
  const remaining = revealOrder.length - revealIdx;
  const logoFor = (name?: string | null) => {
    if (!name) return "";
    const r = rows.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
    return r?.logo || division.logos?.[name] || lib.get(name.trim().toLowerCase())?.logo_url || "";
  };
  const colorFor = (name?: string | null) => ink(name ? lib.get(name.trim().toLowerCase())?.primary_color : undefined);
  const addRow = (name: string, logo: string) => {
    const n = name.trim(); if (!n) return;
    if (rows.some((r) => r.name.trim().toLowerCase() === n.toLowerCase()) || seededNames.some((s) => s.toLowerCase() === n.toLowerCase())) return;
    setRows((r) => [...r, { name: n, logo: logo.trim() }]);
  };

  // Shuffle + arm the draw: results are computed but hidden behind mystery cards.
  function holdDraw() {
    const pool = rows.map((r) => r.name.trim()).filter(Boolean);
    if (!pool.length) return toast.error("Add the teams to draw first");
    const fresh = initCells();
    const { slots: filled, reveal } = drawInto(fresh, pool);
    if (!reveal.length) return toast.error(`No open slots — this division has ${openCount} to draw.`);
    timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.current = [];
    setCells(fresh.map((c) => ({ ...c })));   // open slots stay hidden (mystery)
    setAssignment(filled); setRevealOrder(reveal); setRevealIdx(0);
    setRevealed(new Set()); setCounting(null); setPhase("drawn");
  }

  // Reveal ONE team: a 5-second countdown plays on its card, then it flips.
  function revealNext() {
    if (phase !== "drawn" || revealIdx >= revealOrder.length) return;
    const pos = revealOrder[revealIdx];
    setPhase("counting"); setCounting(pos); setCount(5);
    let n = 5;
    const iv = window.setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(iv);
      setCells((prev) => prev.map((c) => (c.pos === pos ? { ...assignment.find((f) => f.pos === pos)! } : c)));
      setRevealed((prev) => { const s = new Set(prev); s.add(pos); return s; });
      setCounting(null);
      setRevealIdx((i) => i + 1);
      setPhase(revealIdx + 1 >= revealOrder.length ? "done" : "drawn");
    }, 1000);
    timers.current.push(iv as unknown as number);
  }

  // Keep any court/time already assigned to a slot-pairing when the draw rebuilds the rounds
  // (the match structure is identical — only the slot labels turn into real team names).
  const keepSchedule = (next: Round[]): Round[] => {
    const prev = division.rounds; if (!prev) return next;
    const sched = new Map<string, Match>();
    prev.forEach((r) => r.matches.forEach((m, i) => sched.set(`${r.name}:${i}`, m)));
    return next.map((r) => ({ ...r, matches: r.matches.map((m, i) => { const o = sched.get(`${r.name}:${i}`); return o && (o.court || o.time) ? { ...m, court: o.court, date: o.date, time: o.time } : m; }) }));
  };

  function save() {
    const pool = rows.map((r) => r.name.trim()).filter(Boolean);
    const logos: Record<string, string> = { ...(division.logos || {}) };
    for (const r of rows) { const n = r.name.trim(); if (n) { const l = r.logo.trim() || logoFor(n); if (l) logos[n] = l; } }
    for (const s of division.seeds) { const l = logoFor(s.name); if (l) logos[s.name] = l; }
    if (isGroups) onSave({ ...division, pool, logos, slots: cells, rounds: keepSchedule(groupKnockoutRounds(cells, tpg, adv, { consolation: division.consolation })), drawn: cells.some((c) => c.team && !c.seeded) });
    else if (isElim) onSave({ ...division, pool, logos, slots: cells, rounds: keepSchedule(elimRounds(cells)), drawn: cells.some((c) => c.team && !c.seeded) });
    else {
      const members = cells.map((c) => c.team).filter((x): x is string => !!x);
      onSave({ ...division, pool, logos, rounds: keepSchedule(roundRobinRounds(members.length ? members : Array.from({ length: division.entrants }, (_, i) => `Team ${i + 1}`))), drawn: members.length > 0 });
    }
  }

  const previewRounds = isGroups ? groupKnockoutRounds(cells, tpg, adv, { consolation: division.consolation }) : isElim ? elimRounds(cells) : roundRobinRounds(cells.map((c) => c.team).filter((x): x is string => !!x));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={busy ? undefined : onClose}>
      <style>{DRAW_CSS}</style>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black"><Shuffle className="h-5 w-5" /> Drawing Room</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{division.name} · {fmtLabel(division.format)} · {division.entrants} teams · {seededNames.length} seeded (locked) · {openCount} to draw</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-bold hover:bg-secondary">✕ Close</button>
        </div>

        {/* Team list with logos — import from library or add manually */}
        <div className="mt-3 rounded-lg border bg-background p-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Teams for the draw ({rows.length})</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {rows.map((r, i) => (
              <span key={i} className="flex items-center gap-1 rounded-md border bg-card px-1.5 py-1 text-xs font-semibold">
                {r.logo ? <img src={r.logo} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4 rounded-full bg-secondary" />}
                {r.name}
                <button onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
            {!rows.length && <span className="text-xs text-muted-foreground">No teams yet — import from your library or add below.</span>}
          </div>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add a team — search your library, or type a new name (logo optional, draw-only)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <input value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="🔎 Search team / type a name" className="min-w-[10rem] flex-1 rounded-md border bg-card px-2 py-1 text-xs" />
            <input value={newLogo} onChange={(e) => setNewLogo(e.target.value)} placeholder="Logo URL (optional)" className="min-w-[8rem] flex-1 rounded-md border bg-card px-2 py-1 text-xs" />
            <button onClick={() => { if (libQuery.trim()) { addRow(libQuery, newLogo); setLibQuery(""); setNewLogo(""); } }} disabled={!libQuery.trim()} className={`rounded-md border px-2 py-1 text-xs font-bold ${libQuery.trim() ? "hover:bg-secondary" : "opacity-40"}`}>+ Add</button>
          </div>
          {libQuery.trim() && teams.length > 0 && (() => {
            const q = libQuery.trim().toLowerCase();
            const hits = teams.filter((t) => t.name.toLowerCase().includes(q) && !rows.some((r) => r.name.trim().toLowerCase() === t.name.trim().toLowerCase())).slice(0, 8);
            return hits.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {hits.map((t) => (
                  <button key={t.id} onClick={() => { addRow(t.name, t.logo_url || ""); setLibQuery(""); }} className="flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[11px] font-semibold hover:bg-secondary">
                    {t.logo_url ? <img src={t.logo_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover" /> : <span className="h-2 w-2 rounded-full" style={{ background: ink(t.primary_color, "#999") }} />}
                    {t.name}
                  </button>
                ))}
              </div>
            ) : <p className="mt-1 text-[11px] text-muted-foreground">No library match — tap <b>+ Add</b> to use “{libQuery.trim()}” as a custom team.</p>;
          })()}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={holdDraw} disabled={busy || phase !== "setup"} className={`flex items-center gap-1.5 rounded-lg border-2 px-4 py-2 text-sm font-bold ${(busy || phase !== "setup") ? "opacity-50" : "hover:bg-secondary"}`}><Shuffle className="h-4 w-4" /> Hold the draw</button>
          {phase !== "setup" && (
            <button onClick={holdDraw} disabled={busy} title="Reshuffle for a different draw" className={`flex items-center gap-1.5 rounded-lg border-2 px-4 py-2 text-sm font-bold ${busy ? "opacity-50" : "hover:bg-secondary"}`}>🎲 Redraw</button>
          )}
          {phase !== "setup" && (
            <button onClick={revealNext} disabled={phase !== "drawn"} className={`flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background ${phase !== "drawn" ? "opacity-50" : "hover:opacity-90"}`}>
              {phase === "counting" ? `Revealing… ${count}` : phase === "done" ? "All revealed ✓" : `🎉 Reveal next team (${remaining} left)`}
            </button>
          )}
          <button onClick={save} disabled={busy} className={`rounded-lg border-2 px-4 py-2 text-sm font-bold hover:bg-secondary ${busy ? "opacity-50" : ""}`}>Save & close</button>
        </div>
        {phase === "drawn" && revealIdx === 0 && <p className="mt-2 text-xs text-muted-foreground">Draw is set — click <b>Reveal next team</b> to flip each card one at a time.</p>}

        <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{isElim ? "Bracket slots" : "Teams"}</p>
        <div className="relative mt-2">
          <div className={`grid justify-items-center gap-3 ${isElim ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
            {cells.map((c) => {
              const isCounting = counting === c.pos;
              const front = phase === "setup" ? true : (c.seeded || c.bye || revealed.has(c.pos));
              const logo = logoFor(c.team);
              return (
                <div key={c.pos} className="draw-card" style={{ transform: isCounting ? "scale(1.1)" : undefined, transition: "transform 200ms", zIndex: isCounting ? 20 : undefined }}>
                  <div className={"draw-content" + (front ? " revealed" : "")}>
                    <div className="draw-face draw-back"><span className="glow" /><span className={"inner" + (isCounting ? " counting" : "")}>{isCounting ? count : "?"}</span></div>
                    <div className="draw-face draw-front">
                      <span className="absolute left-2 top-1.5 flex items-center gap-0.5 text-[10px] font-black text-white/50">{isElim ? `#${c.seed}` : isGroups ? groupName(Math.floor(c.pos / tpg)).replace("Group ", "Grp ") : `#${c.pos + 1}`}{c.seeded && <Lock className="h-2.5 w-2.5" />}</span>
                      {c.bye ? (
                        <span className="text-sm font-bold text-white/60">BYE</span>
                      ) : c.team ? (
                        <>
                          {logo ? <img src={logo} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white" style={{ background: colorFor(c.team) }}>{c.team.slice(0, 2).toUpperCase()}</span>}
                          <span className="px-1 text-center text-xs font-bold text-white">{c.team}</span>
                        </>
                      ) : (
                        <span className="text-2xl font-black text-white/30">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resulting bracket</p>
        <BracketView rounds={previewRounds} />
      </div>
    </div>
  );
}

/* ---------- Schedule panel ---------- */
function SchedulePanel({ multi, onApply }: { multi: MultiData; onApply: (d: MultiData) => void }) {
  const [cfg, setCfg] = useState<ScheduleCfg>(multi.schedule ?? DEFAULT_SCHED);
  const [result, setResult] = useState<{ scheduled: any[]; unscheduled: any[]; warnings: string[] } | null>(null);

  const matches = useMemo(() => multi.divisions.flatMap((d) => schedulableMatches(d.id, d.rounds ?? [])), [multi]);

  function run(useCfg: ScheduleCfg = cfg) {
    const dates = expandDates(useCfg.startDate, useCfg.endDate);
    if (!dates.length) return toast.error("Pick a start date");
    if (!matches.length) return toast.error("No concrete matches yet — run the draws first");
    const divisionStart: Record<string, string> = {};
    const divisionMaxPerDay: Record<string, number> = {};
    for (const d of multi.divisions) { if (d.earliestDate) divisionStart[d.id] = d.earliestDate; if (d.maxPerDay) divisionMaxPerDay[d.id] = d.maxPerDay; }
    const r = autoSchedule({ ...useCfg, dates, matches, divisionStart, divisionMaxPerDay }); // pure, runs in-browser
    setResult(r);
    const byId = new Map<string, any>(r.scheduled.map((s) => [s.id, s] as [string, any]));
    const divisions = multi.divisions.map((d) => ({
      ...d,
      rounds: (d.rounds ?? []).map((round) => ({
        ...round,
        matches: round.matches.map((m, i) => {
          const s = byId.get(`${d.id}:${round.name}:${i}`);
          return s ? { ...m, court: s.court, date: s.date, time: s.time } : m;
        }),
      })),
    }));
    onApply({ ...multi, schedule: { ...useCfg, dates }, divisions });
    toast.success(`Scheduled ${r.scheduled.length}/${matches.length} match(es)`);
  }

  // ✨ AI scheduling assistant (Gemini, via the gateway) — advice + an optional config to apply.
  const onGateway = typeof window !== "undefined" && !CLOUD_HOSTS.some((h) => window.location.hostname.endsWith(h));
  const [chat, setChat] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [aiConfig, setAiConfig] = useState<ScheduleCfg | null>(null);
  const summary = useMemo(() => {
    const ko = matches.filter((m) => /knockout|division|final|semi|quarter/i.test(m.round || "")).length;
    const divs = multi.divisions.map((d) => `${d.name} [${fmtLabel(d.format)}${d.groupCount ? ` ${d.groupCount}×${d.teamsPerGroup}, top ${d.advancePerGroup}${d.consolation ? " + Div2" : ""}` : ""}]`).join("; ");
    return `${multi.divisions.length} divisions: ${divs}. ${matches.length} matches total (${matches.length - ko} group, ${ko} knockout).`;
  }, [multi, matches]);

  async function sendChat() {
    const msg = chatInput.trim(); if (!msg || chatBusy) return;
    const history = chat;
    setChat((c) => [...c, { role: "user", text: msg }]); setChatInput(""); setChatBusy(true); setAiConfig(null);
    try {
      const res = await fetch(`${window.location.origin}/__gateway/schedule-advisor`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, history, config: cfg, summary }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Gateway error ${res.status}`);
      setChat((c) => [...c, { role: "model", text: j.reply || "(no reply)" }]);
      if (j.config && typeof j.config === "object") setAiConfig({ ...cfg, ...j.config });
    } catch (e) { setChat((c) => [...c, { role: "model", text: `⚠️ ${(e as Error).message}` }]); } finally { setChatBusy(false); }
  }
  function applyAi() { if (aiConfig) { setCfg(aiConfig); const c = aiConfig; setAiConfig(null); run(c); } }

  const set = (p: Partial<ScheduleCfg>) => setCfg((c) => ({ ...c, ...p }));
  return (
    <div className="mt-3 rounded-xl border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Auto-schedule — across courts, no team double-booked</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold">Courts (comma-separated)
          <input value={cfg.courts.join(", ")} onChange={(e) => set({ courts: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-sm" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold">Start date<input type="date" value={cfg.startDate || ""} onChange={(e) => set({ startDate: e.target.value })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
          <label className="text-xs font-semibold">End date<input type="date" value={cfg.endDate || ""} min={cfg.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
        </div>
        {!cfg.sessions?.length && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">Day start<input type="time" value={cfg.dayStart} onChange={(e) => set({ dayStart: e.target.value })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
            <label className="text-xs font-semibold">Day end<input type="time" value={cfg.dayEnd} onChange={(e) => set({ dayEnd: e.target.value })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-2">
          <input type="checkbox" checked={!!cfg.sessions?.length} onChange={(e) => set({ sessions: e.target.checked ? [{ start: "08:00", end: "11:30" }, { start: "14:00", end: "17:00" }] : undefined })} />
          Split each day into sessions (e.g. morning + afternoon, skipping lunch)
        </label>
        {cfg.sessions?.length ? (
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            {cfg.sessions.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2">
                <label className="text-xs font-semibold">Session {i + 1} start<input type="time" value={s.start} onChange={(e) => set({ sessions: cfg.sessions!.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
                <label className="text-xs font-semibold">Session {i + 1} end<input type="time" value={s.end} onChange={(e) => set({ sessions: cfg.sessions!.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-semibold">Slot min<input type="number" value={cfg.slotMin} onChange={(e) => set({ slotMin: +e.target.value || 40 })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
          <label className="text-xs font-semibold">Rest min<input type="number" value={cfg.restMin} onChange={(e) => set({ restMin: +e.target.value || 0 })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
          <label className="text-xs font-semibold">Max/day<input type="number" value={cfg.maxPerDay} onChange={(e) => set({ maxPerDay: +e.target.value || 1 })} className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm" /></label>
        </div>
      </div>
      <button onClick={() => run()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-bold text-background hover:opacity-90"><CalendarClock className="h-4 w-4" /> Auto-schedule</button>

      {/* AI scheduling assistant */}
      <div className="mt-3 rounded-lg border bg-card p-3">
        <p className="flex items-center gap-1.5 text-xs font-black"><Sparkles className="h-3.5 w-3.5" /> AI schedule assistant <span className="font-semibold text-muted-foreground">· ask for a better fit</span></p>
        {!onGateway && <p className="mt-1 text-[11px] font-semibold text-amber-600">Runs on the local gateway — open this page via the gateway URL to use it.</p>}
        {chat.length > 0 && (
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-md bg-background p-2">
            {chat.map((m, i) => (
              <div key={i} className={`text-xs ${m.role === "user" ? "text-right" : ""}`}>
                <span className={`inline-block whitespace-pre-wrap rounded-lg px-2.5 py-1.5 ${m.role === "user" ? "bg-foreground text-background" : "border bg-card"}`}>{m.text}</span>
              </div>
            ))}
            {chatBusy && <p className="text-xs text-muted-foreground">Thinking…</p>}
          </div>
        )}
        {aiConfig && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed bg-background p-2">
            <span className="text-[11px] font-semibold text-muted-foreground">The assistant suggested new settings.</span>
            <button onClick={applyAi} className="rounded-md bg-foreground px-2.5 py-1 text-xs font-bold text-background hover:opacity-90">Apply &amp; schedule</button>
            <button onClick={() => setAiConfig(null)} className="rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-secondary">Dismiss</button>
          </div>
        )}
        <div className="mt-2 flex gap-1.5">
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} disabled={!onGateway || chatBusy} placeholder="e.g. fit groups in 2 days, or finish earlier on Saturday" className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs" />
          <button onClick={sendChat} disabled={!onGateway || chatBusy || !chatInput.trim()} className={`rounded-md bg-foreground px-3 py-1.5 text-xs font-bold text-background ${(!onGateway || chatBusy || !chatInput.trim()) ? "opacity-40" : "hover:opacity-90"}`}>Ask</button>
        </div>
      </div>

      {result && (
        <div className="mt-3 space-y-2">
          {result.warnings.map((w, i) => <p key={i} className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-600">⚠️ {w}</p>)}
          {result.unscheduled.map((u, i) => <p key={i} className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-600">Couldn't place {u.teamA} vs {u.teamB} ({u.division}): {u.reason}</p>)}
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-secondary"><tr><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Time</th><th className="px-2 py-1 text-left">Court</th><th className="px-2 py-1 text-left">Division</th><th className="px-2 py-1 text-left">Match</th></tr></thead>
              <tbody>
                {[...result.scheduled].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((s, i) => (
                  <tr key={i} className="border-t"><td className="px-2 py-1">{s.date}</td><td className="px-2 py-1 font-bold">{s.time}</td><td className="px-2 py-1">{s.court}</td><td className="px-2 py-1 text-muted-foreground">{s.division}</td><td className="px-2 py-1 font-semibold">{s.teamA} vs {s.teamB}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Bracket view ---------- */
function BracketView({ rounds }: { rounds: Round[] }) {
  if (!rounds.length) return null;
  return (
    <div className="mt-3 space-y-3">
      {rounds.map((r, i) => (
        <div key={i}>
          <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{r.name}</p>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {r.matches.map((m, j) => (
              <div key={j} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-1.5 text-xs">
                <span className="truncate font-semibold">{m.home}</span>
                <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{m.time ? `${m.time} · ${m.court}` : "vs"}</span>
                <span className="truncate text-right font-semibold">{m.away}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
