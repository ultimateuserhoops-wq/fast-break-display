/**
 * Fast cloud relay for scoreboard patches via Supabase Realtime BROADCAST.
 *
 * The persistent path (`postgres_changes`) has to go DB-write → WAL → broadcast, which is ~0.8s —
 * enough to feel like "major lag" between the control panel and a cloud display. A broadcast channel
 * is a direct peer relay (~75ms), so we send every patch on it too. The DB write still happens (for
 * persistence, restart recovery, and late joiners); this just gets the pixels moving 10× sooner.
 *
 * On the LAN gateway the WebSocket is even faster and is preferred; the broadcast is idempotent, so
 * receiving both does no harm (a patch sets the same absolute values either way).
 */
import { supabase } from "@/integrations/supabase/client";

type Patch = Record<string, unknown>;
type Listener = (courtId: string, patch: Patch) => void;

const listeners = new Set<Listener>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let subscribed = false;

function ensure() {
  if (channel) return channel;
  channel = supabase
    .channel("bdc_live", { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "patch" }, (msg) => {
      const p = (msg.payload || {}) as { courtId?: string; patch?: Patch };
      if (p.courtId && p.patch) listeners.forEach((l) => l(p.courtId!, p.patch!));
    })
    .subscribe((st) => { subscribed = st === "SUBSCRIBED"; });
  return channel;
}

if (typeof window !== "undefined") ensure();

/** Relay a patch to every other client over the broadcast channel (fire-and-forget). */
export function busSendPatch(courtId: string, patch: Patch) {
  const ch = ensure();
  if (!subscribed) return; // not ready yet — postgres_changes will carry it
  try { ch.send({ type: "broadcast", event: "patch", payload: { courtId, patch } }); } catch { /* noop */ }
}

export function onBusPatch(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
