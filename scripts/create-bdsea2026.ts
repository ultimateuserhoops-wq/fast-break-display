// One-off: create the "BDSEA 2026" tournament from the Excel (teams + rules).
// Run from the project root: `bun run scripts/create-bdsea2026.ts` (loads .env for operator auth).
import { buildGroupSlots, groupKnockoutRounds } from "../src/lib/bracket";
import { createTournament } from "../gateway/scoreboard";

const uid = () => Math.random().toString(36).slice(2, 9);

type DivSpec = { name: string; teams: string[]; groupCount: number; teamsPerGroup: number; advancePerGroup: number; consolation?: boolean };
const SPECS: DivSpec[] = [
  { name: "5x5 U10 Mix", teams: ["4S Dragon", "KimbanHoops", "BDC 1"], groupCount: 1, teamsPerGroup: 3, advancePerGroup: 2 },
  { name: "5x5 U12 Nam", teams: ["The Harmony", "HNBA", "BDC 1", "BDC 2"], groupCount: 1, teamsPerGroup: 4, advancePerGroup: 2 },
  { name: "5x5 U13 Nam", teams: ["CN8 Basketball", "BDC 1", "BDC 2", "BDC 3"], groupCount: 1, teamsPerGroup: 4, advancePerGroup: 2 },
  { name: "5x5 U14 Nam", teams: ["Dream T Basketball Club", "JamFam", "Passion", "Vietsport", "NEXTGEN HEAT", "Attitude", "BDC 1", "BDC 2"], groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, consolation: true },
  { name: "5x5 U14 Nữ", teams: ["Coach Dung Basketball", "The Harmony", "Học viện Bóng rổ Hà Nội - HNBA", "CN8 Basketball"], groupCount: 1, teamsPerGroup: 4, advancePerGroup: 2 },
];

const divisions = SPECS.map((s) => {
  const slots = buildGroupSlots({ groupCount: s.groupCount, teamsPerGroup: s.teamsPerGroup, seeds: [] });
  s.teams.forEach((t, i) => { if (slots[i]) slots[i].team = t; });               // pre-fill teams (drawn)
  const rounds = groupKnockoutRounds(slots, s.teamsPerGroup, s.advancePerGroup, { consolation: s.consolation });
  return {
    id: uid(), name: s.name, format: "groups_knockout" as const, entrants: s.groupCount * s.teamsPerGroup,
    seeds: [] as { name: string; seed: number }[], pool: s.teams, logos: {},
    groupCount: s.groupCount, teamsPerGroup: s.teamsPerGroup, advancePerGroup: s.advancePerGroup, consolation: !!s.consolation,
    slots, rounds, drawn: true,
  };
});

const data = {
  kind: "multi" as const,
  divisions,
  schedule: {
    courts: ["Court 1", "Court 2"],
    startDate: "2026-07-01", endDate: "2026-07-04",
    dates: ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
    dayStart: "08:00", dayEnd: "17:00",
    sessions: [{ start: "08:00", end: "11:30" }, { start: "14:00", end: "17:00" }],
    slotMin: 70, restMin: 60, maxPerDay: 2,
  },
};

const id = await createTournament("BDSEA 2026", data);
console.log("Created BDSEA 2026 →", id);
console.log("Divisions:", divisions.map((d) => `${d.name} (${d.rounds.length} round-blocks)`).join("; "));
