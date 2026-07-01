import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { CourtSelector } from "@/components/CourtSelector";
import { useGameState, startNewGame } from "@/lib/game-state";
import { useFootage, setFootage } from "@/lib/ads";
import { saveGame, gameHasResult } from "@/lib/games";
import { toast } from "sonner";
import { ink } from "@/lib/color";
import { Film, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

const CLOUD_HOSTS = ["workers.dev", "lovable.app", "lovable.dev"];

function mmssToSec(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(\d+):(\d{1,2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
function secToMmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export const Route = createFileRoute("/_authenticated/footage/$courtId")({
  head: () => ({ meta: [{ title: "Game Footage & AI Stats — BDC" }] }),
  component: Footage,
});

type AiRow = {
  team_side: string; player_number: string | null; player_name: string | null;
  event_type: string; points: number; quarter: number; note: string | null;
  _ts?: string | null; _matched?: boolean;
};
type Report = {
  homeName: string; awayName: string;
  officialScore: { home: number; away: number }; aiScore: { home: number; away: number };
  mismatch: boolean; eventCount: number; unmatchedPlayers: number; notes: string | null;
  chunked?: boolean; segments?: Array<{ label: string; events: number }>;
  events: AiRow[]; committed: boolean; alerted: boolean;
};

function Footage() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const footage = useFootage(courtId);

  const [url, setUrl] = useState("");
  useEffect(() => { if (footage?.url) setUrl(footage.url); }, [footage?.url]);

  const onGateway = typeof window !== "undefined" && !CLOUD_HOSTS.some((h) => window.location.hostname.endsWith(h));
  const [busy, setBusy] = useState<"" | "analyze" | "commit">("");
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  // Quarter-by-quarter chunking (more accurate on long games)
  const [chunk, setChunk] = useState(false);
  const [parts, setParts] = useState(4); // sub-windows per quarter (4 → 16 total)
  const [total, setTotal] = useState("");
  const [quarters, setQuarters] = useState([
    { start: "", end: "" }, { start: "", end: "" }, { start: "", end: "" }, { start: "", end: "" },
  ]);
  function setQ(i: number, key: "start" | "end", v: string) {
    setQuarters((qs) => qs.map((q, j) => (j === i ? { ...q, [key]: v } : q)));
  }
  function autoSplit() {
    const t = mmssToSec(total);
    if (!t) { toast.error("Enter total game length as MM:SS"); return; }
    const q = t / 4;
    setQuarters([0, 1, 2, 3].map((i) => ({ start: secToMmss(i * q), end: secToMmss((i + 1) * q) })));
  }
  function buildSegments() {
    const segs: Array<{ quarter: number; start: number; end: number }> = [];
    quarters.forEach((r, i) => {
      const a = mmssToSec(r.start), b = mmssToSec(r.end);
      if (a == null || b == null || b <= a) return;
      // split each quarter into `parts` equal windows — shorter = faster + more accurate
      const n = Math.max(1, parts);
      const step = (b - a) / n;
      for (let k = 0; k < n; k++) {
        segs.push({ quarter: i + 1, start: Math.round(a + k * step), end: Math.round(a + (k + 1) * step) });
      }
    });
    return segs;
  }
  const [detecting, setDetecting] = useState(false);
  async function detectQuarters() {
    if (!url.trim()) { toast.error("Add a video link first"); return; }
    setDetecting(true);
    try {
      const startRes = await fetch(`${window.location.origin}/__gateway/detect-quarters`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoUrl: url.trim() }),
      });
      const started = await startRes.json();
      if (!startRes.ok || !started.jobId) throw new Error(started.error || `Gateway error ${startRes.status}`);
      const deadline = Date.now() + 12 * 60 * 1000;
      let qs: Array<{ quarter: number; start: number; end: number }> = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 3000));
        if (Date.now() > deadline) throw new Error("Detection timed out — enter the quarter times manually.");
        const sRes = await fetch(`${window.location.origin}/__gateway/analyze-status?job=${started.jobId}`);
        const job = await sRes.json();
        if (job.status === "error") throw new Error(job.error || "Detection failed");
        if (job.status === "done") { qs = job.report?.quarters || []; break; }
      }
      if (!qs.length) { toast.error("Couldn't detect quarters — set them manually"); return; }
      setQuarters([0, 1, 2, 3].map((i) => {
        const q = qs.find((x) => x.quarter === i + 1) ?? qs[i];
        return q ? { start: secToMmss(q.start), end: secToMmss(q.end) } : { start: "", end: "" };
      }));
      toast.success(`Detected ${qs.length} quarter(s) — review & adjust`);
    } catch (e) { toast.error((e as Error).message); } finally { setDetecting(false); }
  }

  async function saveLink() {
    try { await setFootage(courtId, url.trim()); toast.success("Footage link saved"); }
    catch { toast.error("Could not save link"); }
  }

  async function saveCurrent() {
    if (!s) return;
    try { await saveGame(s); toast.success("Game saved to history"); }
    catch { toast.error("Could not save game"); }
  }

  async function newGame() {
    if (!s) return;
    const had = gameHasResult(s);
    if (!confirm(`Start a new game on this court?\n\n${had ? "The current game will be SAVED to history first, then " : ""}the score, fouls, timeouts and clock reset and the play-by-play / shot chart clear — so stats apply to the current teams (${s.home_name} vs ${s.away_name}). Teams stay assigned.`)) return;
    try {
      if (had) await saveGame(s);
      await startNewGame(s);
      setReport(null);
      toast.success(had ? "Previous game saved · new game started" : "New game started");
    } catch { toast.error("Could not start a new game"); }
  }

  async function run(commit: boolean) {
    if (!url.trim()) { toast.error("Add a video link first"); return; }
    let segments: Array<{ quarter: number; start: number; end: number }> | undefined;
    if (chunk) {
      segments = buildSegments();
      if (!segments.length) { toast.error("Fill in at least one quarter's start/end time"); return; }
    }
    setBusy(commit ? "commit" : "analyze"); setError(""); setProgress("Starting…");
    try {
      // start a background job (analysis of a long video takes minutes)
      const startRes = await fetch(`${window.location.origin}/__gateway/analyze`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ courtId, videoUrl: url.trim(), commit, segments }),
      });
      const started = await startRes.json();
      if (!startRes.ok || !started.jobId) throw new Error(started.error || `Gateway error ${startRes.status}`);
      // poll until done (up to ~15 min)
      const deadline = Date.now() + 15 * 60 * 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 3000));
        if (Date.now() > deadline) throw new Error("Analysis is taking too long — try fewer / shorter quarter windows.");
        const sRes = await fetch(`${window.location.origin}/__gateway/analyze-status?job=${started.jobId}`);
        const job = await sRes.json();
        if (job.status === "error") throw new Error(job.error || "Analysis failed");
        if (job.status === "done") {
          setReport(job.report);
          if (commit && job.report?.committed) toast.success("Stats committed — shot chart & play-by-play updated");
          break;
        }
        setProgress(job.progress || "Working…");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(""); setProgress(""); }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight"><Film className="h-7 w-7" /> Game Footage & AI Stats</h1>
            <p className="text-xs text-muted-foreground">{s ? `${s.home_name} vs ${s.away_name}` : "…"}</p>
          </div>
          <CourtSelector activeId={courtId} />
        </div>

        {/* Current game / teams */}
        <div className="mt-6 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">This game</p>
              <p className="mt-1 text-lg font-black">
                <span style={{ color: ink(s?.home_color) }}>{s?.home_name ?? "—"}</span>
                <span className="text-muted-foreground"> vs </span>
                <span style={{ color: ink(s?.away_color) }}>{s?.away_name ?? "—"}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                The AI analysis uses these teams' rosters (matched by jersey number). Change the teams on the Court Control panel; then start a new game here.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/games" className="rounded-lg border px-4 py-2 text-sm font-bold hover:bg-secondary">History</Link>
              <button onClick={saveCurrent} className="rounded-lg border px-4 py-2 text-sm font-bold hover:bg-secondary">Save game</button>
              <button onClick={newGame} className="rounded-lg border-2 border-destructive px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground">New Game</button>
            </div>
          </div>
        </div>

        {/* Video link */}
        <div className="mt-5 rounded-2xl border bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Livestream / recording link</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="YouTube or video URL (public)"
              className="min-w-[280px] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button onClick={saveLink} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-secondary">Save link</button>
          </div>
        </div>

        {/* Analyze */}
        <div className="mt-5 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-black"><Sparkles className="h-4 w-4" /> AI play-by-play</p>
              <p className="text-xs text-muted-foreground">Gemini watches the footage and drafts per-player events (shot chart + play-by-play), matched to your roster by jersey number.</p>
            </div>
            <div className="flex gap-2">
              <button disabled={!onGateway || !!busy} onClick={() => run(false)} className={`rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background ${(!onGateway || busy) ? "opacity-40" : "hover:opacity-90"}`}>
                {busy === "analyze" ? "Analyzing…" : "Analyze (preview)"}
              </button>
              <button disabled={!onGateway || !!busy || !report} onClick={() => run(true)} className={`rounded-lg border-2 px-4 py-2 text-sm font-bold ${(!onGateway || busy || !report) ? "opacity-40" : "hover:bg-secondary"}`}>
                {busy === "commit" ? "Committing…" : "Commit to stats"}
              </button>
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={chunk} onChange={(e) => setChunk(e.target.checked)} className="h-4 w-4" />
              Analyze quarter-by-quarter <span className="text-xs font-normal text-muted-foreground">(more accurate for long games)</span>
            </label>
            {chunk && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={detectQuarters} disabled={detecting || !onGateway} className={`rounded-md bg-foreground px-3 py-1.5 text-xs font-bold text-background ${(detecting || !onGateway) ? "opacity-40" : "hover:opacity-90"}`}>
                    {detecting ? "Detecting…" : "✨ Auto-detect quarters"}
                  </button>
                  <span className="text-[11px] text-muted-foreground">reads the clock to fill the times (slow on a long video) — or just</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total</span>
                  <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="48:00" className="w-20 rounded-md border bg-background px-2 py-1 text-sm" />
                  <button onClick={autoSplit} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">Split into 4</button>
                </div>
                {detecting && <p className="text-[11px] text-muted-foreground">Scanning the video for quarter boundaries — this can take a few minutes on a long game…</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {quarters.map((q, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                      <span className="w-7 text-xs font-black">Q{i + 1}</span>
                      <input value={q.start} onChange={(e) => setQ(i, "start", e.target.value)} placeholder="start MM:SS" className="w-24 rounded-md border bg-background px-2 py-1 text-sm" />
                      <span className="text-muted-foreground">→</span>
                      <input value={q.end} onChange={(e) => setQ(i, "end", e.target.value)} placeholder="end MM:SS" className="w-24 rounded-md border bg-background px-2 py-1 text-sm" />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold uppercase tracking-wide text-muted-foreground">Detail</span>
                  <select value={parts} onChange={(e) => setParts(parseInt(e.target.value))} className="rounded-md border bg-background px-2 py-1 font-semibold">
                    <option value={1}>1 pass / quarter (4 total)</option>
                    <option value={2}>2 passes / quarter (8 total)</option>
                    <option value={4}>4 passes / quarter (16 total) — most accurate</option>
                  </select>
                  <span className="text-[11px] text-muted-foreground">each quarter is split into shorter windows analyzed in order</span>
                </div>
              </div>
            )}
          </div>
          {!onGateway && (
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600">
              AI analysis runs on the local gateway. Open this page via the gateway URL (e.g. http://Minhs-MacBook-Air.local:8787/footage/{courtId}) to enable it.
            </p>
          )}
          {busy && <p className="mt-3 text-xs text-muted-foreground">Watching the video with Gemini — this can take a few minutes for a long game. Keep this tab open.</p>}
          {busy && progress && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
              {progress}
            </p>
          )}
          {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}
        </div>

        {report && <ReportView report={report} />}
      </main>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  return (
    <div className="mt-5 space-y-4">
      {/* Score reconciliation */}
      <div className={`rounded-2xl border-2 p-5 ${report.mismatch ? "border-destructive bg-destructive/5" : "border-emerald-500 bg-emerald-500/5"}`}>
        <p className="flex items-center gap-1.5 text-sm font-black">
          {report.mismatch ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          Score check vs scoreboard
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 text-center">
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scoreboard (official)</p>
            <p className="clock-digits text-3xl font-black">{report.officialScore.home} – {report.officialScore.away}</p>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI play-by-play</p>
            <p className="clock-digits text-3xl font-black">{report.aiScore.home} – {report.aiScore.away}</p>
          </div>
        </div>
        <p className={`mt-2 text-xs font-semibold ${report.mismatch ? "text-destructive" : "text-emerald-600"}`}>
          {report.mismatch
            ? `Mismatch — the AI's tally differs from the scoreboard. ${report.alerted ? "Admin alerted on Telegram." : "Review the play-by-play below; the scoreboard score stays authoritative."}`
            : "Match — AI play-by-play agrees with the scoreboard."}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {report.eventCount} events{report.unmatchedPlayers ? ` · ⚠️ ${report.unmatchedPlayers} with an unreadable jersey number` : ""}{report.committed ? " · committed to stats" : ""}
        </p>
        {report.chunked && report.segments && report.segments.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Quarter-by-quarter: {report.segments.map((sg) => `${sg.label} ${sg.events}`).join(" · ")}
          </p>
        )}
        {report.notes && <p className="mt-1 text-[11px] italic text-muted-foreground">Gemini notes: {report.notes}</p>}
      </div>

      {/* Box score from the AI events */}
      <div className="grid gap-4 md:grid-cols-2">
        <ReportBox title={report.homeName} side="home" events={report.events} />
        <ReportBox title={report.awayName} side="away" events={report.events} />
      </div>

      {/* Events table */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-[3rem_3rem_4rem_1fr_5rem_3rem] gap-2 bg-secondary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          <span>Time</span><span>Qtr</span><span>Team</span><span>Player</span><span>Event</span><span>Pts</span>
        </div>
        <div className="max-h-[420px] divide-y overflow-y-auto text-xs">
          {report.events.map((e, i) => (
            <div key={i} className={`grid grid-cols-[3rem_3rem_4rem_1fr_5rem_3rem] gap-2 px-3 py-1.5 ${!e._matched ? "bg-amber-500/10" : ""}`}>
              <span className="clock-digits text-muted-foreground">{e._ts || "—"}</span>
              <span>Q{e.quarter}</span>
              <span className="font-semibold uppercase">{e.team_side}</span>
              <span className="truncate">{e.player_number ? `#${e.player_number} ` : ""}{e.player_name || (e._matched ? "" : "(unmatched)")}</span>
              <span className="font-semibold">{e.event_type}</span>
              <span className="clock-digits">{e.points || ""}</span>
            </div>
          ))}
          {report.events.length === 0 && <p className="px-3 py-4 text-center text-muted-foreground">No events extracted.</p>}
        </div>
      </div>
    </div>
  );
}

function ReportBox({ title, side, events }: { title: string; side: string; events: AiRow[] }) {
  type Line = { num: string; name: string; pts: number; ast: number; reb: number; blk: number; stl: number; fgm: number; fga: number };
  const m = new Map<string, Line>();
  for (const e of events) {
    if (e.team_side !== side) continue;
    const key = `${e.player_number ?? ""}|${e.player_name ?? ""}`;
    const row = m.get(key) ?? { num: e.player_number ?? "—", name: e.player_name ?? "(unmatched)", pts: 0, ast: 0, reb: 0, blk: 0, stl: 0, fgm: 0, fga: 0 };
    row.pts += e.points || 0;
    const t = e.event_type;
    if (t === "AST") row.ast++;
    else if (t === "REB") row.reb++;
    else if (t === "BLK") row.blk++;
    else if (t === "STL") row.stl++;
    if (t === "2PT_MADE" || t === "3PT_MADE") { row.fgm++; row.fga++; }
    else if (t === "2PT_MISS" || t === "3PT_MISS") { row.fga++; }
    m.set(key, row);
  }
  const lines = [...m.values()].sort((a, b) => b.pts - a.pts);
  const pct = (mm: number, a: number) => (a > 0 ? `${Math.round((mm / a) * 100)}%` : "—");
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="bg-secondary px-3 py-2 text-sm font-black uppercase tracking-wider">{title}</div>
      <div className="grid grid-cols-[1fr_2.4rem_2.2rem_2.2rem_2.2rem_3rem] gap-1 px-3 py-1.5 text-[10px] font-black uppercase text-muted-foreground">
        <span>Player</span><span className="text-center">PTS</span><span className="text-center">AST</span><span className="text-center">REB</span><span className="text-center">BLK</span><span className="text-center">FG%</span>
      </div>
      <div className="divide-y text-xs">
        {lines.length === 0 && <p className="px-3 py-3 text-muted-foreground">No player stats.</p>}
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_2.4rem_2.2rem_2.2rem_2.2rem_3rem] gap-1 px-3 py-1.5">
            <span className="truncate"><span className="clock-digits font-black">{l.num}</span> {l.name}</span>
            <span className="clock-digits text-center font-black">{l.pts}</span>
            <span className="text-center">{l.ast}</span>
            <span className="text-center">{l.reb}</span>
            <span className="text-center">{l.blk}</span>
            <span className="text-center">{pct(l.fgm, l.fga)} <span className="text-[9px] text-muted-foreground">({l.fgm}-{l.fga})</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
