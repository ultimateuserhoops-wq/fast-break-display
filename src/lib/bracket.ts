// Pure bracket + draw helpers for the multi-division Tournament Hub.
// Used by the web "drawing room": seeded teams are locked into the standard protected
// bracket positions, then the remaining pool is drawn into the empty slots. Byes fall to
// the top seeds automatically (standard seeding), so a non-power-of-2 field still works.

export type Slot = { pos: number; seed: number; team: string | null; bye: boolean; seeded: boolean };
export type Match = { home: string; away: string; court?: string; date?: string; time?: string; note?: string; id?: string; result?: { hs: number; as: number } | null };
export type Round = { name: string; matches: Match[] };
export type Group = { name: string; slots: Slot[] };
export type Format = "single_elim" | "round_robin" | "groups_knockout";

/** Smallest power of two ≥ n (min 2). */
export function bracketSize(n: number): number { let s = 2; while (s < n) s *= 2; return Math.max(2, s); }

/** Slot order → seed number for a power-of-two bracket (standard seeding: 1,8,4,5,2,7,3,6 …). */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const len = order.length * 2;
    const next: number[] = [];
    for (const s of order) { next.push(s); next.push(len + 1 - s); }
    order = next;
  }
  return order;
}

/** Build the empty single-elim slot grid: seeds placed in their protected positions,
 *  byes assigned to the best seeds, the rest left null for the draw to fill. */
export function buildSlots(opts: { entrants: number; seeds: { name: string; seed: number }[] }): Slot[] {
  const size = bracketSize(opts.entrants);
  const order = seedOrder(size);
  const seedByRank = new Map(opts.seeds.map((s) => [s.seed, s.name]));
  return order.map((seed, i) => ({
    pos: i,
    seed,
    bye: seed > opts.entrants,                 // beyond the field → a bye for the facing top seed
    seeded: seedByRank.has(seed),
    team: seedByRank.get(seed) ?? null,
  }));
}

/** Randomly assign the unseeded pool into the empty (non-bye, non-seeded) slots.
 *  Returns the slots filled + the reveal order (slot positions, in fill order) for the animation.
 *  `rnd` defaults to Math.random but can be injected for deterministic tests. */
export function drawInto(slots: Slot[], pool: string[], rnd: () => number = Math.random): { slots: Slot[]; reveal: number[] } {
  const open = slots.filter((s) => !s.bye && !s.seeded && !s.team).map((s) => s.pos);
  const bag = [...pool];
  // Fisher–Yates on the bag
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  const next = slots.map((s) => ({ ...s }));
  const reveal: number[] = [];
  for (const pos of open) {
    const name = bag.shift();
    if (name == null) break;
    const s = next.find((x) => x.pos === pos)!;
    s.team = name; reveal.push(pos);
  }
  return { slots: next, reveal };
}

const ROUND_NAMES = (n: number): string[] => {
  // n = number of round-1 matches (size/2). Name the last three rounds by convention.
  const names: string[] = [];
  let games = n;
  while (games >= 1) {
    names.push(games === 1 ? "Final" : games === 2 ? "Semifinals" : games === 4 ? "Quarterfinals" : `Round of ${games * 2}`);
    if (games === 1) break;
    games = Math.floor(games / 2);
  }
  return names;
};

/** Turn a filled single-elim slot grid into rounds. Round 1 pairs consecutive slots
 *  (a bye auto-advances its opponent); later rounds are "Winner of …" placeholders. */
export function elimRounds(slots: Slot[]): Round[] {
  const size = slots.length;
  const r1Count = size / 2;
  const names = ROUND_NAMES(r1Count);
  const label = (s: Slot) => s.team ?? (s.bye ? "(bye)" : `Slot ${s.pos + 1}`);
  const rounds: Round[] = [];

  // Round 1
  const r1: Match[] = [];
  const advancers: string[] = []; // who comes out of each R1 pairing (for naming R2)
  for (let i = 0; i < size; i += 2) {
    const a = slots[i], b = slots[i + 1];
    r1.push({ home: label(a), away: label(b) });
    if (a.bye && b.team) advancers.push(b.team);
    else if (b.bye && a.team) advancers.push(a.team);
    else advancers.push(`Winner M${i / 2 + 1}`);
  }
  rounds.push({ name: names[0] ?? "Round 1", matches: r1 });

  // Later rounds — placeholders
  let prev = advancers;
  for (let r = 1; r < names.length; r++) {
    const matches: Match[] = [];
    const nextPrev: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      matches.push({ home: prev[i], away: prev[i + 1] ?? "(bye)" });
      nextPrev.push(`Winner ${names[r]} M${i / 2 + 1}`);
    }
    rounds.push({ name: names[r], matches });
    prev = nextPrev;
  }
  return rounds;
}

/** Round-robin: every team plays every other once. Emitted in CIRCLE-METHOD order — each
 *  "round" is a set of disjoint pairings — so the scheduler can spread a team's games out
 *  (one per round) instead of front-loading one team's whole slate. */
export function roundRobinRounds(teams: string[]): Round[] {
  const ms: Match[] = [];
  if (teams.length < 2) return [{ name: "Round robin", matches: ms }];
  const arr = [...teams];
  if (arr.length % 2 === 1) arr.push("(bye)");          // odd field → rotating bye
  const m = arr.length, half = m / 2;
  const idx = arr.map((_, i) => i);
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[idx[i]], b = arr[idx[m - 1 - i]];
      if (a !== "(bye)" && b !== "(bye)") ms.push({ home: a, away: b });
    }
    idx.splice(1, 0, idx.pop()!);                       // fix position 0, rotate the rest
  }
  return [{ name: "Round robin", matches: ms }];
}

/** All concrete (both sides are real teams, not bye/placeholder) matches of a division,
 *  flattened for the scheduler. */
export function schedulableMatches(divisionId: string, rounds: Round[]): { id: string; division: string; teamA: string; teamB: string; round: string; order: number }[] {
  const out: { id: string; division: string; teamA: string; teamB: string; round: string; order: number }[] = [];
  let k = 0;
  for (const r of rounds) for (let i = 0; i < r.matches.length; i++) {
    const m = r.matches[i];
    // Every real match needs a slot (incl. knockout placeholders like "Group A #1" / "Winner …"
    // so semis & finals get scheduled) — only true byes have no game.
    const concrete = (s: string) => !!s && s !== "(bye)";
    if (concrete(m.home) && concrete(m.away)) out.push({ id: `${divisionId}:${r.name}:${i}`, division: divisionId, teamA: m.home, teamB: m.away, round: r.name, order: k++ });
  }
  return out;
}

/* ---------- Groups → knockout ---------- */
const GROUP_LETTERS = "ABCDEFGHIJKLMNOP";
export const groupName = (i: number) => `Group ${GROUP_LETTERS[i] ?? i + 1}`;

/** Flat slot grid for a group draw: groupCount groups × teamsPerGroup. Seed N (1-based) is
 *  placed as the head of group N (so top seeds are spread across groups), rest left for the draw. */
export function buildGroupSlots(opts: { groupCount: number; teamsPerGroup: number; seeds: { name: string; seed: number }[] }): Slot[] {
  const { groupCount, teamsPerGroup } = opts;
  const seedByRank = new Map(opts.seeds.map((s) => [s.seed, s.name]));
  const slots: Slot[] = [];
  for (let i = 0; i < groupCount * teamsPerGroup; i++) {
    const group = Math.floor(i / teamsPerGroup);
    const head = i % teamsPerGroup === 0 && seedByRank.has(group + 1);
    slots.push({ pos: i, seed: i + 1, team: head ? seedByRank.get(group + 1)! : null, bye: false, seeded: head });
  }
  return slots;
}

export function slotsToGroups(slots: Slot[], teamsPerGroup: number): Group[] {
  const out: Group[] = [];
  for (let g = 0; g * teamsPerGroup < slots.length; g++) out.push({ name: groupName(g), slots: slots.slice(g * teamsPerGroup, (g + 1) * teamsPerGroup) });
  return out;
}

/** Group round-robins + a cross-seeded knockout over the advancers (as placeholders).
 *  With `consolation`, the top `advancePerGroup` per group go to a "Division 1" bracket and
 *  the next `advancePerGroup` go to a "Division 2" bracket (e.g. U14: 1st/2nd → Div1, 3rd/4th → Div2). */
export function groupKnockoutRounds(slots: Slot[], teamsPerGroup: number, advancePerGroup: number, opts?: { consolation?: boolean }): Round[] {
  const groups = slotsToGroups(slots, teamsPerGroup);
  const rounds: Round[] = [];
  // Empty slots get a positional placeholder (e.g. "A1", "A2") so the group games can be
  // scheduled BEFORE the draw; the draw later fills the real team into each slot position.
  groups.forEach((g, gi) => {
    const labels = g.slots.map((s, i) => s.team ?? `${GROUP_LETTERS[gi] ?? gi + 1}${i + 1}`);
    rounds.push({ name: g.name, matches: roundRobinRounds(labels)[0]?.matches ?? [] });
  });
  // One knockout tier over the given group ranks (ordered all-of-rank-1 then all-of-rank-2 …
  // so standard seeding cross-pairs groups: A1 v B2, B1 v A2).
  const tier = (ranks: number[], label: string) => {
    const adv: string[] = [];
    for (const rank of ranks) for (let g = 0; g < groups.length; g++) adv.push(`${groups[g].name} #${rank}`);
    if (adv.length < 2) return;
    const order = seedOrder(bracketSize(adv.length));
    const koSlots: Slot[] = order.map((seed, i) => ({ pos: i, seed, team: seed <= adv.length ? adv[seed - 1] : null, bye: seed > adv.length, seeded: true }));
    for (const r of elimRounds(koSlots)) rounds.push({ name: `${label} — ${r.name}`, matches: r.matches });
  };
  const ranks = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);
  if (opts?.consolation) {
    tier(ranks(1, advancePerGroup), "Division 1");
    tier(ranks(advancePerGroup + 1, advancePerGroup), "Division 2");
  } else {
    tier(ranks(1, advancePerGroup), "Knockout");
  }
  return rounds;
}
