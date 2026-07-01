import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Hash, Timer, MonitorPlay, Wifi, type LucideIcon } from "lucide-react";
import { patchGameState } from "@/lib/game-state";
import { onGatewayHost, rememberedLanBase, setRememberedLanBase, captureGatewayLan, fetchPublishedLan } from "@/lib/lan";

// Top "control room" quick-access for the home page — the four operator entry points,
// styled per the supplied feature-card UI (Poppins, rounded tile, hover-lift).
const COURT = "main";

type Item = { title: string; desc: string; icon: LucideIcon; color: string; onClick: () => void | Promise<void> };

export default function ScoreboardQuickAccess() {
  const navigate = useNavigate();
  // On the gateway: remember its LAN address. On the cloud: pull the address the gateway published.
  useEffect(() => { captureGatewayLan(); if (!onGatewayHost()) fetchPublishedLan(); }, []);
  const openMode = async (mode: "full" | "3x3") => {
    await patchGameState(COURT, { mode }).catch(() => { /* not signed in yet — the route guard will prompt login */ });
    navigate({ to: "/scoreboard/$courtId", params: { courtId: COURT } });
  };
  // Open the scoreboard served by the on-site gateway (instant LAN sync). Auto-resolves the address:
  // remembered → published-by-gateway → (last resort) ask once.
  const openLocal = async () => {
    if (onGatewayHost()) { navigate({ to: "/scoreboard/$courtId", params: { courtId: COURT } }); return; }
    let base = rememberedLanBase() || (await fetchPublishedLan())?.base || null;
    if (!base) {
      const v = window.prompt("Couldn't auto-detect your gateway. Enter its address (e.g. http://Minhs-MacBook-Air.local:8787 or http://192.168.0.132:8787):", "http://");
      if (!v) return;
      base = v.trim().replace(/\/$/, ""); setRememberedLanBase(base);
    }
    window.open(`${base}/scoreboard/${COURT}`, "_blank", "noopener");
  };

  const items: Item[] = [
    { title: "Full Scoreboard", desc: "Complete 5-on-5 control — score, fouls, clocks, rosters and play-by-play.", icon: LayoutDashboard, color: "var(--brand-orange)", onClick: () => openMode("full") },
    { title: "33 Scoreboard", desc: "3x3 ruleset — single 10-min period, 12s shot clock, first to 21.", icon: Hash, color: "var(--brand-red)", onClick: () => openMode("3x3") },
    { title: "OBS Timer Control", desc: "Dedicated game & shot clock that drives every display — fullscreen ready.", icon: Timer, color: "var(--brand-blue)", onClick: () => navigate({ to: "/timekeeper/$courtId", params: { courtId: COURT } }) },
    { title: "OBS Display", desc: "Broadcast browser-source links and live display styles for OBS.", icon: MonitorPlay, color: "#16a34a", onClick: () => navigate({ to: "/sources/$courtId", params: { courtId: COURT } }) },
    { title: "Local Network", desc: "Open the scoreboard from your on-site gateway for instant, low-latency LAN sync.", icon: Wifi, color: "#0891b2", onClick: openLocal },
  ];

  return (
    <section className="w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');`}</style>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.title}
              onClick={it.onClick}
              className="group rounded-2xl border bg-card p-5 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="grid h-14 w-14 place-items-center rounded-xl text-white shadow-sm" style={{ background: it.color }}>
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{it.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
              <p className="mt-4 text-xs font-semibold text-foreground/70 transition group-hover:text-foreground">Open →</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
