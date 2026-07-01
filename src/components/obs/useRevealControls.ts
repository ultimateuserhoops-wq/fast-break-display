import { useEffect, useRef, useState } from "react";
import { isLocalDisplay } from "@/lib/local-bus";

/**
 * On-screen display controls (fullscreen, shot-clock hide) should never appear on the OBS
 * broadcast, so they hide themselves: revealed on mouse-move, faded out after 2.5s. On a LOCAL
 * extended-display window they stay put (it's a monitor you interact with, not a broadcast source).
 */
export function useRevealControls(): boolean {
  const local = isLocalDisplay();
  const [visible, setVisible] = useState(local);
  const hideRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (local) return; // stays visible
    const reveal = () => {
      setVisible(true);
      clearTimeout(hideRef.current);
      hideRef.current = setTimeout(() => setVisible(false), 2500);
    };
    window.addEventListener("mousemove", reveal);
    return () => { window.removeEventListener("mousemove", reveal); clearTimeout(hideRef.current); };
  }, [local]);
  return visible;
}
