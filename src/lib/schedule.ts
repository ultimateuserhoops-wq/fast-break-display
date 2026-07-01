// Auto-scheduler for a multi-division tournament across several courts.
// Pure logic — runs in the browser (Tournament Hub) AND on the gateway (re-exported there).
// Greedy earliest-fit: walk matches in a spread order and drop each into the first
// (date → time → court) slot that keeps every constraint:
//   • a court hosts one game per time slot
//   • a team is never in two overlapping games
//   • a team gets at least `restMin` between its games
//   • a team plays at most `maxPerDay` games on a date
// Anything that can't be placed comes back with a reason instead of being dropped.

export type SchedMatch = { id: string; division: string; teamA: string; teamB: string; round?: string; order?: number };
export type SchedConfig = {
  matches: SchedMatch[];
  courts: string[];
  dates: string[];            // ISO "YYYY-MM-DD", in play order
  dayStart?: string;          // "09:00" (used when `sessions` is absent)
  dayEnd?: string;            // "18:00"
  sessions?: { start: string; end: string }[]; // e.g. [{08:00,11:30},{14:00,17:00}] — overrides dayStart/dayEnd
  dayOverrides?: Record<string, { courts?: string[]; sessions?: { start: string; end: string }[] }>; // per-date extra courts / hours (e.g. a Wednesday with a 3rd court + evening)
  divisionStart?: Record<string, string>;        // division id → earliest date its games may be scheduled
  divisionMaxPerDay?: Record<string, number>;    // division id → max games/team/day (e.g. girls = 1, no twice-a-day)
  slotMin?: number;           // minutes per game slot (game + turnaround), default 40
  restMin?: number;           // min rest between a team's games, default 60
  maxPerDay?: number;         // max games per team per day, default 2
};
export type Scheduled = SchedMatch & { date: string; time: string; court: string };
export type SchedResult = {
  scheduled: Scheduled[];
  unscheduled: { id: string; division: string; teamA: string; teamB: string; reason: string }[];
  warnings: string[];
  slotsTotal: number;
};

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function autoSchedule(cfg: SchedConfig): SchedResult {
  const courts = cfg.courts?.length ? cfg.courts : ["Court 1"];
  const dates = cfg.dates?.length ? cfg.dates : [new Date().toISOString().slice(0, 10)];
  const slotMin = cfg.slotMin ?? 40;
  const maxPerDay = cfg.maxPerDay ?? 2;
  // Sessions (e.g. morning + afternoon, skipping the lunch gap). Falls back to one window.
  const baseSessions = cfg.sessions?.length ? cfg.sessions : [{ start: cfg.dayStart || "09:00", end: cfg.dayEnd || "18:00" }];

  type Slot = { date: string; min: number; court: string; session: number };
  const slots: Slot[] = [];
  for (const date of dates) {
    const ov = cfg.dayOverrides?.[date];                               // a day can add courts / sessions (e.g. Wed: 3rd court + evening)
    const daySessions = ov?.sessions?.length ? ov.sessions : baseSessions;
    const dayCourts = ov?.courts?.length ? ov.courts : courts;
    daySessions.forEach((sess, si) => {
      const a = toMin(sess.start), b = toMin(sess.end);
      for (let t = a; t + slotMin <= b + 1; t += slotMin)
        for (const court of dayCourts) slots.push({ date, min: t, court, session: si });
    });
  }

  // Fill BOTH courts at each time before moving to the next time, and spread the same time
  // across every date first — keeps courts balanced AND distributes games over the date range.
  const timeRank = new Map<string, number>();
  for (const date of dates) {
    const mins = [...new Set(slots.filter((s) => s.date === date).map((s) => s.min))].sort((x, y) => x - y);
    mins.forEach((m, i) => timeRank.set(`${date}|${m}`, i));
  }
  const rk = (s: Slot) => timeRank.get(`${s.date}|${s.min}`) ?? 0;
  const orderedSlots = [...slots].sort((a, b) =>
    rk(a) - rk(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.court < b.court ? -1 : a.court > b.court ? 1 : 0));

  const taken = new Set<string>();
  // Team identity is division-scoped ("BDC 1" in U10 ≠ "BDC 1" in U12). A team plays at most
  // ONCE per session, so its second game of the day always lands in the other session (AM↔PM).
  const perDay = new Map<string, number>();
  const perSession = new Set<string>();
  const ok = (k: string, s: Slot, cap: number) =>
    (perDay.get(`${k}|${s.date}`) ?? 0) < cap && !perSession.has(`${k}|${s.date}|${s.session}`);
  const place = (k: string, s: Slot) => {
    perDay.set(`${k}|${s.date}`, (perDay.get(`${k}|${s.date}`) ?? 0) + 1);
    perSession.add(`${k}|${s.date}|${s.session}`);
  };

  // Playoff games (knockout/semi/final/Division N) get priority and never double up; group
  // games are 1/day by default and only double when even spreading can't fit them.
  const isPlayoff = (r?: string) => /knockout|division|final|semi|quarter|playoff|round of/i.test(r || "");
  const divsWithSemi = new Set(cfg.matches.filter((m) => /semi/i.test(m.round || "")).map((m) => m.division));
  // Priority order. Test semi/quarter BEFORE final ("Semifinals" contains "final"). A division
  // WITH a semi has its group squeezed into fewer days, so place those group games first.
  // Group games of a day-capped division (e.g. girls = 1/day) are the tightest to place, so go
  // FIRST; then divisions with a semi (fewer days); then the rest.
  const rank = (m: SchedMatch) => { const r = m.round || ""; return /semi/i.test(r) ? 8 : /quarter/i.test(r) ? 7 : /final/i.test(r) ? 9 : isPlayoff(r) ? 6 : cfg.divisionMaxPerDay?.[m.division] ? 3 : divsWithSemi.has(m.division) ? 2 : 1; };
  const ordered = [...cfg.matches].sort((a, b) =>
    rank(b) - rank(a) || (a.order ?? 0) - (b.order ?? 0) || a.division.localeCompare(b.division));

  // Phase windows: when there's a knockout and ≥3 days, reserve the LAST day for ALL finals
  // and the second-to-last for semis. Group games of divisions WITH a semi must finish before
  // the semi day; divisions with NO semi can spread their group games up to the semi day too.
  const allDates = [...new Set(slots.map((s) => s.date))].sort();
  const reserve = ordered.some((m) => isPlayoff(m.round)) && allDates.length >= 3;
  const finalDays = new Set(reserve ? allDates.slice(-1) : allDates);      // last day → all finals
  const semiDays = new Set(reserve ? allDates.slice(-2, -1) : allDates);   // 2nd-last → semis
  const preSemiDays = new Set(reserve ? allDates.slice(0, -2) : allDates); // groups of divisions WITH a semi (must end before the semi day)
  const preFinalDays = new Set(reserve ? allDates.slice(0, -1) : allDates);// groups of divisions with NO semi (may use the semi day too)
  const phaseDays = (m: SchedMatch) => {
    const r = m.round || "";
    if (/semi|quarter/i.test(r)) return semiDays;
    if (/final/i.test(r)) return finalDays;                                 // every final on the last day
    return divsWithSemi.has(m.division) ? preSemiDays : preFinalDays;       // group games
  };
  const phaseName = (m: SchedMatch) => /semi|quarter/i.test(m.round || "") ? "semifinal" : /final/i.test(m.round || "") ? "final" : "group";

  const scheduled: Scheduled[] = [];
  const placed = new Set<string>();
  const assign = (capFor: (m: SchedMatch) => number) => {
    for (const m of ordered) {
      if (placed.has(m.id)) continue;
      const cap = capFor(m);
      const ko = isPlayoff(m.round);                            // knockout participants are unknown placeholders
      const allow = phaseDays(m);
      const minDate = cfg.divisionStart?.[m.division];          // a division can start later (e.g. U10 on day 2)
      const ka = `${m.division}|${m.teamA}`, kb = `${m.division}|${m.teamB}`;
      for (const s of orderedSlots) {
        if (!allow.has(s.date)) continue;                       // keep each phase in its day window
        if (minDate && s.date < minDate) continue;              // respect the division's earliest start
        const key = `${s.date}|${s.min}|${s.court}`;
        if (taken.has(key)) continue;
        // Team double-book / rest only applies to the group stage (real, fixed slots). Knockout
        // games have placeholder participants ("Winner M1") and just need a free court in-window.
        if (!ko && (!ok(ka, s, cap) || !ok(kb, s, cap))) continue;
        taken.add(key);
        if (!ko) { place(ka, s); place(kb, s); }
        scheduled.push({ ...m, date: s.date, time: toHHMM(s.min), court: s.court });
        placed.add(m.id); break;
      }
    }
  };
  const cap2 = (m: SchedMatch) => isPlayoff(m.round) ? 1 : Math.min(maxPerDay, cfg.divisionMaxPerDay?.[m.division] ?? maxPerDay);
  assign(() => 1);   // pass 1: spread evenly, one game/team/day
  assign(cap2);      // pass 2: leftover GROUP games may double up — unless the division caps games/day (e.g. girls = 1)
  const unscheduled: SchedResult["unscheduled"] = ordered.filter((m) => !placed.has(m.id))
    .map((m) => ({ id: m.id, division: m.division, teamA: m.teamA, teamB: m.teamB, reason: `Couldn't fit in the ${phaseName(m)}-stage day window — add a court/widen the hours (or give that phase more days).` }));

  const warnings: string[] = [];
  if (unscheduled.length) warnings.push(`${unscheduled.length} match(es) couldn't be placed.`);
  if (cfg.matches.length > slots.length) warnings.push(`You have ${cfg.matches.length} matches but only ${slots.length} court-slots — not enough room.`);
  return { scheduled, unscheduled, warnings, slotsTotal: slots.length };
}
