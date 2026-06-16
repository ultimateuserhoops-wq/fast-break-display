import { useRef } from "react";

export function ModeCard({
  title,
  desc,
  color,
  onClick,
  badge,
}: {
  title: string;
  desc: string;
  color: string;
  onClick: () => void;
  badge?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !ref.current) return;
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMove}
      className="glow-card group w-full rounded-2xl border bg-card p-6 text-left transition hover:border-foreground/40 hover:shadow-lg"
      style={{ ["--glow-color" as string]: color }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex h-9 items-center rounded-full px-3 text-xs font-bold uppercase tracking-wider text-white" style={{ background: color }}>
          {badge ?? title}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <p className="mt-6 text-xs font-semibold text-foreground/80 group-hover:text-foreground">Open →</p>
    </button>
  );
}
