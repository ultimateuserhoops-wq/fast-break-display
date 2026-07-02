// One-off cleanup: strip any recorded match `result` + live bindings from "BDSEA 2026"
// (used to remove the 4S'/KIMBAN test result). Run: bun run scripts/clear-test-result.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = process.env.SCOREBOARD_OPERATOR_EMAIL || "operator@bdcvietnam.app";
const pass = process.env.SCOREBOARD_OPERATOR_PASSWORD || ""; // no hard-coded fallback — repo is public
const NAME = "BDSEA 2026";

const sb = createClient(url, anon);
const { error: e1 } = await sb.auth.signInWithPassword({ email, password: pass });
if (e1) throw new Error("sign-in: " + e1.message);

const { data: rows } = await sb.from("tournaments").select("id,data").eq("name", NAME).limit(1);
const row = rows?.[0] as { id: string; data: any } | undefined;
if (!row) throw new Error("tournament not found");
let cleared = 0;
for (const dv of row.data.divisions || []) for (const r of dv.rounds || []) for (const m of r.matches || []) { if (m.result) { delete m.result; cleared++; } }
row.data.liveByCourt = {};
const { error: e2 } = await sb.from("tournaments").update({ data: row.data }).eq("id", row.id);
if (e2) throw new Error("update: " + e2.message);
console.log(`Cleared ${cleared} result(s) + live bindings from ${NAME}`);
