import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useRevealControls } from "@/components/obs/useRevealControls";

/**
 * Hover-reveal fullscreen toggle for the OBS display pages. Meant for driving a scoreboard/timer
 * on an EXTENDED MONITOR: open the display in its own browser window (see the "Display View"
 * launcher), drag it to the extension screen, then press F (or move the mouse and click) to go
 * chrome-free fullscreen. It stays invisible in OBS because OBS never moves the mouse over the
 * source, so it can't pollute the broadcast. Always shown on a local extended display.
 */
export function FullscreenToggle() {
  const [fs, setFs] = useState(false);
  const visible = useRevealControls();

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "f") { e.preventDefault(); toggle(); }
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <button
      onClick={toggle}
      title={fs ? "Exit fullscreen (F / Esc)" : "Go fullscreen (F) — for an extended display"}
      className={`fixed bottom-3 right-3 z-[200] flex items-center gap-1.5 rounded-lg border border-white/25 bg-black/60 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur transition-opacity duration-200 hover:bg-black/80 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      {fs ? "Exit" : "Fullscreen"}
    </button>
  );
}
