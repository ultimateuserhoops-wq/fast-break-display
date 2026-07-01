import { Eye, EyeOff } from "lucide-react";
import { useRevealControls } from "@/components/obs/useRevealControls";

/**
 * Show/hide button for the 24s SHOT CLOCK on a display — for when a separate device is running
 * the shot clock and you don't want it duplicated here. Toggles the per-court `hideShot` state
 * (same as pressing H). Hidden on OBS sources unless you move the mouse; always shown on a local
 * extended display. Sits bottom-left so it never overlaps the fullscreen button (bottom-right).
 */
export function ShotClockToggle({ hideShot, onToggle }: { hideShot: boolean; onToggle: () => void }) {
  const visible = useRevealControls();
  return (
    <button
      onClick={onToggle}
      title={hideShot ? "Shot clock hidden — click (or H) to show" : "Hide the 24s shot clock (a separate device is running it) — click or press H"}
      className={`fixed bottom-3 left-3 z-[200] flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold backdrop-blur transition-opacity duration-200 ${hideShot ? "border-amber-500/60 bg-amber-500/20 text-amber-300" : "border-white/25 bg-black/60 text-white/90 hover:bg-black/80"} ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {hideShot ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      {hideShot ? "Shot clock: off" : "Shot clock: on"}
    </button>
  );
}
