// Build "BDSEA 2026 3X3" — five age groups, GROUPS → KNOCKOUT, left UN-DRAWN (placeholders
// like A1/A2 for group slots and "Group A #1" for advancers) so the draw happens later.
// Group counts honour the PDF draw rule (same-club teams must split → groupCount ≥ biggest club):
//   U10 BDC/4S/Kimban ×2 → 2 grps · U12 ×2 → 2 grps · U13 Jumpshot/BDC ×3 → 3 grps ·
//   U14 Nam BDC ×4 → 4 grps · U14 Nữ HNBA ×2 (single pool allowed: teams > groups).
// One day, 3 courts, 20-min games, 08:00–12:00 + 13:30→finish. Group games are packed first,
// then the knockout (so finals fall after the pools). Run: bun run scripts/regen-bdsea2026-3x3.ts
import { roundRobinRounds, seedOrder, bracketSize, elimRounds, type Round, type Slot } from "../src/lib/bracket";
import { upsertTournament } from "../gateway/scoreboard";

const uid = () => Math.random().toString(36).slice(2, 9);
const COURTS = ["Court 1", "Court 2", "Court 3"];
const SLOT = 20;
// Two play windows: an overflow afternoon on 04/07, then the full 05/07 day.
const DAYS = [
  { date: "2026-07-04", sessions: [["14:00", "17:00"]] },
  { date: "2026-07-05", sessions: [["08:00", "12:00"], ["13:30", "21:00"]] },
];
const toMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function elimFromLabels(labels: string[], prefix: string): Round[] {
  if (labels.length < 2) return [];
  const order = seedOrder(bracketSize(labels.length));
  const koSlots: Slot[] = order.map((seed, i) => ({ pos: i, seed, team: seed <= labels.length ? labels[seed - 1] : null, bye: seed > labels.length, seeded: true }));
  return elimRounds(koSlots).map((r) => ({ name: `${prefix} — ${r.name}`, matches: r.matches }));
}

type Div = { name: string; advance: number; pool: string[]; groups: { letter: string; size: number }[] };
const TS = "Tây Sơn - SWBA";
const DIVS: Div[] = [
  { name: "3x3 U10 Mix", advance: 2, groups: [{ letter: "A", size: 3 }, { letter: "B", size: 3 }],
    pool: ["TURBO DUNK", "4S Dragon 1", "4S Dragon 2", "Kimban Hoops 1", "Kimban Hoops 2", "BDC"] },
  { name: "3x3 U12 Nam", advance: 2, groups: [{ letter: "A", size: 5 }, { letter: "B", size: 5 }],
    pool: ["47Hoops DakLak 1", "47Hoops DakLak 2", "DBH", TS, "The Court Vision 1", "The Court Vision 2", "Jumpshot", "BDC 1", "BDC 2", "NEXTGEN HEAT"] },
  { name: "3x3 U13 Nam", advance: 2, groups: [{ letter: "A", size: 4 }, { letter: "B", size: 4 }, { letter: "C", size: 3 }],
    pool: [TS, "DBH", "Jumpshot 1", "Jumpshot 2", "Jumpshot 3", "BDC 1", "BDC 2", "BDC 3", "Phoenix Sport", "CN8", "NEXTGEN HEAT"] },
  { name: "3x3 U14 Nam", advance: 2, groups: [{ letter: "A", size: 5 }, { letter: "B", size: 5 }, { letter: "C", size: 5 }, { letter: "D", size: 5 }],
    pool: ["JamFam 1", "JamFam 2", TS, "Jumpshot", "Muscle Memory - Basketball Skills Center", "Homegrown Basketball Club", "Hanoi Amigos 1", "Hanoi Amigos 2", "Vietsport 1", "Vietsport 2", "Vietsport 3", "HBW", "NEXTGEN HEAT 1", "NEXTGEN HEAT 2", "Attitude 1", "Attitude 2", "BDC 1", "BDC 2", "BDC 3", "BDC 4"] },
  { name: "3x3 U14 Nữ", advance: 2, groups: [{ letter: "A", size: 5 }],
    pool: ["Coach Dung Basketball Club", "HNBA x Italysport 1", "HNBA x Italysport 2", "Phoenix Sport", "The Court Vision"] },
];

function divisionRounds(d: Div): Round[] {
  const rounds: Round[] = [];
  for (const g of d.groups) {
    const labels = Array.from({ length: g.size }, (_, i) => `${g.letter}${i + 1}`);   // positional placeholders, filled at the draw
    rounds.push({ name: `Group ${g.letter}`, matches: roundRobinRounds(labels)[0]?.matches ?? [] });
  }
  const adv: string[] = [];
  for (let rank = 1; rank <= d.advance; rank++) for (const g of d.groups) adv.push(`Group ${g.letter} #${rank}`); // rank-1s then rank-2s → cross-paired
  rounds.push(...elimFromLabels(adv, "Knockout"));
  return rounds;
}

const divisions = DIVS.map((d) => ({
  id: uid(), name: d.name, format: "groups_knockout" as const, entrants: d.pool.length,
  seeds: [] as { name: string; seed: number }[], pool: d.pool, logos: {},
  groupCount: d.groups.length, teamsPerGroup: Math.max(...d.groups.map((g) => g.size)), advancePerGroup: d.advance, consolation: false,
  rounds: divisionRounds(d), drawn: false,
}));

// ---- Pack the single day: groups first, then knockout (deps respected), 3 courts, 20-min. ----
type Game = { div: string; round: string; a: string; b: string; ko: boolean; ref: { date?: string; time?: string; court?: string } };
const koDepth = (n: string) => /Quarterfinal/.test(n) ? 1 : /Semifinal/.test(n) ? 2 : /Final/.test(n) ? 3 : 0;
const games: Game[] = [];
for (const div of divisions) for (const r of div.rounds) r.matches.forEach((m) => {
  if (m.home && m.away && m.home !== "(bye)" && m.away !== "(bye)") games.push({ div: div.id, round: r.name, a: m.home, b: m.away, ko: /Knockout|Division/.test(r.name), ref: m });
});
// Order: group games by round-robin index (spreads each group), then knockout shallow→deep.
const grp = games.filter((g) => !g.ko);
const ko = games.filter((g) => g.ko).sort((x, y) => koDepth(x.round) - koDepth(y.round));
const queue = [...grp, ...ko];

// Chronological slot-times across both days; each provides the 3 courts.
const slots: { date: string; min: number; sid: number }[] = [];
let sid = 0;
for (const day of DAYS) for (const [s, e] of day.sessions) { for (let t = toMin(s); t + SLOT <= toMin(e) + 1; t += SLOT) slots.push({ date: day.date, min: t, sid }); sid++; }

const abs = (date?: string, time?: string) => `${date} ${time}`;
const depsOk = (g: Game, date: string, t: number) => {                       // knockout games wait for their own division's earlier rounds
  if (!g.ko) return true;
  const cur = abs(date, toHHMM(t));
  const earlier = (x: Game) => x.ref.time && abs(x.ref.date, x.ref.time) < cur;
  if (!games.filter((x) => !x.ko && x.div === g.div).every(earlier)) return false;             // all that division's GROUP games done first
  if (koDepth(g.round) <= 1) return true;
  return games.filter((x) => x.ko && x.div === g.div && koDepth(x.round) < koDepth(g.round)).every(earlier); // and its shallower KO rounds
};
let prev = new Set<string>(), prevSid = -1, placed = 0, fin = { date: "", min: 0 };
for (const sl of slots) {
  if (sl.sid !== prevSid) { prev = new Set(); prevSid = sl.sid; }            // rest only matters within a session
  const round = new Set<string>();
  for (const court of COURTS) {
    const key = (g: Game) => [`${g.div}|${g.a}`, `${g.div}|${g.b}`];
    const free = (g: Game, skipRest: boolean) => { const [ka, kb] = key(g); return !round.has(ka) && !round.has(kb) && (skipRest || (!prev.has(ka) && !prev.has(kb))) && depsOk(g, sl.date, sl.min); };
    let i = queue.findIndex((g) => free(g, false));
    if (i < 0) i = queue.findIndex((g) => free(g, true));
    if (i < 0) break;
    const g = queue.splice(i, 1)[0];
    g.ref.date = sl.date; g.ref.time = toHHMM(sl.min); g.ref.court = court;
    key(g).forEach((k) => round.add(k));
    placed++; fin = { date: sl.date, min: sl.min + SLOT };
  }
  prev = round;
  if (!queue.length) break;
}

const schedule = {
  courts: COURTS, startDate: DAYS[0].date, endDate: DAYS[DAYS.length - 1].date, dates: DAYS.map((d) => d.date),
  dayStart: "08:00", dayEnd: toHHMM(fin.min),
  sessions: [{ start: "08:00", end: "12:00" }, { start: "13:30", end: toHHMM(fin.min) }],
  dayOverrides: { "2026-07-04": { sessions: [{ start: "14:00", end: "17:00" }] } },
  slotMin: SLOT, restMin: SLOT, maxPerDay: 99,
};

const { id, updated } = await upsertTournament("BDSEA 2026 3X3", { kind: "multi" as const, divisions, schedule });
console.log(`${updated ? "Updated" : "Created"} BDSEA 2026 3X3 →`, id);
console.log(`Placed ${placed}/${games.length} games · ${queue.length} unplaced · finishes ${fin.date} ${toHHMM(fin.min)}`);
for (const day of DAYS) { const n = games.filter((g) => g.ref.date === day.date).length; console.log(`  ${day.date}: ${n} games`); }
for (const d of divisions) console.log(`  ${d.name}: ${(d.rounds ?? []).map((r) => `${r.name}=${r.matches.filter((m) => m.time).length}`).join(", ")}`);
