import { useEffect, useRef, useState } from "react";

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
      className="relative grid aspect-square w-full max-w-[260px] place-items-center rounded-2xl border-2 bg-card"
      style={{ borderColor: color }}
    >
      {showThree ? (
        <div
          key={animKey}
          className="three-burst grid h-32 w-32 place-items-center rounded-full text-5xl font-black text-white shadow-lg"
          style={{ background: color }}
        >
          3+
        </div>
      ) : (
        <span key={score} className="score-pop clock-digits text-[7rem] font-black leading-none">
          {score}
        </span>
      )}
    </div>
  );
}
