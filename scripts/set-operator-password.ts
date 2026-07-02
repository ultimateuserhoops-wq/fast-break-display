// Rotate the shared operator account's password. Signs in with the CURRENT password
// (SCOREBOARD_OPERATOR_PASSWORD in .env) then updates it to the value passed on the
// command line — never hard-code the new password here (this repo is public on GitHub).
//
//   bun run scripts/set-operator-password.ts "the-new-password"
//
// Afterwards update SCOREBOARD_OPERATOR_PASSWORD in .env to match (local scripts use it),
// and tell the crew — every device signs in with the same password.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = process.env.SCOREBOARD_OPERATOR_EMAIL || "operator@bdcvietnam.app";
const oldPass = process.env.SCOREBOARD_OPERATOR_PASSWORD || "";
const NEW_PASSWORD = process.argv[2] || "";

if (!url || !anon) throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in env");
if (!oldPass) throw new Error("Missing SCOREBOARD_OPERATOR_PASSWORD in .env (the current password)");
if (NEW_PASSWORD.length < 8) throw new Error('Pass the new password as an argument (min 8 chars): bun run scripts/set-operator-password.ts "new-password"');
const sb = createClient(url, anon);

const { error: e1 } = await sb.auth.signInWithPassword({ email, password: oldPass });
if (e1) throw new Error(`Sign-in with current password failed: ${e1.message}`);
const { error: e2 } = await sb.auth.updateUser({ password: NEW_PASSWORD });
if (e2) throw new Error(`Password update failed: ${e2.message}`);
console.log(`Operator password for ${email} rotated. Update SCOREBOARD_OPERATOR_PASSWORD in .env and inform the crew.`);
