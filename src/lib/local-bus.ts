/**
 * INSTANT same-device relay via BroadcastChannel — for an "extended display" opened on the SAME
 * machine as the control panel (via the Display View launcher). Messages travel in-browser memory
 * between windows/tabs of the same origin: ~0ms, no network, works even with the internet down.
 *
 * This is the local twin of realtime-bus (cloud) and gateway (LAN). The control posts every patch;
 * a local display window applies it immediately — so score and clock changes are truly instant.
 */
type Patch = Record<string, unknown>;
type Listener = (courtId: string, patch: Patch) => void;

const listeners = new Set<Listener>();
let bc: BroadcastChannel | null = null;

function ensure(): BroadcastChannel | null {
  if (bc) return bc;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  bc = new BroadcastChannel("bdc_local_scoreboard");
  bc.onmessage = (e) => {
    const d = e.data as { courtId?: string; patch?: Patch } | null;
    if (d?.courtId && d.patch) listeners.forEach((l) => l(d.courtId!, d.patch!));
  };
  return bc;
}

if (typeof window !== "undefined") ensure();

/** Relay a patch to every OTHER same-origin window on this device (instant, in-memory). */
export function localSendPatch(courtId: string, patch: Patch) {
  try { ensure()?.postMessage({ courtId, patch }); } catch { /* noop */ }
}

export function onLocalPatch(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * True when this window is a LOCAL extended display (opened by the Display View launcher with
 * ?local=1). Such a window is fed instantly by BroadcastChannel, so its clock needs NO broadcast
 * buffer — it should track the control exactly, with zero delay.
 */
export function isLocalDisplay(): boolean {
  if (typeof window === "undefined") return false;
  try { return new URLSearchParams(window.location.search).get("local") === "1"; } catch { return false; }
}
