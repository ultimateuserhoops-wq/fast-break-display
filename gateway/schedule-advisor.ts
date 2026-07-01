// AI scheduling assistant (Gemini — cheap + fast). Given the tournament + current schedule
// config + the operator's question, it gives concise advice and, when useful, returns an
// improved config the UI can apply (the deterministic autoScheduler then places the games).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function scheduleAdvisor(opts: {
  message: string;
  history?: { role: "user" | "model"; text: string }[];
  config: unknown;   // current ScheduleCfg
  summary: string;   // plain-text tournament summary
}): Promise<{ reply: string; config?: unknown }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set on the gateway");

  const sys = [
    "You are a basketball tournament SCHEDULING assistant. Help the operator fit every game across courts and days.",
    "The scheduler is DETERMINISTIC: it places games from a CONFIG. Advise concisely and, when the user wants a change, return an improved config to apply.",
    "ScheduleCfg shape: { courts: string[], startDate, endDate, dates: string[] 'YYYY-MM-DD', sessions: [{start:'HH:MM',end:'HH:MM'}] (per day), dayOverrides: { 'YYYY-MM-DD': { courts?: string[], sessions?: [...] } }, slotMin: number (minutes per game incl. turnaround), maxPerDay: number }.",
    "Rules the scheduler already enforces (don't fight them): a team plays at most once per session (a 2nd game that day is the other session); group games of a division WITH a semifinal finish before the semi day; semifinals on the 2nd-last day; all finals on the last day; games spread evenly and both courts are used.",
    "Capacity ≈ courts × Σ floor((sessionEnd−sessionStart)/slotMin) per day. If games don't fit, suggest the cheapest fix: extend a session, add a court (or a per-day court via dayOverrides), add a day, or reduce slotMin.",
    "",
    `TOURNAMENT: ${opts.summary}`,
    `CURRENT CONFIG: ${JSON.stringify(opts.config)}`,
    "",
    "Return ONLY JSON: {\"reply\": \"<concise markdown advice, under 110 words>\", \"config\": <a COMPLETE updated ScheduleCfg to apply, or null if no change is needed>}. When returning config, keep dates and unrelated fields intact; only change what the request needs.",
  ].join("\n");

  const contents = [
    { role: "user", parts: [{ text: sys }] },
    ...(opts.history ?? []).slice(-6).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: opts.message }] },
  ];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${text.slice(0, 200)}`);
  const out = JSON.parse(text)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  try { const j = JSON.parse(out); return { reply: String(j.reply ?? out), config: j.config ?? undefined }; }
  catch { return { reply: out.slice(0, 1000) || "(no reply)" }; }
}
