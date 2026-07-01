// Build "BDSEA 2026 v.2" — an ALTERNATE route to compare against "BDSEA 2026 3X3".
// Bigger pools so each team plays the most games:
//   • U10: ONE group of 6 → top 2 play the final, 3rd–4th play a third-place game.
//   • U13: TWO groups → top 4 of each advance to quarterfinals.
//   • U12 / U14 Nam / U14 Nữ: unchanged from the 3x3 (groups of 5, top 2 → knockout).
// Left UN-DRAWN (placeholders A1/A2…, "Group A #1") for a later draw.
// Courts/time: 04/07 → 2 courts 14:30–21:00 · 05/07 → 3 courts 08:00–12:20 + 14:00→finish.
// 20-min games, group games packed first, then each division's knockout. Run:
//   bun run scripts/regen-bdsea2026-v2.ts
import { roundRobinRounds, seedOrder, bracketSize, elimRounds, type Round, type Slot } from "../src/lib/bracket";
import { upsertTournament } from "../gateway/scoreboard";

const uid = () => Math.random().toString(36).slice(2, 9);
const SLOT = 20;
const toMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAYS = [
  { date: "2026-07-04", courts: ["Court 1", "Court 2"], sessions: [["14:30", "21:00"]] },
  { date: "2026-07-05", courts: ["Court 1", "Court 2", "Court 3"], sessions: [["08:00", "12:20"], ["14:00", "22:00"]] },
];

function elimFromLabels(labels: string[], prefix: string): Round[] {
  if (labels.length < 2) return [];
  const order = seedOrder(bracketSize(labels.length));
  const koSlots: Slot[] = order.map((seed, i) => ({ pos: i, seed, team: seed <= labels.length ? labels[seed - 1] : null, bye: seed > labels.length, seeded: true }));
  return elimRounds(koSlots).map((r) => ({ name: `${prefix} — ${r.name}`, matches: r.matches }));
}

type Div = { name: string; advance: number; thirdPlace?: boolean; pool: string[]; groups: { letter: string; size: number }[] };
const TS = "Tây Sơn - SWBA";
const DIVS: Div[] = [
  { name: "3x3 U10 Mix", advance: 2, thirdPlace: true, groups: [{ letter: "A", size: 6 }],
    pool: ["TURBO DUNK", "4S Dragon 1", "4S Dragon 2", "Kimban Hoops 1", "Kimban Hoops 2", "BDC"] },
  { name: "3x3 U12 Nam", advance: 2, groups: [{ letter: "A", size: 5 }, { letter: "B", size: 5 }],
    pool: ["47Hoops DakLak 1", "47Hoops DakLak 2", "DBH", TS, "The Court Vision 1", "The Court Vision 2", "Jumpshot", "BDC 1", "BDC 2", "NEXTGEN HEAT"] },
  { name: "3x3 U13 Nam", advance: 4, groups: [{ letter: "A", size: 6 }, { letter: "B", size: 5 }],
    pool: [TS, "DBH", "Jumpshot 1", "Jumpshot 2", "Jumpshot 3", "BDC 1", "BDC 2", "BDC 3", "Phoenix Sport", "CN8", "NEXTGEN HEAT"] },
  { name: "3x3 U14 Nam", advance: 2, groups: [{ letter: "A", size: 5 }, { letter: "B", size: 5 }, { letter: "C", size: 5 }, { letter: "D", size: 5 }],
    pool: ["JamFam 1", "JamFam 2", TS, "Jumpshot", "Muscle Memory - Basketball Skills Center", "Homegrown Basketball Club", "Hanoi Amigos 1", "Hanoi Amigos 2", "Vietsport 1", "Vietsport 2", "Vietsport 3", "HBW", "NEXTGEN HEAT 1", "NEXTGEN HEAT 2", "Attitude 1", "Attitude 2", "BDC 1", "BDC 2", "BDC 3", "BDC 4"] },
  { name: "3x3 U14 Nữ", advance: 2, groups: [{ letter: "A", size: 5 }],
    pool: ["Coach Dung Basketball Club", "HNBA x Italysport 1", "HNBA x Italysport 2", "Phoenix Sport", "The Court Vision"] },
];

function divisionRounds(d: Div): Round[] {
  const rounds: Round[] = [];
  for (const g of d.groups) {
    const labels = Array.from({ length: g.size }, (_, i) => `${g.letter}${i + 1}`);
    rounds.push({ name: `Group ${g.letter}`, matches: roundRobinRounds(labels)[0]?.matches ?? [] });
  }
  const adv: string[] = [];
  for (let rank = 1; rank <= d.advance; rank++) for (const g of d.groups) adv.push(`Group ${g.letter} #${rank}`);
  rounds.push(...elimFromLabels(adv, "Knockout"));
  if (d.thirdPlace) rounds.push({ name: "Third place", matches: [{ home: `Group ${d.groups[0].letter} #3`, away: `Group ${d.groups[0].letter} #4` }] });
  return rounds;
}

const divisions = DIVS.map((d) => ({
  id: uid(), name: d.name, format: "groups_knockout" as const, entrants: d.pool.length,
  seeds: [] as { name: string; seed: number }[], pool: d.pool, logos: {},
  groupCount: d.groups.length, teamsPerGroup: Math.max(...d.groups.map((g) => g.size)), advancePerGroup: d.advance, consolation: false,
  rounds: divisionRounds(d), drawn: false,
}));

// ---- Pack: group games first, then each division's knockout (after its own groups). ----
type Game = { div: string; round: string; a: string; b: string; ko: boolean; ref: { date?: string; time?: string; court?: string } };
const koDepth = (n: string) => /quarterfinal/i.test(n) ? 1 : /semifinal/i.test(n) ? 2 : /third/i.test(n) ? 3 : /final/i.test(n) ? 3 : 2;
const games: Game[] = [];
for (const div of divisions) for (const r of div.rounds) r.matches.forEach((m) => {
  if (m.home && m.away && m.home !== "(bye)" && m.away !== "(bye)") games.push({ div: div.id, round: r.name, a: m.home, b: m.away, ko: !r.name.startsWith("Group "), ref: m });
});
const grp = games.filter((g) => !g.ko);
const ko = games.filter((g) => g.ko).sort((x, y) => koDepth(x.round) - koDepth(y.round));
const queue = [...grp, ...ko];

const slots: { date: string; min: number; sid: number; courts: string[] }[] = [];
let sid = 0;
for (const day of DAYS) for (const [s, e] of day.sessions) { for (let t = toMin(s); t + SLOT <= toMin(e) + 1; t += SLOT) slots.push({ date: day.date, min: t, sid, courts: day.courts }); sid++; }

const abs = (date?: string, time?: string) => `${date} ${time}`;
const depsOk = (g: Game, date: string, t: number) => {
  if (!g.ko) return true;
  const cur = abs(date, toHHMM(t));
  const earlier = (x: Game) => x.ref.time && abs(x.ref.date, x.ref.time) < cur;
  if (!games.filter((x) => !x.ko && x.div === g.div).every(earlier)) return false;             // all that division's GROUP games first
  if (koDepth(g.round) <= 1) return true;
  return games.filter((x) => x.ko && x.div === g.div && koDepth(x.round) < koDepth(g.round)).every(earlier); // shallower KO rounds first
};
let prev = new Set<string>(), prevSid = -1, placed = 0, fin = { date: "", min: 0 };
for (const sl of slots) {
  if (sl.sid !== prevSid) { prev = new Set(); prevSid = sl.sid; }
  const round = new Set<string>();
  for (const court of sl.courts) {
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
  courts: ["Court 1", "Court 2", "Court 3"], startDate: DAYS[0].date, endDate: DAYS[DAYS.length - 1].date, dates: DAYS.map((d) => d.date),
  dayStart: "08:00", dayEnd: toHHMM(fin.min),
  sessions: [{ start: "08:00", end: "12:20" }, { start: "14:00", end: toHHMM(fin.min) }],
  dayOverrides: { "2026-07-04": { courts: ["Court 1", "Court 2"], sessions: [{ start: "14:30", end: "21:00" }] } },
  slotMin: SLOT, restMin: SLOT, maxPerDay: 99,
};

const { id, updated } = await upsertTournament("BDSEA 2026 v.2", { kind: "multi" as const, divisions, schedule });
console.log(`${updated ? "Updated" : "Created"} BDSEA 2026 v.2 →`, id);
console.log(`Placed ${placed}/${games.length} games · ${queue.length} unplaced · finishes ${fin.date} ${toHHMM(fin.min)}`);
for (const day of DAYS) console.log(`  ${day.date} (${day.courts.length} courts): ${games.filter((g) => g.ref.date === day.date).length} games`);
for (const d of divisions) console.log(`  ${d.name}: ${(d.rounds ?? []).map((r) => `${r.name}=${r.matches.filter((m) => m.time).length}`).join(", ")}`);
