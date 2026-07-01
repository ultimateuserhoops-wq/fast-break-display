/**
 * Client transport to the optional LAN gateway (gateway/server.ts).
 *
 * When the app is opened from the gateway (plain http on the local network), this
 * opens a same-origin WebSocket and becomes the realtime transport — clock/score
 * updates travel at LAN speed (~1–5ms) instead of through Supabase realtime.
 *
 * When the app is opened from the cloud (workers.dev / lovable), the WebSocket
 * never opens and everything transparently falls back to Supabase. Nothing else in
 * the app needs to know which mode it's in.
 */
type Patch = Record<string, unknown>;
type PatchListener = (courtId: string, patch: Patch) => void;
type SnapshotListener = (courts: Record<string, Patch>) => void;
type StatusListener = (open: boolean) => void;

const CLOUD_HOSTS = ["workers.dev", "lovable.app", "lovable.dev"];

let ws: WebSocket | null = null;
let isOpen = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: Record<string, Patch> = {};

const patchListeners = new Set<PatchListener>();
const snapshotListeners = new Set<SnapshotListener>();
const statusListeners = new Set<StatusListener>();

function isCloudHost(host: string) {
  return CLOUD_HOSTS.some((h) => host === h || host.endsWith("." + h) || host.endsWith(h));
}

function connect() {
  if (typeof window === "undefined") return;
  // Don't attempt a gateway socket on the public cloud host — there isn't one.
  if (isCloudHost(window.location.hostname)) return;

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  let sock: WebSocket;
  try {
    sock = new WebSocket(`${proto}://${window.location.host}/__gateway`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = sock;
  sock.onopen = () => {
    isOpen = true;
    statusListeners.forEach((l) => l(true));
  };
  sock.onmessage = (e) => {
    let msg: { type?: string; courtId?: string; patch?: Patch; courts?: Record<string, Patch> };
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "snapshot" && msg.courts) {
      lastSnapshot = msg.courts;
      snapshotListeners.forEach((l) => l(lastSnapshot));
    } else if (msg.type === "patch" && msg.courtId && msg.patch) {
      lastSnapshot[msg.courtId] = { ...(lastSnapshot[msg.courtId] || {}), ...msg.patch };
      patchListeners.forEach((l) => l(msg.courtId!, msg.patch!));
    }
  };
  sock.onclose = () => {
    if (ws === sock) ws = null;
    if (isOpen) statusListeners.forEach((l) => l(false));
    isOpen = false;
    scheduleReconnect();
  };
  sock.onerror = () => { try { sock.close(); } catch { /* noop */ } };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 1500);
}

export function gatewayConnected(): boolean {
  return isOpen;
}

/** Send a patch over the gateway. Returns false if the gateway isn't connected. */
export function gatewaySendPatch(courtId: string, patch: Patch): boolean {
  if (isOpen && ws) {
    try { ws.send(JSON.stringify({ type: "patch", courtId, patch })); return true; }
    catch { return false; }
  }
  return false;
}

export function gatewaySnapshotFor(courtId: string): Patch | undefined {
  return lastSnapshot[courtId];
}

export function onGatewayPatch(l: PatchListener): () => void {
  patchListeners.add(l);
  return () => patchListeners.delete(l);
}
export function onGatewaySnapshot(l: SnapshotListener): () => void {
  snapshotListeners.add(l);
  return () => snapshotListeners.delete(l);
}
export function onGatewayStatus(l: StatusListener): () => void {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
}

if (typeof window !== "undefined") connect();
