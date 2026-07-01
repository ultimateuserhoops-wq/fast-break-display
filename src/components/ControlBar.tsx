import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, MonitorPlay, SlidersHorizontal, LayoutGrid, ExternalLink, LayoutDashboard, Hash, Timer } from "lucide-react";
import { patchGameState, useSmoothGameClock, useSmoothShotTenths, formatClock, formatShotClock, type GameState } from "@/lib/game-state";
import { gatewayConnected, onGatewayStatus } from "@/lib/gateway";

// Compact live timer pinned in the nav bar — always visible while scrolling the control panel.
function NavTimer({ s }: { s: GameState }) {
  const game = useSmoothGameClock(s);
  const shot = useSmoothShotTenths(s);
  const period = s.quarter >= 5 ? `OT${s.quarter - 4}` : `Q${s.quarter}`;
  const [lan, setLan] = useState(gatewayConnected());
  useEffect(() => { setLan(gatewayConnected()); return onGatewayStatus(setLan); }, []);
  return (
    <div className="ml-auto flex items-center gap-3">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-black ${lan ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
        title={lan ? "Synced over the LAN gateway — displays match within ~40ms" : "Synced via the cloud (~0.6s). Open this page (and OBS) on the :8787 LAN link for instant sync."}
      >
        {lan ? "LAN" : "CLOUD"}
      </span>
      <span className={`h-2 w-2 rounded-full ${s.game_clock_running ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40"}`} title={s.game_clock_running ? "Running" : "Stopped"} />
      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-black">{period}</span>
      <span className="flex items-baseline gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Game</span>
        <span className="clock-digits text-xl font-black tabular-nums leading-none" style={{ color: "var(--amber-clock)" }}>{formatClock(game)}</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Shot</span>
        <span className="clock-digits text-xl font-black tabular-nums leading-none" style={{ color: "var(--red-shot)" }}>{formatShotClock(shot)}</span>
      </span>
    </div>
  );
}

/* A small click-to-open dropdown that closes on outside-click / Escape. */
function Dropdown({
  label, icon, children, align = "left",
}: {
  label: string;
  icon?: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${open ? "bg-foreground text-background" : "hover:bg-secondary"}`}
      >
        {icon}
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`absolute z-50 mt-2 min-w-[240px] rounded-xl border bg-card p-3 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function StyleRow({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${value === val ? "bg-foreground text-background" : "hover:bg-secondary"}`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

// Opens a scoreboard/timer display in its OWN browser window (per court), pre-sized. Drag it to an
// extended monitor, then press F on it for chrome-free fullscreen (see FullscreenToggle).
function DisplayViewLauncher({ courtId }: { courtId: string }) {
  const displays = [
    { key: "display1", label: "Full Scoreboard", icon: LayoutDashboard, path: `/obs/display1/${courtId}` },
    { key: "display2", label: "Scorebug", icon: Hash, path: `/obs/display2/${courtId}` },
    { key: "timer", label: "Timer", icon: Timer, path: `/obs/timer/${courtId}` },
  ];
  const open = (path: string, key: string) => {
    if (typeof window === "undefined") return;
    // ?local=1 → the window syncs INSTANTLY from this control via BroadcastChannel (same device,
    // no network) with zero clock delay. Perfect for an extended monitor / second screen.
    window.open(`${window.location.origin}${path}?local=1`, `bdc_display_${key}_${courtId}`, "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
  };
  return (
    <Dropdown label="Display View" icon={<MonitorPlay className="h-3.5 w-3.5" />}>
      {(close) => (
        <div className="space-y-1.5">
          <p className="mb-1 text-[10px] leading-snug text-muted-foreground">Opens on <span className="font-bold">this device</span> and updates <span className="font-bold">instantly</span> (no internet needed). Drag it to your extended screen, then press <kbd className="rounded bg-secondary px-1 font-mono">F</kbd> for fullscreen.</p>
          {displays.map((d) => {
            const Icon = d.icon;
            return (
              <button key={d.key} onClick={() => { open(d.path, d.key); close(); }} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold hover:bg-secondary">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {d.label}
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </Dropdown>
  );
}

export function ControlBar({ s }: { s: GameState }) {
  const quickLinks: { label: string; to: string; params?: Record<string, string> }[] = [
    { label: "Time Keeper", to: "/timekeeper/$courtId", params: { courtId: s.court_id } },
    { label: "Shot Clock (Ref 2)", to: "/shotclock/$courtId", params: { courtId: s.court_id } },
    { label: "Stat Keeping", to: "/statkeeper/$courtId", params: { courtId: s.court_id } },
    { label: "Game Log", to: "/game-log/$courtId", params: { courtId: s.court_id } },
    { label: "Game Report", to: "/report/$courtId", params: { courtId: s.court_id } },
    { label: "Shot Chart", to: "/shotchart/$courtId", params: { courtId: s.court_id } },
    { label: "Footage & AI Stats", to: "/footage/$courtId", params: { courtId: s.court_id } },
    { label: "Game History", to: "/games" },
    { label: "Season Stats", to: "/stats" },
    { label: "Teams", to: "/teams" },
    { label: "Tournaments", to: "/tournaments" },
    { label: "Advertising", to: "/advertising" },
  ];

  return (
    <div className="sticky top-[57px] z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-6 py-2.5">
        <Dropdown label="Display Style" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
          {() => (
            <div className="space-y-2.5">
              <StyleRow label="Timer" value={s.timer_style} options={[["rectangular", "Rectangular"], ["round", "Round"]]} onChange={(v) => patchGameState(s.court_id, { timer_style: v })} />
              <StyleRow label="Display 1" value={s.display_style_1} options={[["katigo", "Katigo"], ["arena", "ARENA1"], ["led", "NCAA1"], ["std3", "Standard 3"], ["pjy1", "SCOREBOARD PJY 1"], ["pjy2", "SCOREBOARD PJY 2"]]} onChange={(v) => patchGameState(s.court_id, { display_style_1: v })} />
              <StyleRow label="Display 2" value={s.display_style_2} options={[["espn1", "ESPN 1"], ["espn2", "ESPN 2"], ["nba", "NBA"], ["fiba", "FIBA"], ["bdsea26", "BDSEA26"]]} onChange={(v) => patchGameState(s.court_id, { display_style_2: v })} />
            </div>
          )}
        </Dropdown>

        <Link
          to="/sources/$courtId"
          params={{ courtId: s.court_id }}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-secondary"
          activeProps={{ className: "flex items-center gap-1.5 rounded-lg border bg-foreground px-3 py-1.5 text-xs font-semibold text-background" }}
        >
          <MonitorPlay className="h-3.5 w-3.5" />
          OBS Browser Sources
        </Link>

        <DisplayViewLauncher courtId={s.court_id} />

        <Dropdown label="Quick Links" icon={<LayoutGrid className="h-3.5 w-3.5" />}>
          {(close) => (
            <div className="grid grid-cols-2 gap-1.5">
              {quickLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  params={l.params as never}
                  onClick={close}
                  className="rounded-md border px-3 py-2 text-center text-xs font-semibold hover:bg-secondary"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </Dropdown>

        <NavTimer s={s} />
      </div>
    </div>
  );
}
