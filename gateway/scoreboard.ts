// Write access to the SCOREBOARD Supabase (the working model the web Tournament Hub
// reads). Its `tournaments` table is anon-read but auth-write, so the gateway signs in
// once as the operator (password grant, token cached + refreshed) and inserts with that
// bearer token — no RLS loosening, the service key never leaves this LAN gateway.
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const EMAIL = process.env.SCOREBOARD_OPERATOR_EMAIL || "operator@bdcvietnam.app";
const PASS = process.env.SCOREBOARD_OPERATOR_PASSWORD || "";

export function scoreboardConfigured() { return !!(URL && ANON && PASS); }

let tok = { access: "", exp: 0 };
async function token(): Promise<string> {
  if (tok.access && Date.now() < tok.exp - 60_000) return tok.access;
  if (!scoreboardConfigured()) throw new Error("Scoreboard operator creds aren't set on the gateway (need SCOREBOARD_OPERATOR_PASSWORD).");
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Scoreboard sign-in failed: ${j.error_description || j.msg || r.status}`);
  tok = { access: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tok.access;
}

/** Insert a new tournament (working model) and return its id. */
// Publish this gateway's LAN address (stable .local name + IPs) to a public storage object so
// the CLOUD site can auto-discover it and offer a "local network" link without manual entry.
export async function publishLanInfo(info: { hostname: string; lanIPs: string[]; port: number }): Promise<boolean> {
  if (!scoreboardConfigured()) return false;
  try {
    const t = await token();
    const r = await fetch(`${URL}/storage/v1/object/team-logos/_gateway.json`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${t}`, "content-type": "application/json", "x-upsert": "true" },
      body: JSON.stringify({ ...info, ts: Date.now() }),
    });
    return r.ok;
  } catch { return false; }
}

export async function createTournament(name: string, data: unknown): Promise<string> {
  const t = await token();
  const r = await fetch(`${URL}/rest/v1/tournaments`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${t}`, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ name, format: "multi", status: "scheduled", data }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Create tournament failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j?.[0]?.id;
}

/** Replace the tournament's working model in place (keeps its id) — or insert if none exists.
 *  If several rows share the name, the first is updated and the duplicates are removed. */
export async function upsertTournament(name: string, data: unknown): Promise<{ id: string; updated: boolean }> {
  const t = await token();
  const q = await fetch(`${URL}/rest/v1/tournaments?name=eq.${encodeURIComponent(name)}&select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
  const rows = await q.json();
  if (Array.isArray(rows) && rows.length) {
    const id = rows[0].id;
    const r = await fetch(`${URL}/rest/v1/tournaments?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: ANON, Authorization: `Bearer ${t}`, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ data, format: "multi", status: "scheduled" }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Update tournament failed: ${JSON.stringify(j).slice(0, 200)}`);
    for (const extra of rows.slice(1)) await fetch(`${URL}/rest/v1/tournaments?id=eq.${extra.id}`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
    return { id, updated: true };
  }
  const id = await createTournament(name, data);
  return { id, updated: false };
}
