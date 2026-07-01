import { useEffect, useRef, useState } from "react";
import { ink } from "@/lib/color";

export function ScoreBox({
  score,
  color,
  threePulse,
}: {
  score: number;
  color: string;
  threePulse: number;
}) {
  const [showThree, setShowThree] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const lastRef = useRef(threePulse);

  useEffect(() => {
    if (threePulse === lastRef.current) return;
    lastRef.current = threePulse;
    if (threePulse === 0) return;
    setShowThree(true);
    setAnimKey((k) => k + 1);
    const t = setTimeout(() => setShowThree(false), 1000);
    return () => clearTimeout(t);
  }, [threePulse]);

  return (
    <div
      className="relative grid aspect-square w-full max-w-[260px] place-items-center overflow-hidden rounded-2xl border-2 bg-card"
      style={{ borderColor: color }}
    >
      {showThree ? (
        // On a made 3 the score hides and a big "+3" flashes for ~1s in the team colour.
        <span
          key={animKey}
          className="three-burst clock-digits text-center font-black leading-none tabular-nums"
          style={{ color: ink(color), fontSize: "7rem" }}
        >
          +3
        </span>
      ) : (
        <span key={score} className="score-pop clock-digits text-center font-black leading-none tabular-nums" style={{ fontSize: "7rem" }}>
          {score}
        </span>
      )}
    </div>
  );
}
