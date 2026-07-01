// One-off: set the shared operator account's password. Signs in with the CURRENT password
// (from the gateway .env) then updates it. Run: bun run scripts/set-operator-password.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = process.env.SCOREBOARD_OPERATOR_EMAIL || "operator@bdcvietnam.app";
const oldPass = process.env.SCOREBOARD_OPERATOR_PASSWORD || "Admin123";
const NEW_PASSWORD = "admin123";

if (!url || !anon) throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in env");
const sb = createClient(url, anon);

const { error: e1 } = await sb.auth.signInWithPassword({ email, password: oldPass });
if (e1) throw new Error(`Sign-in with current password failed: ${e1.message}`);
const { error: e2 } = await sb.auth.updateUser({ password: NEW_PASSWORD });
if (e2) throw new Error(`Password update failed: ${e2.message}`);
console.log(`Operator password for ${email} set to "${NEW_PASSWORD}"`);
