import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * OBS pages: black bg, no scrollbars. Inner content is designed at a fixed
 * 1920×1080 stage and scaled to fit any viewport so nothing is ever clipped.
 */
export function ObsShell({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    function fit() {
      const el = wrapRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      setScale(Math.min(w / 1920, h / 1080));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div ref={wrapRef} className="grid h-screen w-screen place-items-center overflow-hidden" style={{ background: "#000", color: "#fff" }}>
      <div
        className="relative"
        style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "center center" }}
      >
        {children}
      </div>
    </div>
  );
}

export function useTick(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => (n + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);
}
