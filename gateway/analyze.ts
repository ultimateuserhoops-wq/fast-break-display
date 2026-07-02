/**
 * AI footage analysis — turn a game video into detailed per-player stats.
 *
 * Runs in the local gateway (no execution-time limit, Gemini key stays on this
 * machine). Flow: load the rosters + the scoreboard's official score → ask Gemini
 * to watch the video and return a structured play-by-play → map each event to a
 * roster player by jersey number → RECONCILE the AI-derived score against the
 * scoreboard (the scoreboard is ground truth) → optionally commit the events
 * (powers the shot chart / play-by-play / box score) and alert the admin on
 * Telegram (Hermes) if the scores disagree.
 *
 * Env:
 *   GEMINI_API_KEY            (required) Google AI Studio key
 *   GEMINI_MODEL              default "gemini-3.5-flash"
 *   SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY
 *   GATEWAY_OPERATOR_EMAIL / GATEWAY_OPERATOR_PASSWORD  (to write game_events)
 *   HERMES_TELEGRAM_TOKEN / HERMES_ADMIN_CHAT_ID        (optional, for the alert)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const OP_EMAIL = process.env.GATEWAY_OPERATOR_EMAIL || "operator@bdcvietnam.app";
const OP_PASSWORD = process.env.GATEWAY_OPERATOR_PASSWORD || process.env.SCOREBOARD_OPERATOR_PASSWORD || ""; // no hard-coded fallback — repo is public
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const TG_TOKEN = process.env.HERMES_TELEGRAM_TOKEN || "";
const TG_CHAT = process.env.HERMES_ADMIN_CHAT_ID || "";

const EVENT_TYPES = ["2PT_MADE", "2PT_MISS", "3PT_MADE", "3PT_MISS", "FT_MADE", "FT_MISS", "REB", "AST", "STL", "BLK", "TO", "FOUL"];

type Player = { id: string; name: string; jersey_number: string | null };
type AiEvent = {
  quarter?: number; ts?: string; team?: "home" | "away";
  playerNumber?: string | number; eventType?: string; points?: number;
  shotX?: number | null; shotY?: number | null; made?: boolean;
};

async function sget(path: string, token?: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase GET ${path} → ${r.status}`);
  return r.json();
}

async function operatorToken(): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email: OP_EMAIL, password: OP_PASSWORD }),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { access_token?: string }).access_token ?? null;
  } catch { return null; }
}

function rosterText(side: string, name: string, players: Player[]): string {
  const list = players
    .filter((p) => p.jersey_number)
    .map((p) => `#${p.jersey_number} ${p.name}`)
    .join(", ");
  return `${side.toUpperCase()} team "${name}": ${list || "(no roster)"}`;
}

function buildPrompt(homeName: string, awayName: string, home: Player[], away: Player[]): string {
  return [
    "You are an expert basketball statistician. Watch this game video and produce a DETAILED, accurate play-by-play.",
    "",
    "ROSTERS — identify the player who performs each action by reading their jersey number, then match it to this roster:",
    rosterText("home", homeName, home),
    rosterText("away", awayName, away),
    "",
    "Return ONLY a JSON object of this exact shape (no prose, no code fences):",
    `{"events":[{"quarter":1,"ts":"MM:SS","team":"home","playerNumber":"3","eventType":"2PT_MADE","points":2,"shotX":42,"shotY":18,"made":true}],"notes":"caveats"}`,
    "",
    "Rules:",
    `- eventType MUST be one of: ${EVENT_TYPES.join(", ")}.`,
    "- points: 3 for a made three, 2 for a made two, 1 for a made free throw, else 0.",
    "- ts = the video timestamp (MM:SS) when the event happens. quarter = game quarter 1-4.",
    "- team = 'home' or 'away'. playerNumber = the jersey number (string). If you truly cannot read it, omit playerNumber.",
    "- For SHOT attempts only (2PT/3PT made or miss), give shotX/shotY = where the shot was taken on a half-court:",
    "    shotX 0-100 = left sideline (0) to right sideline (100); shotY 0-100 = baseline under the basket (0) to half-court (100).",
    "    Decide 2PT vs 3PT by whether the shot is beyond the three-point arc. For non-shots set shotX/shotY null.",
    "- Read the on-screen scoreboard/clock to keep the running score and quarter consistent.",
    "- Be conservative: only include events you actually observe. Prefer correctness over volume.",
  ].join("\n");
}

// Generic "watch this video, return JSON" Gemini call.
async function geminiJson(
  videoUrl: string, prompt: string, fps: number, mediaResolution: string,
  seg?: { start: number; end: number },
): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set on the gateway");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const videoMetadata: Record<string, unknown> = { fps };
  if (seg) {
    // analyze only this time-window of the video (no re-upload) — denser, more accurate
    videoMetadata.startOffset = `${Math.max(0, Math.floor(seg.start))}s`;
    videoMetadata.endOffset = `${Math.floor(seg.end)}s`;
  }
  const body = {
    contents: [{ parts: [{ fileData: { fileUri: videoUrl }, videoMetadata }, { text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", mediaResolution },
  };
  // generous per-request cap so a hung Gemini/YouTube fetch fails gracefully instead of stalling forever
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(540_000),
  });
  const text = await r.text();
  if (!r.ok) {
    if (/exceeds the maximum number of tokens/i.test(text)) {
      throw new Error("This video is too long for one Gemini pass (it exceeds the frame/token limit). Turn ON “Analyze quarter-by-quarter” and use Auto-detect quarters, or trim to a shorter window.");
    }
    throw new Error(`Gemini ${r.status}: ${text.slice(0, 400)}`);
  }
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error("Gemini returned non-JSON envelope"); }
  const out = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  try { return JSON.parse(out); } catch { throw new Error(`Could not parse Gemini JSON. First 300 chars: ${out.slice(0, 300)}`); }
}

async function callGemini(
  videoUrl: string, prompt: string, fps: number, mediaResolution: string,
  seg?: { start: number; end: number },
): Promise<{ events: AiEvent[]; notes?: string }> {
  const parsed = await geminiJson(videoUrl, prompt, fps, mediaResolution, seg);
  return { events: Array.isArray(parsed?.events) ? parsed.events : [], notes: parsed?.notes };
}

function parseTs(v: unknown): number {
  const t = String(v ?? "").trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(":").map((x) => parseInt(x, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0); // MM:SS or HH:MM:SS → seconds
}

// Cheap low-FPS pre-pass: read the on-screen game clock to locate each quarter's
// start/end VIDEO timestamps, so the operator doesn't have to scrub manually.
export async function detectQuarters(videoUrl: string): Promise<Array<{ quarter: number; start: number; end: number }>> {
  const prompt = [
    "Watch this basketball game video and find where each quarter / period begins and ends.",
    "Use the on-screen game clock and period indicator: a new quarter starts when the game clock RESETS to the full period length and the period number increases. Ignore pre-game, time-outs and the half-time gap (the quarter end is when play/clock stops for the break).",
    "Return ONLY JSON of this shape — start/end are VIDEO timestamps (MM:SS, or HH:MM:SS for long videos):",
    `{"quarters":[{"quarter":1,"start":"2:05","end":"14:30"},{"quarter":2,"start":"15:10","end":"27:40"}]}`,
    "Include every quarter you can identify (usually 4). If unsure of an exact second, give your best estimate.",
  ].join("\n");
  // very cheap pass so even a 2–3h stream fits under the token limit: 1 frame / 10s, low res
  const parsed = await geminiJson(videoUrl, prompt, 0.1, "MEDIA_RESOLUTION_LOW");
  const qs = Array.isArray(parsed?.quarters) ? parsed.quarters : [];
  return qs
    .map((q: any, i: number) => ({ quarter: Number(q.quarter) || i + 1, start: parseTs(q.start), end: parseTs(q.end) }))
    .filter((q: any) => q.end > q.start);
}

function num(j: string | null | undefined): string {
  return String(j ?? "").replace(/\D/g, "");
}

export async function analyzeFootage(opts: {
  courtId: string; videoUrl: string; commit?: boolean; fps?: number; mediaResolution?: string;
  segments?: Array<{ quarter?: number; start: number; end: number }>;
}, onProgress?: (msg: string) => void) {
  const progress = (m: string) => { try { onProgress?.(m); } catch { /* noop */ } };
  const { courtId, videoUrl } = opts;
  const chunked = !!(opts.segments && opts.segments.length);
  // shorter windows can afford denser sampling → default 2 FPS when chunking, else 1
  // keep each pass under Gemini's ~1M-token limit: medium res, and ~1 fps. Whole-video
  // (un-chunked) only fits SHORT clips — long games must use quarter-by-quarter.
  const fps = opts.fps ?? 1;
  const mediaResolution = opts.mediaResolution ?? "MEDIA_RESOLUTION_MEDIUM";
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env not configured on the gateway");
  if (!videoUrl) throw new Error("videoUrl is required");

  // 1) scoreboard state + rosters
  const states = (await sget(`game_state?court_id=eq.${encodeURIComponent(courtId)}&select=*`)) as any[];
  const s = states[0];
  if (!s) throw new Error(`No game_state for court ${courtId}`);
  const home = s.home_team_id ? ((await sget(`players?team_id=eq.${s.home_team_id}&select=id,name,jersey_number`)) as Player[]) : [];
  const away = s.away_team_id ? ((await sget(`players?team_id=eq.${s.away_team_id}&select=id,name,jersey_number`)) as Player[]) : [];

  // 2) Gemini watches the video — whole, or quarter-by-quarter in parallel for accuracy
  const prompt = buildPrompt(s.home_name, s.away_name, home, away);
  let aiEvents: AiEvent[];
  let notes: string | undefined;
  let segments: Array<{ label: string; events: number }> = [];
  if (chunked) {
    // Run quarters ONE AT A TIME (not in parallel): Gemini fetches/caches the YouTube
    // video on the first call and reuses it for the rest — parallel calls each re-fetch
    // the whole video and stall/time out. A failed quarter is skipped, not fatal.
    const total = opts.segments!.length;
    const results: Array<{ q: number; events: AiEvent[]; notes?: string; failed?: boolean }> = [];
    for (let i = 0; i < total; i++) {
      const seg = opts.segments![i];
      const q = seg.quarter ?? i + 1;
      progress(`Analyzing window ${i + 1}/${total} (Q${q})${i === 0 ? " — first one is slow, loading the video…" : "…"}`);
      const segPrompt = `${prompt}\n\nThis clip is part of QUARTER ${q} of the game. Report only events within this clip; ts is the time within this clip.`;
      try {
        const r = await callGemini(videoUrl, segPrompt, fps, mediaResolution, { start: seg.start, end: seg.end });
        results.push({ q, events: r.events.map((e) => ({ ...e, quarter: q })), notes: r.notes });
      } catch (e) {
        results.push({ q, events: [], notes: `failed: ${(e as Error).message.slice(0, 120)}`, failed: true });
      }
    }
    aiEvents = results.flatMap((r) => r.events);
    notes = results.map((r) => (r.failed ? `Q${r.q} window failed: ${r.notes}` : "")).filter(Boolean).join(" · ") || undefined;
    // aggregate per quarter for the report (16 windows → 4 quarter rows)
    const byQ = new Map<number, { events: number; failed: boolean }>();
    for (const r of results) {
      const cur = byQ.get(r.q) ?? { events: 0, failed: false };
      cur.events += r.events.length;
      if (r.failed) cur.failed = true;
      byQ.set(r.q, cur);
    }
    segments = [...byQ.entries()].sort((a, b) => a[0] - b[0]).map(([q, v]) => ({ label: v.failed ? `Q${q} ⚠` : `Q${q}`, events: v.events }));
  } else {
    progress("Analyzing the video…");
    const r = await callGemini(videoUrl, prompt, fps, mediaResolution);
    aiEvents = r.events; notes = r.notes;
  }
  progress("Matching players & reconciling the score…");

  // 3) map to roster players + game_events rows
  const byNum = (players: Player[]) => new Map(players.map((p) => [num(p.jersey_number), p]));
  const homeMap = byNum(home), awayMap = byNum(away);
  let aiHome = 0, aiAway = 0;
  const rows = aiEvents
    .filter((e) => e.team === "home" || e.team === "away")
    .map((e) => {
      const side = e.team as "home" | "away";
      const pl = (side === "home" ? homeMap : awayMap).get(num(String(e.playerNumber ?? "")));
      const pts = Number(e.points) || 0;
      if (side === "home") aiHome += pts; else aiAway += pts;
      const isShot = /^(2PT|3PT)_(MADE|MISS)$/.test(String(e.eventType));
      const note = isShot && e.shotX != null && e.shotY != null
        ? JSON.stringify({ x: Math.round(Number(e.shotX)), y: Math.round(Number(e.shotY)), src: "ai" })
        : "ai";
      return {
        court_id: courtId,
        team_side: side,
        team_id: side === "home" ? s.home_team_id : s.away_team_id,
        player_id: pl?.id ?? null,
        player_name: pl?.name ?? null,
        player_number: pl?.jersey_number ?? (e.playerNumber != null ? String(e.playerNumber) : null),
        event_type: String(e.eventType),
        points: pts,
        quarter: Number(e.quarter) || 1,
        note,
        _ts: e.ts ?? null,
        _matched: !!pl,
      };
    })
    .filter((r) => EVENT_TYPES.includes(r.event_type));

  // 4) reconcile vs the scoreboard (ground truth)
  const official = { home: Number(s.home_score) || 0, away: Number(s.away_score) || 0 };
  const aiScore = { home: aiHome, away: aiAway };
  const mismatch = aiScore.home !== official.home || aiScore.away !== official.away;
  const unmatched = rows.filter((r) => !r._matched).length;

  const report = {
    court: courtId, videoUrl, model: GEMINI_MODEL,
    homeName: s.home_name, awayName: s.away_name,
    officialScore: official, aiScore, mismatch,
    eventCount: rows.length, unmatchedPlayers: unmatched,
    chunked, segments,
    notes: notes ?? null,
    events: rows,
    committed: false as boolean,
    alerted: false as boolean,
  };

  // 5) commit (replace previous AI events) + alert
  if (opts.commit) {
    const token = await operatorToken();
    if (!token) throw new Error("Could not authenticate operator to write game_events (check GATEWAY_OPERATOR_PASSWORD)");
    // remove prior AI-sourced events for this court so re-runs are idempotent
    await fetch(`${SUPABASE_URL}/rest/v1/game_events?court_id=eq.${encodeURIComponent(courtId)}&note=like.*"src":"ai"*`, {
      method: "DELETE", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
    });
    await fetch(`${SUPABASE_URL}/rest/v1/game_events?court_id=eq.${encodeURIComponent(courtId)}&note=eq.ai`, {
      method: "DELETE", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
    });
    const insertRows = rows.map(({ _ts, _matched, ...r }) => r);
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/game_events`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(insertRows),
    });
    if (!ins.ok) throw new Error(`Inserting events failed: ${ins.status} ${(await ins.text()).slice(0, 300)}`);
    report.committed = true;
  }

  if (mismatch && TG_TOKEN && TG_CHAT) {
    const msg = [
      "🏀 *Score check — mismatch*",
      `${s.home_name} vs ${s.away_name} (court ${courtId})`,
      `Scoreboard (official): ${official.home}-${official.away}`,
      `AI play-by-play:        ${aiScore.home}-${aiScore.away}`,
      unmatched ? `⚠️ ${unmatched} events with an unreadable jersey number` : "",
      "Please review the play-by-play.",
    ].filter(Boolean).join("\n");
    try {
      const tg = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: "Markdown" }),
      });
      report.alerted = tg.ok;
    } catch { /* alert is best-effort */ }
  }

  return report;
}
