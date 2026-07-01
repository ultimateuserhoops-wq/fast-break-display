/**
 * THE BASKETBALL SCOREBOARD — LOCAL GATEWAY
 * ------------------------------------------------------------------
 * Run this on the operator's laptop (or any machine on the venue Wi-Fi) for
 * LAN-speed clock/score control. Instead of every update making a cloud round
 * trip through Supabase realtime (~0.3–0.6s), the control panel and the OBS
 * displays talk to this gateway over the local network (~1ms): the timer stops
 * instantly and the score is in sync immediately.
 *
 * It is a PURE RELAY (no credentials needed):
 *   1. Serves the app over HTTP on the LAN by proxying the deployed Cloudflare
 *      app (an https page can't open a plain ws:// — so we serve over http).
 *   2. Hosts a same-origin WebSocket hub at /__gateway that relays each state
 *      change to every connected screen the instant it happens.
 *   3. Serves /api/time from THIS machine so all LAN devices share one clock.
 *   4. Loads the current state from Supabase on boot (public read) so a screen
 *      that connects mid-game gets the right values immediately.
 *
 * Persistence stays where it already works: the (authenticated) control panel
 * writes game_state to Supabase in the background, so history/cloud displays and
 * restart-recovery keep working. If the venue is fully offline, the LAN relay
 * still runs — only persistence pauses until you're back online.
 *
 * Run:   bun run gateway          (from the project root)
 * Then open the printed http://<lan-ip>:8787/scoreboard/main on every device.
 */
import { networkInterfaces, hostname } from "node:os";
import type { ServerWebSocket } from "bun";
import { analyzeFootage, detectQuarters } from "./analyze";
import { generateTournament } from "./tournament";
import { publishToBdcsea } from "./bdcsea";
import { autoSchedule, type SchedConfig } from "./schedule";
import { scheduleAdvisor } from "./schedule-advisor";
import { startTelegramBot } from "./telegram";
import { publishLanInfo } from "./scoreboard";

// Bonjour/mDNS name (e.g. "Minhs-MacBook-Air.local") — stays constant across Wi-Fi /
// DHCP changes, unlike the IP. Devices that support mDNS (macOS, iOS, Windows w/ Bonjour)
// can use it as a permanent address so links don't break when the IP is reassigned.
function lanHost(): string {
  return hostname().split(".")[0] + ".local";
}

const PORT = Number(process.env.GATEWAY_PORT || 8787);
const ORIGIN = (process.env.GATEWAY_UPSTREAM || "https://fast-break-display.nguyentmktdn.workers.dev").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

type Court = Record<string, unknown>;
const courts = new Map<string, Court>();
const clients = new Set<ServerWebSocket<unknown>>();

// Background footage-analysis jobs (long-running) keyed by id, polled by the client.
type AnalyzeJob = { status: "running" | "done" | "error"; progress: string; report?: unknown; error?: string; at: number };
const analyzeJobs = new Map<string, AnalyzeJob>();

async function loadInitialState() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/game_state?select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (r.ok) {
      const rows = (await r.json()) as Court[];
      for (const row of rows) { const id = String(row.court_id); if (id) courts.set(id, row); }
      console.log(`  loaded ${rows.length} court(s) from Supabase`);
    }
  } catch (e) { console.warn("  could not load initial state:", (e as Error).message); }
}

function broadcast(obj: unknown, except?: ServerWebSocket<unknown>) {
  const s = JSON.stringify(obj);
  for (const c of clients) if (c !== except) { try { c.send(s); } catch { /* dropped */ } }
}

const HOP = ["host", "accept-encoding", "content-length", "connection"];

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 0,
  async fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/__gateway") {
      if (srv.upgrade(req)) return undefined;
      return new Response("expected websocket", { status: 426 });
    }
    if (url.pathname === "/__gateway/health") {
      // Report the gateway's own LAN IP(s) + port so the controller can auto-build
      // shareable OBS links for the CURRENT network, even when opened via localhost.
      return Response.json({ ok: true, courts: [...courts.keys()], clients: clients.size, lanIPs: lanIPs(), hostname: lanHost(), port: PORT, gemini: !!process.env.GEMINI_API_KEY });
    }

    // AI footage analysis (post-game). POST { courtId, videoUrl, commit?, fps? }.
    // Start an analysis JOB (returns immediately) — footage analysis of a long video
    // takes several minutes, far longer than an HTTP request should be held open.
    if (url.pathname === "/__gateway/analyze" && req.method === "POST") {
      try {
        const opts = (await req.json()) as {
          courtId?: string; videoUrl?: string; commit?: boolean; fps?: number;
          segments?: Array<{ quarter?: number; start: number; end: number }>;
        };
        if (!opts.courtId || !opts.videoUrl) return Response.json({ error: "courtId and videoUrl are required" }, { status: 400 });
        const jobId = crypto.randomUUID();
        analyzeJobs.set(jobId, { status: "running", progress: "Starting…", at: Date.now() });
        // drop jobs older than 30 min
        for (const [k, v] of analyzeJobs) if (Date.now() - v.at > 1_800_000) analyzeJobs.delete(k);
        analyzeFootage(
          { courtId: opts.courtId, videoUrl: opts.videoUrl, commit: opts.commit, fps: opts.fps, segments: opts.segments },
          (m) => { const j = analyzeJobs.get(jobId); if (j) { j.progress = m; j.at = Date.now(); } },
        )
          .then((report) => analyzeJobs.set(jobId, { status: "done", progress: "Done", report, at: Date.now() }))
          .catch((e) => analyzeJobs.set(jobId, { status: "error", progress: "", error: (e as Error).message, at: Date.now() }));
        return Response.json({ jobId });
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    // Generate a tournament bracket/schedule with AI (fast text call — synchronous).
    if (url.pathname === "/__gateway/generate-tournament" && req.method === "POST") {
      try {
        const o = (await req.json()) as { name?: string; teams?: string[]; format?: string; notes?: string };
        if (!o.name || !Array.isArray(o.teams) || o.teams.length < 2) return Response.json({ error: "name and at least 2 teams are required" }, { status: 400 });
        const result = await generateTournament({ name: o.name, teams: o.teams, format: o.format || "single_elim", notes: o.notes });
        return Response.json(result);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    // Auto-schedule a multi-division tournament onto courts + time slots (synchronous).
    if (url.pathname === "/__gateway/schedule" && req.method === "POST") {
      try {
        const cfg = (await req.json()) as SchedConfig;
        if (!Array.isArray(cfg.matches) || !cfg.matches.length) return Response.json({ error: "matches[] is required" }, { status: 400 });
        return Response.json(autoSchedule(cfg));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    // AI scheduling assistant (Gemini) — advice + optional improved config (synchronous).
    if (url.pathname === "/__gateway/schedule-advisor" && req.method === "POST") {
      try {
        const o = (await req.json()) as { message?: string; history?: any[]; config?: unknown; summary?: string };
        if (!o.message) return Response.json({ error: "message is required" }, { status: 400 });
        const out = await scheduleAdvisor({ message: o.message, history: o.history, config: o.config, summary: o.summary || "" });
        return Response.json(out);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    // Publish a tournament to the BDCSEA tour site (additive).
    if (url.pathname === "/__gateway/publish-bdcsea" && req.method === "POST") {
      try {
        const o = (await req.json()) as Parameters<typeof publishToBdcsea>[0];
        const result = await publishToBdcsea(o);
        return Response.json(result);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    // Poll an analysis job's status / result.
    if (url.pathname === "/__gateway/analyze-status") {
      const j = analyzeJobs.get(url.searchParams.get("job") || "");
      if (!j) return Response.json({ error: "unknown job" }, { status: 404 });
      return Response.json(j);
    }

    // Cheap pre-pass: auto-detect quarter start/end timestamps. POST { videoUrl }.
    if (url.pathname === "/__gateway/detect-quarters" && req.method === "POST") {
      try {
        const { videoUrl } = (await req.json()) as { videoUrl?: string };
        if (!videoUrl) return Response.json({ error: "videoUrl is required" }, { status: 400 });
        const jobId = crypto.randomUUID();
        analyzeJobs.set(jobId, { status: "running", progress: "Scanning the on-screen clock…", at: Date.now() });
        detectQuarters(videoUrl)
          .then((quarters) => analyzeJobs.set(jobId, { status: "done", progress: "Done", report: { quarters }, at: Date.now() }))
          .catch((e) => analyzeJobs.set(jobId, { status: "error", progress: "", error: (e as Error).message, at: Date.now() }));
        return Response.json({ jobId });
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    // Local shared clock — every LAN device calibrates to THIS, so they agree on "now".
    if (url.pathname === "/api/time") {
      return Response.json({ t: Date.now() }, { headers: { "cache-control": "no-store" } });
    }

    // Proxy everything else to the deployed app, served over http on the LAN.
    const headers = new Headers(req.headers);
    for (const h of HOP) headers.delete(h);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    let res: Response;
    try {
      res = await fetch(ORIGIN + url.pathname + url.search, { method: req.method, headers, body, redirect: "manual" });
    } catch (e) {
      return new Response(`Gateway cannot reach the app upstream (${ORIGIN}): ${(e as Error).message}`, { status: 502 });
    }
    const out = new Headers(res.headers);
    out.delete("content-encoding"); out.delete("content-length"); out.delete("transfer-encoding");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      ws.send(JSON.stringify({ type: "snapshot", courts: Object.fromEntries(courts) }));
    },
    message(ws, raw) {
      let msg: { type?: string; courtId?: string; patch?: Court };
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === "patch" && msg.courtId && msg.patch) {
        courts.set(msg.courtId, { ...(courts.get(msg.courtId) || {}), ...msg.patch });
        broadcast({ type: "patch", courtId: msg.courtId, patch: msg.patch }, ws); // sender already applied optimistically
      }
    },
    close(ws) { clients.delete(ws); },
  },
});

function lanIPs(): string[] {
  const out: string[] = [];
  const ifs = networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
  }
  return out;
}

await loadInitialState();

console.log("\n  🏀 BASKETBALL SCOREBOARD — LOCAL GATEWAY");
console.log("  ----------------------------------------");
console.log(`  upstream app : ${ORIGIN}`);
console.log(`  listening on : http://0.0.0.0:${PORT}`);
console.log(`  STABLE URL   : http://${lanHost()}:${PORT}/scoreboard/main   (survives IP changes)`);
for (const ip of lanIPs()) console.log(`  by IP        : http://${ip}:${PORT}/scoreboard/main`);
console.log("\n  Open that URL on the control laptop AND on the OBS machine(s).");
console.log("  Clock/score now sync over Wi-Fi instantly.\n");

// Announce this gateway's LAN address to the cloud so the public site can auto-offer a local link.
const announceLan = () => publishLanInfo({ hostname: lanHost(), lanIPs: lanIPs(), port: PORT })
  .then((ok) => ok && console.log(`  📡 published LAN address to cloud (auto local-link)`))
  .catch(() => {});
announceLan();
setInterval(announceLan, 5 * 60 * 1000); // refresh every 5 min (tracks IP changes)

startTelegramBot();

export {};
void server;
