// One-off: assign the BDC club logo (downloaded from the shared Drive folder) to every BDC-named
// team + SPHINX. Uses the same "team-logos" bucket / filename convention as the in-app team editor
// (src/routes/_authenticated/teams.index.tsx uploadFile helper).
//
// Run from the project root: `bun run scripts/assign-bdc-logo.ts` (loads .env).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const LOGO_PATH = "/tmp/bdc_logo_raw.png";
const TARGET_TEAMS = ["BDC 1", "BDC 2", "BDC ELITE 1", "BDC ELITE 2", "SPHINX"];

async function main() {
  const email = process.env.SCOREBOARD_OPERATOR_EMAIL || "";
  const password = process.env.SCOREBOARD_OPERATOR_PASSWORD || "";
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) throw authErr;

  const file = Bun.file(LOGO_PATH);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `${Date.now()}-LOGO_BDC.png`;
  const { error: upErr } = await sb.storage.from("team-logos").upload(path, bytes, { upsert: true, contentType: "image/png" });
  if (upErr) throw upErr;
  const publicUrl = sb.storage.from("team-logos").getPublicUrl(path).data.publicUrl;
  console.log("Uploaded:", publicUrl);

  const { data: teams, error } = await sb.from("teams").select("id,name").in("name", TARGET_TEAMS);
  if (error) throw error;

  for (const name of TARGET_TEAMS) {
    const team = teams.find((t) => t.name === name);
    if (!team) { console.log(`${name.padEnd(14)} | NOT FOUND in teams table`); continue; }
    const { error: updErr } = await sb.from("teams").update({ logo_url: publicUrl }).eq("id", team.id);
    console.log(`${name.padEnd(14)} | ${updErr ? "FAILED: " + updErr.message : "OK"}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
