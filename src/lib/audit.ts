import { supabase } from "@/integrations/supabase/client";
import type { GameState } from "@/lib/game-state";

/* Operator audit trail.
 *
 * Everyone signs in with ONE shared account, so Supabase auth can't answer
 * "who changed the score at 3:47pm?". Each device instead stores an operator
 * name (asked at login) and every game-state change is queued here and flushed
 * to a per-court, per-session JSON file in storage:
 *
 *   team-photos/audit/{courtId}/{sessionId}.json
 *
 * One file per device session — each device only ever rewrites ITS OWN file,
 * so concurrent operators can't clobber each other's log. Flushes are batched
 * (every ~15s, or sooner when the queue grows), which keeps the added storage
 * traffic to a couple of requests per minute per active control panel.
 */

const BUCKET = "team-photos";
const PREFIX = "audit";
const NAME_KEY = "bdc_operator_name";
const MAX_ENTRIES = 600;          // per session file — plenty for one game
const FLUSH_MS = 15_000;
const FLUSH_AT = 25;              // flush early if this many entries are pending

export function getOperatorName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) || "";
}
export function setOperatorName(name: string) {
  try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* ignore */ }
}

export type AuditEntry = { ts: number; op: string; action: string };
type SessionLog = { operator: string; device: string; started: number; entries: AuditEntry[] };

// One session per page load; the id makes the storage filename unique per device+load.
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const sessions = new Map<string, SessionLog>(); // courtId → log
const dirty = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

// Cosmetic pulse counters ride along with score patches — logging them is pure noise.
const SKIP_FIELDS = new Set(["three_pulse_home", "three_pulse_away", "buzzer_pulse"]);

function describePatch(patch: Partial<GameState>): string {
  const parts = Object.entries(patch)
    .filter(([k]) => !SKIP_FIELDS.has(k))
    .map(([k, v]) => `${k}=${v === null ? "null" : Array.isArray(v) ? `[${v.length}]` : String(v)}`);
  return parts.join(" ");
}

export function recordAudit(courtId: string, patch: Partial<GameState>) {
  if (typeof window === "undefined") return;
  const action = describePatch(patch);
  if (!action) return; // patch contained only skipped fields
  let log = sessions.get(courtId);
  if (!log) {
    log = { operator: getOperatorName() || "unnamed", device: navigator.userAgent.slice(0, 80), started: Date.now(), entries: [] };
    sessions.set(courtId, log);
  }
  log.operator = getOperatorName() || log.operator; // pick up a renamed operator mid-session
  log.entries.push({ ts: Date.now(), op: log.operator, action });
  if (log.entries.length > MAX_ENTRIES) log.entries.splice(0, log.entries.length - MAX_ENTRIES);
  dirty.add(courtId);

  if (!timer) {
    timer = setInterval(() => { void flush(); }, FLUSH_MS);
    // Best-effort final flush when the tab closes (sendBeacon-less; a lost tail is acceptable).
    window.addEventListener("beforeunload", () => { void flush(); });
  }
  if (log.entries.length % FLUSH_AT === 0) void flush(courtId);
}

async function flush(onlyCourt?: string) {
  for (const courtId of [...dirty]) {
    if (onlyCourt && courtId !== onlyCourt) continue;
    const log = sessions.get(courtId);
    if (!log) { dirty.delete(courtId); continue; }
    dirty.delete(courtId);
    try {
      const body = new Blob([JSON.stringify(log)], { type: "application/json" });
      await supabase.storage.from(BUCKET).upload(`${PREFIX}/${courtId}/${sessionId}.json`, body, { upsert: true, contentType: "application/json" });
    } catch {
      dirty.add(courtId); // retry on the next tick — the queue still holds everything
    }
  }
}

/* ---- Viewer ---- */
export type AuditRow = AuditEntry & { session: string };

export async function listAudit(courtId: string, limit = 300): Promise<AuditRow[]> {
  const { data: files } = await supabase.storage.from(BUCKET).list(`${PREFIX}/${courtId}`, {
    limit: 40, sortBy: { column: "updated_at", order: "desc" },
  });
  if (!files?.length) return [];
  const rows: AuditRow[] = [];
  await Promise.all(files.filter((f) => f.name.endsWith(".json")).slice(0, 12).map(async (f) => {
    try {
      const url = supabase.storage.from(BUCKET).getPublicUrl(`${PREFIX}/${courtId}/${f.name}`).data.publicUrl;
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const log: SessionLog = await r.json();
      for (const e of log.entries) rows.push({ ...e, session: f.name.replace(/\.json$/, "") });
    } catch { /* skip unreadable session file */ }
  }));
  rows.sort((a, b) => b.ts - a.ts);
  return rows.slice(0, limit);
}
