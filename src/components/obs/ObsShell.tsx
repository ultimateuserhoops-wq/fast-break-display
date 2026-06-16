import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * OBS pages: black bg, no scrollbars. Inner content is designed at a fixed
 * 1920×1080 stage and scaled to fit any viewport so nothing is ever clipped.
 */
export function ObsShell({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => {
    if (typeof window === "undefined") return 1;
    return Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function fit() {
      const w = el!.clientWidth || window.innerWidth;
      const h = el!.clientHeight || window.innerHeight;
      const next = Math.min(w / 1920, h / 1080);
      if (next > 0) setScale(next);
    }
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 overflow-hidden"
      style={{ background: "#000", color: "#fff" }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 1920,
          height: 1080,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
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
