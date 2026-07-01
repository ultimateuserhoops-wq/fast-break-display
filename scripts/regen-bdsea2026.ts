// Rebuild "BDSEA 2026" so its game times/courts/orderings match the official
// "SCHEDULE BDSEA 2026.xlsx" EXACTLY — every group game and knockout is hand-placed
// (no auto-scheduler), and the rosters follow the sheet (COURT VISION in U12 + U14 Girls,
// "BDC" in U10, "COACH DUNG BASKETBALL" in U14 Girls). Run: bun run scripts/regen-bdsea2026.ts
import { seedOrder, bracketSize, elimRounds, type Round, type Slot } from "../src/lib/bracket";
import { upsertTournament } from "../gateway/scoreboard";

const uid = () => Math.random().toString(36).slice(2, 9);
const D1 = "2026-07-01", D2 = "2026-07-02", D3 = "2026-07-03", D4 = "2026-07-04";
const C1 = "Court 1", C2 = "Court 2";

// Single-elim bracket over placeholder labels (group winners), byes for missing seeds.
function elimFromLabels(labels: string[], prefix: string): Round[] {
  if (labels.length < 2) return [];
  const order = seedOrder(bracketSize(labels.length));
  const koSlots: Slot[] = order.map((seed, i) => ({ pos: i, seed, team: seed <= labels.length ? labels[seed - 1] : null, bye: seed > labels.length, seeded: true }));
  return elimRounds(koSlots).map((r) => ({ name: `${prefix} — ${r.name}`, matches: r.matches }));
}

type Div = { name: string; advance: number; consolation?: boolean; maxPerDay?: number; groups: { letter: string; teams: string[] }[] };
const DIVS: Div[] = [
  { name: "5x5 U10 Mix", advance: 2, groups: [{ letter: "A", teams: ["4S' SPORT", "KIMBAN HOOPS", "BDC"] }] },
  { name: "5x5 U12 Nam", advance: 2, groups: [{ letter: "B", teams: ["COURT VISION", "BDC", "SPHINX"] }] },
  { name: "5x5 U13 Nam", advance: 2, groups: [{ letter: "C", teams: ["BDC ELITE 1", "CN8 BASKETBALL", "SPHINX", "BDC ELITE 2"] }] },
  { name: "5x5 U14 Nữ", advance: 2, maxPerDay: 1, groups: [{ letter: "W", teams: ["HNBA", "COURT VISION", "CN8 BASKETBALL", "COACH DUNG BASKETBALL"] }] },
  { name: "5x5 U14 Nam", advance: 2, consolation: true, groups: [
    { letter: "D", teams: ["ATTITUDEB", "BDC 2", "HANOI AMIGOS", "VIETSPORT"] },
    { letter: "E", teams: ["NEXTGEN HEAT", "BDC 1", "JAMFAM"] },
  ] },
];

// ---- The exact group games, decoded from the spreadsheet (date · time · court · A vs B) ----
type GG = { div: string; group: string; date: string; time: string; court: string; a: string; b: string };
const GROUP_GAMES: GG[] = [
  // U10 Mix — Group A (Court 2)
  { div: "5x5 U10 Mix", group: "A", date: D1, time: "14:00", court: C2, a: "4S' SPORT", b: "KIMBAN HOOPS" },
  { div: "5x5 U10 Mix", group: "A", date: D2, time: "14:00", court: C2, a: "KIMBAN HOOPS", b: "BDC" },
  { div: "5x5 U10 Mix", group: "A", date: D3, time: "13:30", court: C2, a: "BDC", b: "4S' SPORT" },
  // U12 Nam — Group B (Court 1)
  { div: "5x5 U12 Nam", group: "B", date: D1, time: "08:30", court: C1, a: "SPHINX", b: "BDC" },
  { div: "5x5 U12 Nam", group: "B", date: D2, time: "08:30", court: C1, a: "COURT VISION", b: "SPHINX" },
  { div: "5x5 U12 Nam", group: "B", date: D3, time: "08:30", court: C1, a: "BDC", b: "COURT VISION" },
  // U13 Nam — Group C (Court 1)
  { div: "5x5 U13 Nam", group: "C", date: D1, time: "14:00", court: C1, a: "BDC ELITE 1", b: "BDC ELITE 2" },
  { div: "5x5 U13 Nam", group: "C", date: D1, time: "15:30", court: C1, a: "CN8 BASKETBALL", b: "SPHINX" },
  { div: "5x5 U13 Nam", group: "C", date: D2, time: "14:00", court: C1, a: "SPHINX", b: "BDC ELITE 1" },
  { div: "5x5 U13 Nam", group: "C", date: D2, time: "15:30", court: C1, a: "CN8 BASKETBALL", b: "BDC ELITE 2" },
  { div: "5x5 U13 Nam", group: "C", date: D3, time: "14:00", court: C1, a: "CN8 BASKETBALL", b: "BDC ELITE 1" },
  { div: "5x5 U13 Nam", group: "C", date: D3, time: "15:30", court: C1, a: "SPHINX", b: "BDC ELITE 2" },
  // U14 Nữ — Group W (Court 1)
  { div: "5x5 U14 Nữ", group: "W", date: D1, time: "10:00", court: C1, a: "HNBA", b: "COACH DUNG BASKETBALL" },
  { div: "5x5 U14 Nữ", group: "W", date: D1, time: "11:30", court: C1, a: "COURT VISION", b: "CN8 BASKETBALL" },
  { div: "5x5 U14 Nữ", group: "W", date: D2, time: "10:00", court: C1, a: "CN8 BASKETBALL", b: "HNBA" },
  { div: "5x5 U14 Nữ", group: "W", date: D2, time: "11:30", court: C1, a: "COURT VISION", b: "COACH DUNG BASKETBALL" },
  { div: "5x5 U14 Nữ", group: "W", date: D3, time: "10:00", court: C1, a: "COURT VISION", b: "HNBA" },
  { div: "5x5 U14 Nữ", group: "W", date: D3, time: "11:30", court: C1, a: "CN8 BASKETBALL", b: "COACH DUNG BASKETBALL" },
  // U14 Nam — Group D (Court 2)
  { div: "5x5 U14 Nam", group: "D", date: D1, time: "09:45", court: C2, a: "ATTITUDEB", b: "VIETSPORT" },
  { div: "5x5 U14 Nam", group: "D", date: D1, time: "11:00", court: C2, a: "BDC 2", b: "HANOI AMIGOS" },
  { div: "5x5 U14 Nam", group: "D", date: D1, time: "16:45", court: C2, a: "HANOI AMIGOS", b: "ATTITUDEB" },
  { div: "5x5 U14 Nam", group: "D", date: D1, time: "18:00", court: C2, a: "BDC 2", b: "VIETSPORT" },
  { div: "5x5 U14 Nam", group: "D", date: D2, time: "09:45", court: C2, a: "BDC 2", b: "ATTITUDEB" },
  { div: "5x5 U14 Nam", group: "D", date: D2, time: "11:00", court: C2, a: "HANOI AMIGOS", b: "VIETSPORT" },
  // U14 Nam — Group E (Court 2)
  { div: "5x5 U14 Nam", group: "E", date: D1, time: "08:30", court: C2, a: "NEXTGEN HEAT", b: "JAMFAM" },
  { div: "5x5 U14 Nam", group: "E", date: D1, time: "15:30", court: C2, a: "BDC 1", b: "NEXTGEN HEAT" },
  { div: "5x5 U14 Nam", group: "E", date: D2, time: "08:30", court: C2, a: "JAMFAM", b: "BDC 1" },
];

// ---- Knockout placements (round name + match index → exact slot). Order of matches within a
// round is how elimRounds emits them, which already cross-pairs the groups like the sheet. ----
type KG = { div: string; round: string; idx: number; date: string; time: string; court: string };
const KO_GAMES: KG[] = [
  { div: "5x5 U10 Mix", round: "Knockout — Final", idx: 0, date: D4, time: "08:00", court: C1 },
  { div: "5x5 U14 Nữ", round: "Knockout — Final", idx: 0, date: D4, time: "09:30", court: C1 },
  { div: "5x5 U12 Nam", round: "Knockout — Final", idx: 0, date: D4, time: "11:00", court: C1 },
  { div: "5x5 U13 Nam", round: "Knockout — Final", idx: 0, date: D4, time: "12:30", court: C1 },
  { div: "5x5 U14 Nam", round: "Division 2 — Final", idx: 0, date: D3, time: "08:00", court: C2 },     // 3rd E vs 3rd D
  { div: "5x5 U14 Nam", round: "Division 1 — Semifinals", idx: 0, date: D3, time: "10:30", court: C2 }, // 1st D vs 2nd E
  { div: "5x5 U14 Nam", round: "Division 1 — Semifinals", idx: 1, date: D3, time: "12:00", court: C2 }, // 1st E vs 2nd D
  { div: "5x5 U14 Nam", round: "Division 1 — Final", idx: 0, date: D4, time: "14:00", court: C1 },
];

function divisionRounds(d: Div): Round[] {
  const rounds: Round[] = [];
  for (const g of d.groups) {
    const ms = GROUP_GAMES.filter((x) => x.div === d.name && x.group === g.letter)
      .map((x) => ({ home: x.a, away: x.b, date: x.date, time: x.time, court: x.court }));
    rounds.push({ name: `Group ${g.letter}`, matches: ms });
  }
  const labelsForRanks = (ranks: number[]) => {
    const out: string[] = [];
    for (const rank of ranks) for (const g of d.groups) if (g.teams.length >= rank) out.push(`Group ${g.letter} #${rank}`);
    return out;
  };
  const ranks = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);
  let ko: Round[] = [];
  if (d.consolation) {
    ko.push(...elimFromLabels(labelsForRanks(ranks(1, d.advance)), "Division 1"));   // top `advance` of each group → Div1 bracket
    ko.push(...elimFromLabels(labelsForRanks([d.advance + 1]), "Division 2"));        // 3rd of each group → single Div2 final
  } else {
    ko.push(...elimFromLabels(labelsForRanks(ranks(1, d.advance)), "Knockout"));      // top `advance` → final
  }
  ko = ko.map((r) => ({ ...r, matches: r.matches.map((m, i) => { const k = KO_GAMES.find((x) => x.div === d.name && x.round === r.name && x.idx === i); return k ? { ...m, date: k.date, time: k.time, court: k.court } : m; }) }));
  rounds.push(...ko);
  return rounds;
}

const divisions = DIVS.map((d) => {
  const teams = d.groups.flatMap((g) => g.teams);
  const teamsPerGroup = Math.max(...d.groups.map((g) => g.teams.length));
  return {
    id: uid(), name: d.name, format: "groups_knockout" as const, entrants: teams.length,
    seeds: [] as { name: string; seed: number }[], pool: teams, logos: {},
    groupCount: d.groups.length, teamsPerGroup, advancePerGroup: d.advance, consolation: !!d.consolation, maxPerDay: d.maxPerDay,
    rounds: divisionRounds(d), drawn: true,
  };
});

const schedule = {
  courts: [C1, C2],
  startDate: D1, endDate: D4,
  dates: [D1, D2, D3, D4],
  dayStart: "08:00", dayEnd: "18:40",
  sessions: [{ start: "08:00", end: "12:30" }, { start: "13:30", end: "19:00" }],
  slotMin: 70, restMin: 60, maxPerDay: 2,
};

const placed = divisions.flatMap((d) => (d.rounds ?? []).flatMap((r) => r.matches.filter((m) => m.time).length));
const total = placed.reduce((n, x) => n + x, 0);
const { id, updated } = await upsertTournament("BDSEA 2026", { kind: "multi" as const, divisions, schedule });
console.log(`${updated ? "Updated" : "Created"} BDSEA 2026 →`, id, `| ${total} games placed (expect 35: 27 group + 8 knockout)`);
for (const d of divisions) console.log(`  ${d.name}: ${(d.rounds ?? []).map((r) => `${r.name}=${r.matches.length}`).join(", ")}`);
