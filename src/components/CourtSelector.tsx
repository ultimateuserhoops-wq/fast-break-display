import { Link } from "@tanstack/react-router";
import { useCourts } from "@/lib/game-state";

export function CourtSelector({
  activeId,
  onSelect,
}: {
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  const courts = useCourts();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {courts.map((c) => {
        const active = c.id === activeId;
        const content = (
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            <span>{c.name}</span>
          </span>
        );
        const cls = `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
          active ? "border-foreground bg-foreground text-background" : "hover:bg-secondary"
        }`;
        return onSelect ? (
          <button key={c.id} onClick={() => onSelect(c.id)} className={cls}>
            {content}
          </button>
        ) : (
          <Link key={c.id} to="/scoreboard/$courtId" params={{ courtId: c.id }} className={cls}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
