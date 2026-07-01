// One-off: pull team logos out of the shared Google Drive folder and assign them to teams.logo_url.
//
// Layout on Drive is: <parent folder> / <Team Name folder> / LOGO / <image file>
// (each team folder also has a "HÌNH ẢNH" (photos) subfolder we ignore).
//
// Public Drive folders can be listed without auth via the "embeddedfolderview" endpoint, which
// returns plain HTML (no JS execution needed) with one <div class="flip-entry" id="entry-ID"> per
// child, a title, and an href that's either .../drive/folders/ID (subfolder) or .../file/d/ID/view
// (file). We parse that instead of driving a browser.
//
// Run from the project root: `bun run scripts/assign-team-logos-from-drive.ts` (loads .env).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Storage writes are RLS-gated to authenticated operators (same as the browser app), so sign in
// with the shared operator account before touching storage/teams.
async function signIn() {
  const email = process.env.SCOREBOARD_OPERATOR_EMAIL || "";
  const password = process.env.SCOREBOARD_OPERATOR_PASSWORD || "";
  if (!email || !password) throw new Error("Missing SCOREBOARD_OPERATOR_EMAIL / SCOREBOARD_OPERATOR_PASSWORD in .env");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

const PARENT_FOLDER_ID = "1vAOGyTVsfD_kIHoM2ZZIVp6jJ1o2FoDE";

type Entry = { id: string; title: string; isFolder: boolean };

async function listFolder(folderId: string): Promise<Entry[]> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#grid`);
  const html = await res.text();
  const entries: Entry[] = [];
  // Each entry block: id="entry-ID" ... href="...(/drive/folders/|/file/d/)...(ID2)..." ... flip-entry-title">TITLE<
  const blockRe = /<div class="flip-entry" id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?flip-entry-title">([^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const [, id, href, titleRaw] = m;
    const title = titleRaw.replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
    const isFolder = href.includes("/drive/folders/");
    entries.push({ id, title, isFolder });
  }
  return entries;
}

async function downloadFile(fileId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { redirect: "follow" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) return null; // Drive's virus-scan interstitial for big files, etc.
  return { bytes: await res.arrayBuffer(), contentType };
}

const stripDiacritics = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalize = (s: string) => stripDiacritics(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

const extFromContentType = (ct: string) => (ct.split("/")[1] || "png").replace("jpeg", "jpg").split(";")[0];

async function main() {
  await signIn();
  const { data: teams, error } = await sb.from("teams").select("id,name,logo_url");
  if (error) throw error;
  console.log(`Loaded ${teams.length} teams from the database.\n`);

  const teamFolders = await listFolder(PARENT_FOLDER_ID);
  const subfolders = teamFolders.filter((e) => e.isFolder);
  console.log(`Found ${subfolders.length} team folders on Drive.\n`);

  const results: { drive: string; matchedTeam: string | null; file: string | null; status: string }[] = [];

  for (const folder of subfolders) {
    const driveName = folder.title;
    const norm = normalize(driveName);
    const team = teams.find((t) => normalize(t.name) === norm);

    if (!team) {
      results.push({ drive: driveName, matchedTeam: null, file: null, status: "NO MATCHING TEAM IN DB — skipped" });
      continue;
    }

    // Find the "LOGO" subfolder inside this team's folder.
    const children = await listFolder(folder.id);
    const logoFolder = children.find((c) => c.isFolder && /logo/i.test(c.title));
    if (!logoFolder) {
      results.push({ drive: driveName, matchedTeam: team.name, file: null, status: "NO 'LOGO' SUBFOLDER FOUND — skipped" });
      continue;
    }

    const logoFiles = (await listFolder(logoFolder.id)).filter((f) => !f.isFolder);
    if (logoFiles.length === 0) {
      results.push({ drive: driveName, matchedTeam: team.name, file: null, status: "LOGO FOLDER IS EMPTY — skipped" });
      continue;
    }
    const file = logoFiles[0]; // exactly one logo file per team in every folder we inspected

    const dl = await downloadFile(file.id);
    if (!dl) {
      results.push({ drive: driveName, matchedTeam: team.name, file: file.title, status: "DOWNLOAD FAILED (not a direct image / too large) — skipped" });
      continue;
    }

    const ext = extFromContentType(dl.contentType);
    const path = `team-logos/${team.id}.${ext}`;
    const { error: upErr } = await sb.storage.from("team-photos").upload(path, new Uint8Array(dl.bytes), { upsert: true, contentType: dl.contentType });
    if (upErr) {
      results.push({ drive: driveName, matchedTeam: team.name, file: file.title, status: `UPLOAD FAILED: ${upErr.message}` });
      continue;
    }
    const publicUrl = sb.storage.from("team-photos").getPublicUrl(path).data.publicUrl;
    const { error: updErr } = await sb.from("teams").update({ logo_url: publicUrl }).eq("id", team.id);
    if (updErr) {
      results.push({ drive: driveName, matchedTeam: team.name, file: file.title, status: `DB UPDATE FAILED: ${updErr.message}` });
      continue;
    }
    results.push({ drive: driveName, matchedTeam: team.name, file: file.title, status: `OK -> ${publicUrl}` });
  }

  console.log("=== Results ===");
  for (const r of results) {
    console.log(`${r.drive.padEnd(28)} | team: ${(r.matchedTeam ?? "—").padEnd(24)} | file: ${(r.file ?? "—").padEnd(20)} | ${r.status}`);
  }

  const ok = results.filter((r) => r.status.startsWith("OK")).length;
  console.log(`\n${ok}/${results.length} logos assigned.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
