import { useMemo } from "react";
import type { GameState, GameEvent } from "@/lib/game-state";
import { usePlayers, aggregateBoxScore } from "@/lib/game-state";

export function BoxScoreTable({
  s, side, events,
}: {
  s: GameState;
  side: "home" | "away";
  events: GameEvent[];
}) {
  const teamId = side === "home" ? s.home_team_id : s.away_team_id;
  const onCourtIds = (side === "home" ? s.home_on_court : s.away_on_court) ?? [];
  const players = usePlayers(teamId);
  const sideEvents = useMemo(() => events.filter((e) => e.team_side === side), [events, side]);
  const box = useMemo(() => aggregateBoxScore(sideEvents), [sideEvents]);
  const color = side === "home" ? s.home_color : s.away_color;
  const teamName = side === "home" ? s.home_name : s.away_name;

  if (!teamId) return null;

  const rows = players.map((p) => ({ p, line: box.get(p.id) }));

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b bg-secondary/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <p className="text-xs font-black uppercase tracking-wider" style={{ color }}>{teamName} · BOX SCORE</p>
        </div>
        <p className="text-[10px] text-muted-foreground">Live · {sideEvents.length} events</p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-1.5 text-left">#</th>
              <th className="px-2 py-1.5 text-left">Player</th>
              <th className="px-1.5 py-1.5 text-right">PTS</th>
              <th className="px-1.5 py-1.5 text-right">REB</th>
              <th className="px-1.5 py-1.5 text-right">AST</th>
              <th className="px-1.5 py-1.5 text-right">STL</th>
              <th className="px-1.5 py-1.5 text-right">BLK</th>
              <th className="px-1.5 py-1.5 text-right">FLS</th>
              <th className="px-2 py-1.5 text-right">FG</th>
              <th className="px-2 py-1.5 text-right">3P</th>
              <th className="px-2 py-1.5 text-right">FT</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-4 text-center text-muted-foreground">No players on roster.</td></tr>
            )}
            {rows.map(({ p, line }) => {
              const onCourt = onCourtIds.includes(p.id);
              return (
                <tr key={p.id} className={`border-b last:border-0 ${onCourt ? "bg-secondary/20" : ""}`}>
                  <td className="clock-digits px-3 py-1.5" style={{ color }}>{p.jersey_number || "—"}</td>
                  <td className="px-2 py-1.5 font-semibold">
                    {p.name}{onCourt && <span className="ml-1 rounded bg-foreground/10 px-1 text-[9px] uppercase">on</span>}
                  </td>
                  <td className="clock-digits px-1.5 py-1.5 text-right font-bold">{line?.pts ?? 0}</td>
                  <td className="px-1.5 py-1.5 text-right">{line?.reb ?? 0}</td>
                  <td className="px-1.5 py-1.5 text-right">{line?.ast ?? 0}</td>
                  <td className="px-1.5 py-1.5 text-right">{line?.stl ?? 0}</td>
                  <td className="px-1.5 py-1.5 text-right">{line?.blk ?? 0}</td>
                  <td className="px-1.5 py-1.5 text-right">{line?.fls ?? 0}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">{line ? `${line.fgm}/${line.fga}` : "0/0"}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">{line ? `${line.tpm}/${line.tpa}` : "0/0"}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">{line ? `${line.ftm}/${line.fta}` : "0/0"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
