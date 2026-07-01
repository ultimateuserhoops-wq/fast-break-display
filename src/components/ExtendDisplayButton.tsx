import { useEffect, useRef, useState } from "react";
import { MonitorPlay, ExternalLink, LayoutDashboard, Hash, Timer, ChevronDown } from "lucide-react";

// Opens a scoreboard/timer view in its own window on THIS device (?local=1). It syncs instantly
// from the control via BroadcastChannel — no internet, zero clock delay — for a second screen /
// extended monitor. Drag the window across and press F for fullscreen.
export function ExtendDisplayButton({ courtId }: { courtId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const displays = [
    { key: "display1", label: "Full Scoreboard", icon: LayoutDashboard, path: `/obs/display1/${courtId}` },
    { key: "display2", label: "Scorebug", icon: Hash, path: `/obs/display2/${courtId}` },
    { key: "timer", label: "Timer", icon: Timer, path: `/obs/timer/${courtId}` },
  ];
  const openLocal = (path: string, key: string) => {
    if (typeof window === "undefined") return;
    window.open(`${window.location.origin}${path}?local=1`, `bdc_display_${key}_${courtId}`, "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Open a second-screen display on THIS device — instant, no internet needed. Drag it to your extended monitor and press F for fullscreen."
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${open ? "bg-foreground text-background" : "hover:bg-secondary"}`}
      >
        <MonitorPlay className="h-3.5 w-3.5" /> Extend Display
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 min-w-[230px] rounded-xl border bg-card p-2 shadow-xl">
          <p className="px-1 pb-1.5 text-[10px] leading-snug text-muted-foreground">
            Opens on <span className="font-bold text-foreground">this device</span> and updates <span className="font-bold text-foreground">instantly</span> (no internet). Drag to the extended screen, press <kbd className="rounded bg-secondary px-1 font-mono">F</kbd> for fullscreen.
          </p>
          {displays.map((d) => {
            const Icon = d.icon;
            return (
              <button key={d.key} onClick={() => openLocal(d.path, d.key)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold hover:bg-secondary">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {d.label}
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
