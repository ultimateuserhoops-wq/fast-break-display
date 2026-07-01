import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/Nav";
import { useGameState } from "@/lib/game-state";
import { Copy, ExternalLink, ArrowLeft, Wifi, Globe, Pencil } from "lucide-react";
import { toast } from "sonner";
import { CLOUD_ORIGIN, onGatewayHost, rememberedLanBase, setRememberedLanBase, captureGatewayLan, fetchPublishedLan } from "@/lib/lan";

export const Route = createFileRoute("/_authenticated/sources/$courtId")({
  head: () => ({ meta: [{ title: "OBS Browser Sources — BDC" }] }),
  component: ObsSources,
});

const SOURCES = [
  { key: "timer", label: "OBS Timer", desc: "Game clock + shot clock (round or rectangular)." },
  { key: "display1", label: "OBS Display 1 (Arena)", desc: "Full arena board — Katigo / ARENA1 / NCAA1." },
  { key: "display2", label: "OBS Display 2 (Scorebug)", desc: "Broadcast lower-third — ESPN 1 / ESPN 2 / NBA." },
] as const;

function ObsSources() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);

  const localOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const onGateway = onGatewayHost();
  // Remembered gateway LAN address (learned on a prior gateway visit) — lets the CLOUD page
  // still offer a local link; editable by hand when auto-detection isn't available.
  const [savedLan, setSavedLan] = useState<string | null>(rememberedLanBase());
  useEffect(() => {
    captureGatewayLan().then((r) => { if (r) setSavedLan(r.base); });
    if (!onGateway) fetchPublishedLan().then((r) => { if (r) { setSavedLan(r.base); setAltIps(r.ips); } }); // cloud: auto-pull published address + IPs
  }, [onGateway]);

  // Ask the gateway for a STABLE address (its .local hostname, which survives Wi-Fi/IP
  // changes) and its current IPs. Prefer the hostname so links don't break when DHCP
  // reassigns the IP; fall back to the IP, then to the address we were opened on.
  const [lanBase, setLanBase] = useState<string>(localOrigin);
  const [altIps, setAltIps] = useState<string[]>([]);
  useEffect(() => {
    if (!onGateway) return;
    let active = true;
    fetch(`${localOrigin}/__gateway/health`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { lanIPs?: string[]; hostname?: string; port?: number } | null) => {
        if (!active || !info) return;
        const port = info.port ?? 8787;
        const ips = (info.lanIPs ?? []).map((ip) => `http://${ip}:${port}`);
        if (info.hostname) {
          setLanBase(`http://${info.hostname}:${port}`); // stable .local name
          setAltIps(ips);                                 // IPs as fallback
        } else if (ips.length) {
          setLanBase(ips[0]);
          setAltIps(ips.slice(1));
        }
      })
      .catch(() => { /* keep the fallback (the address we were opened on) */ });
    return () => { active = false; };
  }, [onGateway, localOrigin]);

  const usingHostname = /\.local:/.test(lanBase);

  // The address lines shown under EACH display. "Local network" auto-follows the exact address
  // you opened this page on (so it tracks whatever proxy / LAN host you're using); the gateway's
  // stable .local name and the cloud URL are listed too.
  const origins = useMemo(() => {
    const out: Array<{ id: string; label: string; hint: string; origin: string; icon: "wifi" | "globe"; accent: boolean }> = [];
    if (onGateway && localOrigin && localOrigin !== CLOUD_ORIGIN) {
      out.push({ id: "local", label: "Local network (this address)", hint: "Auto-follows the address you opened this page on — use when OBS is on the same network (fastest).", origin: localOrigin, icon: "wifi", accent: true });
    }
    // Stable LAN address: the gateway's .local name when on-site, else the saved venue address (so the cloud page can still show a local link).
    const stable = onGateway ? lanBase : savedLan;
    if (stable && stable !== CLOUD_ORIGIN && stable !== localOrigin) {
      out.push({
        id: "lan",
        label: onGateway ? (usingHostname ? "Same network (stable name)" : "Same network") : "Local network (this venue)",
        hint: onGateway ? "This computer's stable .local name — keeps working even when its IP changes." : "Your venue gateway, saved from an on-site visit — use when OBS is on the same Wi-Fi (instant).",
        origin: stable, icon: "wifi", accent: !onGateway,
      });
    }
    // Raw-IP line — the ".local" name needs Bonjour, which most Windows/Android machines lack,
    // so the IP is the link that "just works" for them on the same network.
    const ipUrl = altIps[0];
    if (ipUrl && ipUrl !== CLOUD_ORIGIN && ipUrl !== localOrigin && ipUrl !== stable) {
      out.push({ id: "lanip", label: "Local network (IP — for Windows/Android)", hint: "Use this where the “.local” name doesn’t resolve (most Windows/Android). Same network only; the IP can change between sessions.", origin: ipUrl, icon: "wifi", accent: false });
    }
    out.push({ id: "cloud", label: "Cloud (works anywhere)", hint: "Use when OBS streams from a different location; syncs via the cloud (~½s behind).", origin: CLOUD_ORIGIN, icon: "globe", accent: false });
    return out;
  }, [localOrigin, onGateway, lanBase, savedLan, usingHostname, altIps]);

  function editLan() {
    const v = window.prompt("Local network gateway address (e.g. http://Minhs-MacBook-Air.local:8787 or http://192.168.0.132:8787):", savedLan || "http://");
    if (v === null) return;
    const trimmed = v.trim().replace(/\/$/, "");
    setRememberedLanBase(trimmed || null);
    setSavedLan(trimmed || null);
    toast.success(trimmed ? "Local network address saved" : "Local network address cleared");
  }

  function copy(u: string) { navigator.clipboard.writeText(u); toast.success("Copied OBS URL"); }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link to="/scoreboard/$courtId" params={{ courtId }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Court Control
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight">OBS Browser Sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add these as <span className="font-semibold">Browser</span> sources in OBS for{" "}
          <span className="font-semibold">{s?.tournament_name || courtId}</span>. Recommended size 1920×1080, transparent background.
        </p>

        {origins.length > 1 && (
          <div className="mt-4 rounded-xl border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Each display has one line per address.</span> Use the{" "}
            <span className="font-semibold">Local network</span> line when OBS is on the same Wi-Fi as this controller
            (fastest); use the <span className="font-semibold">Cloud</span> line when OBS is in a different location.
          </div>
        )}

        {/* On the cloud site we can't auto-detect the venue LAN address — let the user set it once. */}
        {!onGateway && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-card p-3 text-xs">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            {savedLan
              ? <><span className="text-muted-foreground">Local network address:</span> <code className="rounded bg-secondary px-2 py-0.5">{savedLan}</code></>
              : <span className="text-muted-foreground">No on-site gateway detected yet — the local link appears automatically once your gateway is running (it publishes its address to the cloud). You can also set it manually.</span>}
            <button onClick={editLan} className="ml-auto flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold hover:bg-secondary"><Pencil className="h-3 w-3" /> {savedLan ? "Change" : "Set address"}</button>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {SOURCES.map((src) => (
            <div key={src.key} className="rounded-2xl border bg-card p-4">
              <h3 className="text-sm font-black">{src.label}</h3>
              <p className="text-xs text-muted-foreground">{src.desc}</p>
              <div className="mt-3 space-y-2.5">
                {origins.map((o) => {
                  const path = `${o.origin}/obs/${src.key}/${courtId}`;
                  return (
                    <div key={o.id}>
                      <div className="mb-1 flex items-center gap-1.5">
                        {o.icon === "wifi" ? <Wifi className="h-3.5 w-3.5 text-muted-foreground" /> : <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{o.label}</span>
                        {o.accent && <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">on-site</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded-md bg-secondary px-3 py-2 text-[11px]">{path}</code>
                        <a href={path} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold hover:bg-secondary" title="Open"><ExternalLink className="h-3.5 w-3.5" /></a>
                        <button onClick={() => copy(path)} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold hover:bg-secondary" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                      </div>
                      {o.id === "lanip" && altIps.length > 1 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">Other IPs: {altIps.slice(1).map((b) => b.replace(/^https?:\/\//, "")).join(", ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
