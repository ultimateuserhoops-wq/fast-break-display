// Telegram bot (Part B) — menu-driven tournament manager, long-polling so it runs on
// the LAN gateway with no public webhook. Create a tournament (Gemini builds the bracket,
// Claude adds guidance) or update results (edit scores of ongoing tournaments → recompute
// standings). All data goes to the BDCSEA tour site. Dormant unless TELEGRAM_TOKEN is set.
import { hostname } from "node:os";
import { generateTournament } from "./tournament";
import { publishToBdcsea, bdcseaConfigured, bdcseaOngoing, bdcseaMatches, bdcseaSetScore, bdcseaRemoveSub } from "./bdcsea";
import { createTournament, scoreboardConfigured } from "./scoreboard";
import { buildSlots, elimRounds, roundRobinRounds } from "../src/lib/bracket";

const TOKEN = process.env.TELEGRAM_TOKEN || process.env.HERMES_TELEGRAM_TOKEN || "";
const ALLOWED = (process.env.TELEGRAM_CHAT_ID || process.env.HERMES_ADMIN_CHAT_ID || "").trim(); // optional allowlist
const ANTHROPIC = process.env.ANTHROPIC_API_KEY || "";
const PORT = Number(process.env.GATEWAY_PORT || 8787);
const API = `https://api.telegram.org/bot${TOKEN}`;
const hubLink = () => `http://${hostname().split(".")[0]}.local:${PORT}/tournaments`;
const rid = () => Math.random().toString(36).slice(2, 9);

// Build a division's bracket from its config (mirrors the web hub's buildRounds).
type Div = { id: string; name: string; format: "single_elim" | "round_robin"; entrants: number; seeds: { name: string; seed: number }[]; pool: string[]; drawn: boolean };
function buildDivision(d: Div) {
  if (d.format === "round_robin") {
    const members = [...[...d.seeds].sort((a, b) => a.seed - b.seed).map((s) => s.name), ...d.pool];
    const named = members.length ? members : Array.from({ length: d.entrants }, (_, i) => `Team ${i + 1}`);
    return { ...d, rounds: roundRobinRounds(named) };
  }
  const slots = buildSlots({ entrants: d.entrants, seeds: d.seeds });
  return { ...d, slots, rounds: elimRounds(slots) };
}
const divisionPrompt = () =>
  "Add a division (age group) — just *describe it in plain words*, one or several per message. I'll read it with AI, so any phrasing works:\n\n• `U10 mixed, single elim, 3 teams`\n• `U14 round robin 6`\n• `U16 single 8 — seeds Lakers and Celtics`\n\n*type* = single elimination or round robin · *count* = number of teams · *seeds* optional (locked to protected slots). Leave the teams unnamed to draw them later in the web drawing room. Tap *Done* when finished.";

async function tg(method: string, params: object): Promise<any> {
  const r = await fetch(`${API}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params),
    signal: AbortSignal.timeout(40_000),
  });
  return (await r.json())?.result;
}
const send = (chat: number | string, text: string, keyboard?: any[][]) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "Markdown", reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined });

async function claudeTip(prompt: string): Promise<string> {
  if (!ANTHROPIC) return "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 220, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json();
    return j?.content?.[0]?.text?.trim() ?? "";
  } catch { return ""; }
}

// Ask Claude to return JSON and parse the first {...} object out of the reply.
async function claudeJson(prompt: string): Promise<any | null> {
  if (!ANTHROPIC) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30_000),
    });
    const txt = (await r.json())?.content?.[0]?.text ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

// Claude-powered division parser — tolerant of any separator (|, I, l, comma, or plain
// words) and reads one OR several divisions from a single free-text message.
async function parseDivisions(text: string): Promise<{ name: string; format: Div["format"]; entrants: number; seeds: string[] }[]> {
  const norm = (x: any) => ({
    name: String(x?.name ?? "").trim(),
    format: (/(robin|rr|league)/i.test(String(x?.format ?? "")) || x?.format === "round_robin") ? "round_robin" as const : "single_elim" as const,
    entrants: Math.max(2, parseInt(String(x?.entrants ?? x?.count ?? x?.teams)) || 0),
    seeds: Array.isArray(x?.seeds) ? x.seeds.map((s: any) => String(s).trim()).filter(Boolean) : [],
  });
  const j = await claudeJson(
    `You parse basketball tournament divisions (age groups) from a chat message. Return ONLY JSON: {"divisions":[{"name":string,"format":"single_elim"|"round_robin","entrants":number,"seeds":string[]}]}.\n` +
    `A division usually reads like "Name | type | count | seeds" but the separators may be "|", a capital I, a lowercase l, commas, or just spaces/words. format: "rr"/"round robin"/"league" => round_robin, anything else (single/knockout/elim/empty) => single_elim. entrants = the team count (a bare number). seeds = explicitly named seeded teams only, else []. Read every division in the message. If none is parseable, return {"divisions":[]}.\n` +
    `Message: """${text}"""`,
  );
  const arr: any[] = Array.isArray(j?.divisions) ? j.divisions : [];
  const out = arr.map(norm).filter((d) => d.name && d.entrants >= 2);
  if (out.length) return out;
  // fallback when Claude is unavailable: rigid pipe split, single division
  const parts = text.split("|").map((x) => x.trim());
  if (parts.length >= 3 && parts[0]) {
    const d = norm({ name: parts[0], format: parts[1], entrants: parts[2], seeds: parts[3] ? parts[3].split(",") : [] });
    if (d.name && d.entrants >= 2) return [d];
  }
  return [];
}

type Draft = { mode?: "quick" | "multi"; name?: string; format?: string; finishDate?: string | null; teams?: string[]; generated?: any; subId?: string; matchId?: string; divisions?: Div[] };
const state = new Map<number, { step: string; draft: Draft }>();
const FMT: [string, string][] = [["single_elim", "Single elimination"], ["round_robin", "Round robin"], ["groups_knockout", "Groups → knockout"]];

function menu(chat: number | string) {
  return send(chat, "*BDCSEA tournament bot* — what would you like to do?", [
    [{ text: "🏆 Create tournament", callback_data: "create" }],
    [{ text: "📝 Update a result", callback_data: "result" }],
    [{ text: "📋 Ongoing tournaments", callback_data: "ongoing" }],
  ]);
}

async function handleText(chat: number, text: string) {
  const st = state.get(chat);
  const t = text.trim();
  if (!st || t === "/start" || t.toLowerCase() === "menu") { state.delete(chat); return menu(chat); }

  if (st.step === "name") {
    st.draft.name = t; st.step = "format";
    return send(chat, `Tournament: *${t}*\nPick a format:`, FMT.map(([v, l]) => [{ text: l, callback_data: `fmt:${v}` }]));
  }
  if (st.step === "ename") {
    st.draft.name = t; st.draft.divisions = []; st.step = "division";
    return send(chat, `Event: *${t}*\n\n${divisionPrompt()}`, [[{ text: "✅ Done — create it", callback_data: "mdone" }]]);
  }
  if (st.step === "division") {
    const parsed = await parseDivisions(t);
    if (!parsed.length) return send(chat, "I couldn't read a division there. Just describe it naturally, e.g.:\n• `U10 mixed, single elim, 3 teams`\n• `U14 round robin 6`\n• `U16 single 8 — seeds Lakers and Celtics`", [[{ text: "✅ Done", callback_data: "mdone" }]]);
    st.draft.divisions ??= [];
    const added: string[] = [];
    for (const d of parsed) {
      const seeds = d.seeds.slice(0, d.entrants).map((nm, i) => ({ name: nm, seed: i + 1 }));
      st.draft.divisions.push({ id: rid(), name: d.name, format: d.format, entrants: d.entrants, seeds, pool: [], drawn: false });
      added.push(`*${d.name}* — ${d.format === "round_robin" ? "round robin" : "single elim"}, ${d.entrants} teams${seeds.length ? `, ${seeds.length} seeded` : ""}`);
    }
    return send(chat, `✓ Added:\n• ${added.join("\n• ")}\n\n(${st.draft.divisions.length} division(s) total) Add another or tap Done.`, [[{ text: "✅ Done — create it", callback_data: "mdone" }]]);
  }
  if (st.step === "finishdate") {
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m && !/^skip$/i.test(t)) return send(chat, "Send the finish date as `YYYY-MM-DD` (e.g. `2026-07-15`), or type `skip`.");
    st.draft.finishDate = m ? t : null;
    st.step = "teams";
    return send(chat, `${m ? `Finish date set to *${t}*.` : "No end date."}\nNow send the teams (comma-separated, *strongest first* for seeding).`);
  }
  if (st.step === "teams") {
    const teams = t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (teams.length < 2) return send(chat, "Send at least 2 teams, comma-separated.");
    st.draft.teams = teams;
    await send(chat, `Got ${teams.length} teams. Building the bracket…`);
    const tip = await claudeTip(`A basketball "${st.draft.format}" tournament with ${teams.length} teams: ${teams.join(", ")}. In 2 short sentences, warn about any issue (odd count → byes, clashes) and confirm the format fits. Be concise.`);
    if (tip) await send(chat, `💡 ${tip}`);
    try {
      const g = await generateTournament({ name: st.draft.name!, teams, format: st.draft.format!, notes: "" });
      st.draft.generated = g; st.step = "confirm";
      const lines = (g.rounds ?? []).map((r: any) => `*${r.name}*\n` + r.matches.map((m: any) => `• ${m.home} vs ${m.away}`).join("\n")).join("\n\n");
      return send(chat, `${g.summary ?? ""}\n\n${lines}`.slice(0, 3500), [
        [{ text: "✅ Publish to BDCSEA", callback_data: "pub" }], [{ text: "❌ Cancel", callback_data: "cancel" }],
      ]);
    } catch (e) { state.delete(chat); return send(chat, `⚠️ ${(e as Error).message}`); }
  }
  if (st.step === "score") {
    const m = t.match(/(\d+)\s*[-:to]+\s*(\d+)/i);
    if (!m) return send(chat, "Send the score like `58-52`.");
    try {
      await bdcseaSetScore(st.draft.matchId!, parseInt(m[1]), parseInt(m[2]));
      state.delete(chat);
      return send(chat, `✓ Score saved (${m[1]}-${m[2]}) and standings updated.`, [[{ text: "📝 Edit another", callback_data: `sub:${st.draft.subId}` }], [{ text: "🏠 Menu", callback_data: "menu" }]]);
    } catch (e) { return send(chat, `⚠️ ${(e as Error).message}`); }
  }
  return menu(chat);
}

async function handleCallback(chat: number, data: string, cbId: string) {
  await tg("answerCallbackQuery", { callback_query_id: cbId });
  if (data === "menu") { state.delete(chat); return menu(chat); }
  if (data === "cancel") { state.delete(chat); return send(chat, "Cancelled."); }

  if (data === "create") {
    return send(chat, "🏆 *New tournament* — pick a type:", [
      [{ text: "📋 Multi-division event (age groups, draw + schedule in web)", callback_data: "createmulti" }],
      [{ text: "⚡ Quick single bracket → BDCSEA", callback_data: "createquick" }],
    ]);
  }
  if (data === "createquick") {
    if (!bdcseaConfigured()) return send(chat, "⚠️ BDCSEA isn't connected on the gateway (set BDCSEA_SUPABASE_URL/KEY).");
    state.set(chat, { step: "name", draft: { mode: "quick" } });
    return send(chat, "⚡ *Quick bracket* — send the tournament name.");
  }
  if (data === "createmulti") {
    if (!scoreboardConfigured()) return send(chat, "⚠️ Scoreboard isn't connected on the gateway (set SCOREBOARD_OPERATOR_PASSWORD).");
    state.set(chat, { step: "ename", draft: { mode: "multi", divisions: [] } });
    return send(chat, "📋 *Multi-division event* — send the event name (e.g. Summer Cup 2026).");
  }
  if (data === "mdone") {
    const st = state.get(chat);
    if (!st?.draft.divisions?.length) return send(chat, "Add at least one division first.", [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    await send(chat, "Creating the event…");
    try {
      const divisions = st.draft.divisions.map(buildDivision);
      const model = { kind: "multi", divisions, schedule: { courts: ["Court 1", "Court 2"], dates: [], dayStart: "09:00", dayEnd: "18:00", slotMin: 40, restMin: 60, maxPerDay: 2 } };
      await createTournament(st.draft.name!, model);
      const placeholders = st.draft.divisions.filter((d) => d.pool.length < d.entrants - d.seeds.length).length;
      state.delete(chat);
      return send(chat,
        `✅ Created *${st.draft.name}* — ${divisions.length} division(s)${placeholders ? `, ${placeholders} awaiting a draw` : ""}.\n\nOpen the web *Tournament Hub* to run the draw + auto-schedule (no team double-booked, max games/day), then publish to BDCSEA:\n${hubLink()}`,
        [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    } catch (e) { return send(chat, `⚠️ ${(e as Error).message}`); }
  }
  if (data.startsWith("fmt:")) {
    const st = state.get(chat); if (!st) return menu(chat);
    st.draft.format = data.slice(4); st.step = "finishdate";
    return send(chat, "📅 When does it finish? Send a date as `YYYY-MM-DD`, or tap *Skip* (it stays editable until you remove it). It auto-archives 1 week after this date.", [[{ text: "Skip — no end date", callback_data: "nofinish" }]]);
  }
  if (data === "nofinish") {
    const st = state.get(chat); if (!st) return menu(chat);
    st.draft.finishDate = null; st.step = "teams";
    return send(chat, "Send the teams (comma-separated, *strongest first* for seeding).");
  }
  if (data === "pub") {
    const st = state.get(chat); if (!st?.draft.generated) return menu(chat);
    await send(chat, "Publishing to BDCSEA…");
    try {
      const teams = (st.draft.teams ?? []).map((n) => ({ name: n }));
      const r = await publishToBdcsea({ name: st.draft.name!, format: st.draft.format, finishDate: st.draft.finishDate, teams, rounds: st.draft.generated.rounds });
      state.delete(chat);
      return send(chat, `✅ Published *${st.draft.name}* — ${r.createdMatches} matches, ${r.createdTeams} new team(s). It's live on the BDCSEA schedule.`, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    } catch (e) { return send(chat, `⚠️ ${(e as Error).message}`); }
  }

  if (data === "result" || data === "ongoing") {
    if (!bdcseaConfigured()) return send(chat, "⚠️ BDCSEA isn't connected on the gateway.");
    const subs = await bdcseaOngoing();
    if (!subs.length) return send(chat, "No ongoing tournaments. Create one first.", [[{ text: "🏆 Create", callback_data: "create" }]]);
    const kb: any[][] = subs.map((s) => [{ text: s.finish_date ? `${s.label} · ends ${s.finish_date}` : s.label, callback_data: `sub:${s.id}` }]);
    if (data === "ongoing") kb.push([{ text: "🗑 Remove a tournament", callback_data: "removelist" }]);
    return send(chat, data === "ongoing" ? "📋 Ongoing tournaments (auto-archive 1 week after the end date):" : "📝 Pick a tournament to edit a result:", kb);
  }
  if (data === "removelist") {
    const subs = await bdcseaOngoing(true); // include archived so anything can be removed
    if (!subs.length) return send(chat, "Nothing to remove.");
    return send(chat, "🗑 Pick a tournament to *permanently remove* (matches + standings):",
      subs.map((s) => [{ text: s.finish_date ? `${s.label} · ${s.finish_date}` : s.label, callback_data: `rm:${s.id}` }]));
  }
  if (data.startsWith("rm:")) {
    const id = data.slice(3);
    return send(chat, "⚠️ Remove this tournament and all its matches/standings? This can't be undone.", [
      [{ text: "✅ Yes, remove it", callback_data: `rmyes:${id}` }], [{ text: "❌ Keep it", callback_data: "menu" }],
    ]);
  }
  if (data.startsWith("rmyes:")) {
    try {
      const r = await bdcseaRemoveSub(data.slice(6));
      return send(chat, `🗑 Removed *${r.label}*.`, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    } catch (e) { return send(chat, `⚠️ ${(e as Error).message}`); }
  }
  if (data.startsWith("sub:")) {
    const subId = data.slice(4);
    const ms = await bdcseaMatches(subId);
    if (!ms.length) return send(chat, "No matches in this tournament yet.");
    const kb = ms.map((m) => [{ text: `${m.home} ${m.status === "completed" ? `${m.home_score}-${m.away_score}` : "vs"} ${m.away}`, callback_data: `m:${m.id}` }]);
    state.set(chat, { step: "pickmatch", draft: { subId } });
    return send(chat, "Pick a match to set/edit its score:", kb);
  }
  if (data.startsWith("m:")) {
    const st = state.get(chat) ?? { step: "", draft: {} };
    st.draft.matchId = data.slice(2); st.step = "score"; state.set(chat, st);
    return send(chat, "Send the final score like `58-52` (home-away). You can re-edit anytime.");
  }
  return menu(chat);
}

let running = false;
export function startTelegramBot() {
  if (!TOKEN || running) return;
  running = true;
  console.log("  🤖 Telegram bot: ON (long-polling)" + (ANTHROPIC ? " + Claude guidance" : " (no Claude key → no smart tips)"));
  let offset = 0;
  (async function loop() {
    while (running) {
      try {
        const updates: any[] = (await tg("getUpdates", { offset, timeout: 30 })) ?? [];
        for (const u of updates) {
          offset = u.update_id + 1;
          const chat = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
          if (!chat) continue;
          if (ALLOWED && String(chat) !== ALLOWED) continue; // ignore other chats
          try {
            if (u.callback_query) await handleCallback(chat, u.callback_query.data || "", u.callback_query.id);
            else if (u.message?.text) await handleText(chat, u.message.text);
          } catch (e) { await send(chat, `⚠️ ${(e as Error).message}`).catch(() => {}); }
        }
      } catch { await new Promise((r) => setTimeout(r, 3000)); }
    }
  })();
}
