import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { RefreshCw } from "lucide-react";
import { listAudit, type AuditRow } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/audit/$courtId")({
  head: () => ({ meta: [{ title: "Change log — BDC" }] }),
  component: AuditPage,
});

// Who changed what, when — per court. Entries come from each control device's session log
// (see src/lib/audit.ts); flushes are batched, so the newest ~15s may not have landed yet.
function AuditPage() {
  const { courtId } = Route.useParams();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try { setRows(await listAudit(courtId)); } finally { setBusy(false); }
  }
  useEffect(() => { setRows(null); void load(); }, [courtId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Change log</h1>
            <p className="text-xs text-muted-foreground">Every scoreboard change on this court, stamped with the operator name of the device that made it. Newest first; updates land within ~15s.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={busy} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-secondary disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
            <CourtSelector activeId={courtId} />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card">
          {rows === null ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No logged changes yet for this court. Entries appear once an operator (signed in with a name) changes the score, clock, fouls, or timeouts.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5">Operator</th>
                  <th className="px-4 py-2.5">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.session}-${r.ts}-${i}`} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">{new Date(r.ts).toLocaleTimeString()} · {new Date(r.ts).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-semibold">{r.op}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
