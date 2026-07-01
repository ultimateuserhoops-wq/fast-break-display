import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gatewayConnected, onGatewayStatus } from "@/lib/gateway";

// Brief, auto-fading badge so the operator can confirm a display's sync mode when it opens:
// LAN (instant, ~40ms behind the control) vs cloud (~0.6s behind). Fades out after a few
// seconds so it never stays on the broadcast feed.
function SyncBadge() {
  const [lan, setLan] = useState(gatewayConnected());
  const [show, setShow] = useState(true);
  useEffect(() => {
    setLan(gatewayConnected());
    const off = onGatewayStatus(setLan);
    const t = setTimeout(() => setShow(false), 6000);
    return () => { off(); clearTimeout(t); };
  }, []);
  if (!show) return null;
  return (
    <div
      className="fixed left-3 top-3 z-[60] rounded-md px-2.5 py-1 text-[12px] font-bold transition-opacity duration-700"
      style={{ background: lan ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.2)", color: lan ? "#34d399" : "#fbbf24", border: `1px solid ${lan ? "#10b981" : "#f59e0b"}` }}
    >
      {lan ? "● LAN sync — instant" : "● Cloud sync ~0.6s · use the :8787 LAN link for instant"}
    </div>
  );
}

/**
 * OBS pages: black bg, no scrollbars. Inner content is designed on a fixed
 * 1920×1080 stage and scaled to fit the viewport so nothing is ever clipped.
 *
 * Scaling uses CSS `zoom` (not `transform: scale`): `zoom` re-lays-out and
 * re-rasterizes text/vectors at the target size, so the result stays crisp —
 * `transform: scale` rasterizes once then GPU-scales, which softens edges. OBS's
 * embedded Chromium supports `zoom`, so the broadcast renders at full definition.
 * For a pixel-perfect feed, set the OBS Browser source to 1920×1080 (zoom = 1).
 */
export function ObsShell({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;
    const fit = () => {
      const w = wrap.clientWidth || window.innerWidth;
      const h = wrap.clientHeight || window.innerHeight;
      const s = Math.min(w / 1920, h / 1080) || 1;
      stage.style.setProperty("zoom", String(s));
    };
    fit();
    requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 grid place-items-center overflow-hidden"
      style={{
        background: "#000",
        color: "#fff",
        WebkitFontSmoothing: "antialiased",
        textRendering: "geometricPrecision",
      }}
    >
      <div ref={stageRef} style={{ width: 1920, height: 1080, position: "relative" }}>
        {children}
      </div>
      <SyncBadge />
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
