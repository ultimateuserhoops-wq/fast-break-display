import { useRef } from "react";

export type ShotMarker = { x: number; y: number; made: boolean; color: string };

const BASKET = { x: 50, y: 8 };
const R3 = 38; // 3-point arc radius in the 0–100 (x) / 0–94 (y) court space

export function isThree(x: number, y: number) {
  // beyond the corner verticals, or outside the arc
  return x < 12 || x > 88 || Math.hypot(x - BASKET.x, y - BASKET.y) > R3;
}

export function ShotChart({
  markers, pending, pendingColor, onPick, bgImage,
}: {
  markers: ShotMarker[];
  pending?: { x: number; y: number } | null;
  pendingColor?: string;
  onPick?: (loc: { x: number; y: number }, three: boolean) => void;
  bgImage?: string | null;
}) {
  const ref = useRef<SVGSVGElement>(null);

  function handle(e: React.MouseEvent<SVGSVGElement>) {
    if (!onPick) return;
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 94;
    onPick({ x, y }, isThree(x, y));
  }

  return (
    <svg ref={ref} viewBox="0 0 100 94" onClick={handle} className={`w-full rounded-lg ${onPick ? "cursor-crosshair" : ""}`}>
      {/* uploaded half-court image (fills the coordinate space, so taps still map correctly) */}
      {bgImage && <image href={bgImage} x="0" y="0" width="100" height="94" preserveAspectRatio="xMidYMid slice" />}

      {/* default drawn court (clean blue top-down half court) — only when no uploaded image */}
      {!bgImage && <>
        <rect x="0" y="0" width="100" height="94" fill="#1f5fbf" />
        <rect x="3" y="3" width="94" height="88" fill="#17468f" />
        <g stroke="#fff" strokeWidth="0.7" fill="none">
          <rect x="3" y="3" width="94" height="88" />
          {/* key / paint */}
          <rect x="39" y="3" width="22" height="33" fill="#0f2f63" />
          {/* free-throw circle */}
          <circle cx="50" cy="36" r="9" />
          {/* 3-point line: corner verticals + arc */}
          <path d={`M 12 3 L 12 8 A ${R3} ${R3} 0 0 0 88 8 L 88 3`} />
          {/* backboard + hoop */}
          <line x1="44" y1="6" x2="56" y2="6" strokeWidth="1" />
          <circle cx="50" cy="8.5" r="1.7" stroke="#ff8a50" />
          {/* half-court center arc */}
          <path d="M 38 91 A 12 12 0 0 0 62 91" />
        </g>
      </>}

      {/* recorded shots */}
      {markers.map((m, i) =>
        m.made ? (
          <circle key={i} cx={m.x} cy={m.y} r="1.9" fill="none" stroke={m.color} strokeWidth="0.9" />
        ) : (
          <g key={i} stroke={m.color} strokeWidth="0.9">
            <line x1={m.x - 1.7} y1={m.y - 1.7} x2={m.x + 1.7} y2={m.y + 1.7} />
            <line x1={m.x - 1.7} y1={m.y + 1.7} x2={m.x + 1.7} y2={m.y - 1.7} />
          </g>
        ),
      )}

      {/* pending pick */}
      {pending && <circle cx={pending.x} cy={pending.y} r="2.6" fill={pendingColor} fillOpacity="0.45" stroke={pendingColor} strokeWidth="0.7" />}
    </svg>
  );
}
