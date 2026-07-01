// AI tournament generator — turns a team list + format into a seeded bracket / schedule.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export type GeneratedTournament = {
  format: string;
  teams: { seed: number; name: string }[];
  groups?: { name: string; teams: string[] }[];
  rounds: { name: string; matches: { home: string; away: string; label?: string }[] }[];
  summary?: string;
};

export async function generateTournament(opts: {
  name: string; teams: string[]; format: string; notes?: string;
}): Promise<GeneratedTournament> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set on the gateway");
  const teams = (opts.teams || []).map((t) => String(t).trim()).filter(Boolean);
  if (teams.length < 2) throw new Error("Need at least 2 teams");

  const prompt = [
    `You are a basketball tournament director. Build a "${opts.format}" tournament named "${opts.name}" for these ${teams.length} teams (listed strongest-first for seeding):`,
    teams.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    opts.notes ? `\nExtra requirements: ${opts.notes}` : "",
    "",
    "Format rules:",
    "- single_elim: seed teams (1 = strongest), build a knockout bracket. If team count isn't a power of 2, give round-1 byes to the top seeds. Name rounds (Round 1, Quarter-finals, Semi-finals, Final). Future-round matches use placeholders like \"Winner R1 M1\".",
    "- round_robin: every team plays every other once; split pairings into balanced rounds (no team appears twice in a round).",
    "- groups_knockout: split into balanced groups (round-robin within each group), then a knockout stage of the qualifiers.",
    "",
    "Return ONLY JSON of exactly this shape (use the EXACT team names given; omit \"groups\" unless the format uses groups):",
    `{"format":"${opts.format}","teams":[{"seed":1,"name":"..."}],"groups":[{"name":"Group A","teams":["..."]}],"rounds":[{"name":"Round 1","matches":[{"home":"TeamA","away":"TeamB","label":""}]}],"summary":"one short line"}`,
  ].filter(Boolean).join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  };
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${text.slice(0, 300)}`);
  let env: any;
  try { env = JSON.parse(text); } catch { throw new Error("Gemini returned non-JSON envelope"); }
  const out = env?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  try { return JSON.parse(out) as GeneratedTournament; }
  catch { throw new Error(`Could not parse tournament JSON. First 200: ${out.slice(0, 200)}`); }
}
