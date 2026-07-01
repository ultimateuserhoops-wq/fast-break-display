import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  useGameState, useGameEvents, usePlayers, aggregateBoxScore, isStaff,
  type GameState, type GameEvent,
} from "@/lib/game-state";

export const Route = createFileRoute("/_authenticated/report/$courtId")({
  head: () => ({ meta: [{ title: "Game Report — BDC" }] }),
  component: ReportPage,
});

function pct(m: number, a: number) {
  return a > 0 ? `${Math.round((m / a) * 1000) / 10}%` : "—";
}

function ReportPage() {
  const { courtId } = Route.useParams();
  const s = useGameState(courtId);
  const events = useGameEvents(courtId);

  if (!s) return <div className="min-h-screen bg-white p-10 text-black">Loading…</div>;

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl p-8 print:p-2">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/scoreboard/$courtId" params={{ courtId }} className="text-sm text-gray-600 underline">← Back to control</Link>
          <button onClick={() => window.print()} className="rounded-lg bg-black px-5 py-2 text-sm font-bold text-white hover:bg-gray-800">
            Print / Save PDF
          </button>
        </div>

        {/* Header */}
        <div className="border-b-2 border-black pb-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-gray-500">{s.tournament_name || "Game Report"}</p>
          <div className="mt-3 flex items-center justify-center gap-5 text-3xl font-black">
            <span className="text-right" style={{ minWidth: "8rem" }}>{s.home_name}</span>
            <span className="rounded-lg bg-black px-3 py-1 text-white">{s.home_score}</span>
            <span className="text-gray-300">:</span>
            <span className="rounded-lg bg-black px-3 py-1 text-white">{s.away_score}</span>
            <span className="text-left" style={{ minWidth: "8rem" }}>{s.away_name}</span>
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-gray-500">Final · through period {s.quarter}</p>
        </div>

        <TeamReport s={s} side="home" events={events} />
        <TeamReport s={s} side="away" events={events} />

        <p className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-gray-400">
          FIBA-style box score · BDCSCOREBOARD · A property of BDC Vietnam
        </p>
      </div>
    </div>
  );
}

function TeamReport({ s, side, events }: { s: GameState; side: "home" | "away"; events: GameEvent[] }) {
  const teamId = side === "home" ? s.home_team_id : s.away_team_id;
  const teamName = side === "home" ? s.home_name : s.away_name;
  const color = side === "home" ? s.home_color : s.away_color;
  const players = usePlayers(teamId);
  const sideEvents = useMemo(() => events.filter((e) => e.team_side === side), [events, side]);
  const box = useMemo(() => aggregateBoxScore(sideEvents), [sideEvents]);

  const rows = players.filter((p) => !isStaff(p)).map((p) => ({ p, l: box.get(p.id) }));
  const T = rows.reduce(
    (acc, { l }) => {
      if (!l) return acc;
      acc.pts += l.pts; acc.fgm += l.fgm; acc.fga += l.fga; acc.tpm += l.tpm; acc.tpa += l.tpa;
      acc.ftm += l.ftm; acc.fta += l.fta; acc.reb += l.reb; acc.ast += l.ast; acc.stl += l.stl;
      acc.blk += l.blk; acc.to += l.to; acc.fls += l.fls;
      return acc;
    },
    { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fls: 0 },
  );

  const th = "border border-gray-300 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600";
  const td = "border border-gray-300 px-2 py-1 text-center tabular-nums";

  return (
    <div className="mt-8 break-inside-avoid">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
        <h2 className="text-base font-black uppercase tracking-wide">{teamName}</h2>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className={`${th} text-center`}>#</th>
            <th className={`${th} text-left`}>Player</th>
            <th className={th}>PTS</th>
            <th className={th}>FGM-A</th>
            <th className={th}>FG%</th>
            <th className={th}>3PM-A</th>
            <th className={th}>3P%</th>
            <th className={th}>FTM-A</th>
            <th className={th}>FT%</th>
            <th className={th}>REB</th>
            <th className={th}>AST</th>
            <th className={th}>STL</th>
            <th className={th}>BLK</th>
            <th className={th}>TO</th>
            <th className={th}>PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="border border-gray-300 px-2 py-3 text-center text-gray-400" colSpan={15}>No players on roster.</td></tr>
          )}
          {rows.map(({ p, l }) => (
            <tr key={p.id}>
              <td className={`${td} font-bold`} style={{ color }}>{p.jersey_number || "—"}</td>
              <td className="border border-gray-300 px-2 py-1 text-left font-semibold">{p.name}</td>
              <td className={`${td} font-bold`}>{l?.pts ?? 0}</td>
              <td className={td}>{l ? `${l.fgm}-${l.fga}` : "0-0"}</td>
              <td className={td}>{pct(l?.fgm ?? 0, l?.fga ?? 0)}</td>
              <td className={td}>{l ? `${l.tpm}-${l.tpa}` : "0-0"}</td>
              <td className={td}>{pct(l?.tpm ?? 0, l?.tpa ?? 0)}</td>
              <td className={td}>{l ? `${l.ftm}-${l.fta}` : "0-0"}</td>
              <td className={td}>{pct(l?.ftm ?? 0, l?.fta ?? 0)}</td>
              <td className={td}>{l?.reb ?? 0}</td>
              <td className={td}>{l?.ast ?? 0}</td>
              <td className={td}>{l?.stl ?? 0}</td>
              <td className={td}>{l?.blk ?? 0}</td>
              <td className={td}>{l?.to ?? 0}</td>
              <td className={td}>{l?.fls ?? 0}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-black">
            <td className={td} />
            <td className="border border-gray-300 px-2 py-1 text-left font-black uppercase">Team totals</td>
            <td className={td}>{T.pts}</td>
            <td className={td}>{T.fgm}-{T.fga}</td>
            <td className={td}>{pct(T.fgm, T.fga)}</td>
            <td className={td}>{T.tpm}-{T.tpa}</td>
            <td className={td}>{pct(T.tpm, T.tpa)}</td>
            <td className={td}>{T.ftm}-{T.fta}</td>
            <td className={td}>{pct(T.ftm, T.fta)}</td>
            <td className={td}>{T.reb}</td>
            <td className={td}>{T.ast}</td>
            <td className={td}>{T.stl}</td>
            <td className={td}>{T.blk}</td>
            <td className={td}>{T.to}</td>
            <td className={td}>{T.fls}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
