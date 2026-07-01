// Remembering the LAN gateway address so the CLOUD site can still offer "local network" links.
// The cloud page can't reach or guess the gateway's LAN IP, so: whenever the app is opened via
// the gateway (a .local / LAN-IP host that answers /__gateway/health) we save that stable address;
// the cloud pages then read it back to show LAN links + a "open on local network" option. The user
// can also set/clear it by hand.
export const CLOUD_ORIGIN = "https://fast-break-display.nguyentmktdn.workers.dev";
const KEY = "bdc_lan_base";

const isCloudHost = (h: string) => /workers\.dev$|lovable\.(app|dev)$/.test(h);

/** Are we currently being served by the local gateway (not cloud, not the vite dev server)? */
export function onGatewayHost(): boolean {
  if (typeof window === "undefined") return false;
  return !isCloudHost(window.location.hostname);
}

export function rememberedLanBase(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}
export function setRememberedLanBase(base: string | null) {
  try { if (base) localStorage.setItem(KEY, base.replace(/\/$/, "")); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// The gateway publishes its address to this public storage object; the cloud page reads it to
// auto-fill the local link (no manual entry, no prior on-site visit needed).
const SB_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || "";
export async function fetchPublishedLan(): Promise<{ base: string; ips: string[] } | null> {
  if (!SB_URL) return null;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/public/team-logos/_gateway.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json() as { hostname?: string; lanIPs?: string[]; port?: number; ts?: number };
    if (!d?.ts || Date.now() - d.ts > 30 * 60 * 1000) return null; // ignore a stale gateway (offline >30 min)
    const port = d.port ?? 8787;
    const ips = (Array.isArray(d.lanIPs) ? d.lanIPs : []).map((ip) => `http://${ip}:${port}`);
    const base = d.hostname ? `http://${d.hostname}:${port}` : (ips[0] || null);
    if (!base) return null;
    setRememberedLanBase(base);
    return { base, ips };
  } catch { return null; }
}

/** If opened via the gateway, learn its stable .local address (+ IPs) for later use on the cloud. */
export async function captureGatewayLan(): Promise<{ base: string; ips: string[] } | null> {
  if (typeof window === "undefined" || isCloudHost(window.location.hostname)) return null;
  const origin = window.location.origin;
  try {
    const r = await fetch(`${origin}/__gateway/health`, { cache: "no-store" });
    if (!r.ok) return null;
    const info = (await r.json()) as { lanIPs?: string[]; hostname?: string; port?: number };
    const port = info.port ?? 8787;
    const ips = (info.lanIPs ?? []).map((ip) => `http://${ip}:${port}`);
    const base = info.hostname ? `http://${info.hostname}:${port}` : (ips[0] || origin);
    setRememberedLanBase(base);
    return { base, ips };
  } catch { return null; }
}
