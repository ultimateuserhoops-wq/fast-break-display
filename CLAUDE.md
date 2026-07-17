# CLAUDE.md — fast-break-display

## 1. Project overview
Multi-court basketball scoreboard + OBS broadcast control, used live at BDC Vietnam tournaments.
Operators run score/clock/fouls from a control panel (keyboard/macropad friendly); public `obs.*`
routes render broadcast displays. One shared game state per court syncs to every screen in real time.

## 2. Stack
- **Framework:** TanStack Start `^1.167` (React `^19.2`, TanStack Router `^1.168`, Router plugin), Nitro `3.0.260603-beta`.
- **Build/runtime:** Vite `^8`, TypeScript `^5.8`, **Bun** (scripts run via `bun run`); Tailwind `^4.2`, Radix UI, lucide-react, sonner, zod, react-hook-form, recharts.
- **DB/backend:** Supabase (`@supabase/supabase-js ^2.108`) — Postgres + Realtime + Storage + Auth. Project ref `jofwcwubasnatdbltanj`.
- **Hosting:** Cloudflare Workers (`wrangler.jsonc`, `main: dist/server/server.js`, `compatibility_date 2025-04-01`, `nodejs_compat`). Live at `fast-break-display.nguyentmktdn.workers.dev`.
- **Optional:** local Bun "LAN gateway" (`gateway/`) for instant on-network sync + a Telegram bot.

## 3. Commands (all verified in package.json)
- Dev: `bun run dev` (Vite)
- Build: `bun run build` (also `build:dev` for dev-mode build; `preview` to serve the build)
- Lint: `bun run lint` (ESLint) · Format: `bun run format` (Prettier)
- LAN gateway: `bun run gateway` (runs `gateway/server.ts`)
- Deploy: `npx wrangler deploy` after `bun run build` (wrangler is invoked via npx — NOT a listed dependency/script)
- **Tests: none** — no test script or framework in package.json.

## 4. Architecture
- `src/routes/` — file-based routes. `obs.display1/display2/timer.$courtId.tsx` = public broadcast displays;
  `_authenticated/*` = operator pages (scoreboard, timekeeper, shotclock, teams, tournaments, games, stats, audit…);
  `auth.tsx` login; `api/time.ts` server time. `routeTree.gen.ts` is generated.
- `src/lib/game-state.ts` — the core. `useGameState(courtId)` merges initial fetch + Supabase realtime
  (`postgres_changes` filtered `court_id=eq.<court>`) + LAN gateway + broadcast-bus + BroadcastChannel + optimistic emit.
  `patchGameState(courtId, patch)` fans a change out to all transports, then persists to Supabase.
- `src/lib/hotkeys.ts` — shared operator hotkey engine used by BOTH the scoreboard and timekeeper pages.
- `src/lib/{ads,possession,obs-toggles,audit}.ts` — per-court state that has no DB column, stored as JSON files
  in the `team-photos` Storage bucket and polled by hooks (the "storage-JSON side channel" pattern).
- `src/integrations/supabase/` — `client.ts` (anon, browser+SSR), `client.server.ts` (service-role, server-only), `types.ts`.
- `gateway/` — standalone Bun app (WebSocket relay + Telegram bot + Gemini schedule advisor); runs on an operator machine, not on Workers.
- `scripts/` — one-off Bun maintenance scripts (seed tournaments, assign logos, rotate operator password).

## 5. Conventions (observed in the code)
- **Dynamic route param `$courtId`**; `_authenticated/route.tsx` guards operator routes via `supabase.auth.getUser()` → redirect `/auth`.
- **Single shared operator account** (email `operator@bdcvietnam.app`); everyone signs in with one password.
- **Per-device settings** live in localStorage keyed `bdc_<feature>_<courtId>` (e.g. `bdc_splitclock_`, `bdc_shotlock_`, `bdc_hideshot_`, `bdc_ctrlstyle_`, `bdc_hotkeys`).
- **Cross-device state without a DB column** → storage-JSON side channel: JSON file per court + polling hook + in-tab pub/sub + a `lastSetTs` stale-write guard (see `possession.ts`, `obs-toggles.ts`, `audit.ts`).
- **Env access:** `.server.ts` files are never bundled to the client; read `process.env` INSIDE a function (Workers bind env per-request). `VITE_`-prefixed vars are public. See `src/lib/config.server.ts` header comment.
- **Deploy cadence used all session:** `bun run build && npx wrangler deploy`, then commit + push.

## 6. Constraints
- **Supabase:** project `jofwcwubasnatdbltanj`. <!-- TODO: confirm region is Singapore — not stated anywhere in the code. -->
- **Webhooks/hosting:** the app deploys as a Cloudflare Worker. The Telegram bot in `gateway/` uses **long-polling**, not a Worker webhook (`gateway/telegram.ts`).
- **AI calls:** the Worker and browser make **no** direct AI calls. AI features (Gemini for footage analysis + schedule advice; Anthropic for Telegram tips) exist **only in the local `gateway/` Bun process**, which currently calls `api.anthropic.com` and `generativelanguage.googleapis.com` **directly** with keys from its own env.
  <!-- TODO: The stated workspace rule "AI calls MUST go through the Kie.ai proxy (Anthropic/Google blocked by ISP)" is NOT reflected in this repo — no Kie.ai usage exists, and the gateway calls providers directly. Confirm whether that rule applies here (the gateway runs on a local machine, so the Workers/APAC ISP block may not bite) or whether these calls should move to Kie.ai. -->

## 7. Landmines
- **Generated — never hand-edit:** `src/integrations/supabase/client.ts` & `types.ts` ("automatically generated. Do not edit"), and `src/routeTree.gen.ts` (regenerated by the router plugin on build).
- **`game_state` is not migratable with the operator/anon key.** New per-court features can't add columns — hence the storage-JSON side channels. Don't assume you can `ALTER` game tables from the app.
- **Open RLS:** `game_state` (and peers) use `FOR ALL TO authenticated USING (true)` — any signed-in operator can write any court. Shared login = no real per-user identity; `audit.ts` stamps an operator name as a soft audit trail. Treat RLS as NOT a security boundary. <!-- TODO: confirm you want this documented as-is. -->
- **Optimistic writes + realtime lag:** `patchGameState` updates locally first; `protectedMerge` keeps just-written fields for ~2s. A direct DB write (script/eval) can lag the page's local `s` by the realtime round-trip (~0.6s) → transient stale reads that are NOT bugs.
- **OBS displays render on a fixed 1920×1080 stage scaled with CSS `zoom` (`ObsShell`).** Size display elements in fixed `rem`/`px`, never `vh`/`vw`.
- **Clocks are extrapolated from an absolute `started_at` anchor** shared across devices (`serverNow()`); cross-device system-clock skew shows up as disagreeing clocks.
- **Hotkeys:** `HOTKEYS_VER` in `hotkeys.ts` intentionally discards pre-macropad saved maps; team fouls hard-cap at 5; split-clock mode hijacks Space/A. Changing defaults here affects both scoreboard and timekeeper.

## 8. Do not
- Do NOT hand-edit generated files (`client.ts`, `types.ts`, `routeTree.gen.ts`).
- Do NOT commit `.env` or `.dev.vars` (gitignored). **This GitHub repo is public** — never hard-code the operator password or any secret in source (rotate via `scripts/set-operator-password.ts`, which takes the new password as an arg).
- Do NOT expose the service-role key to the client — it lives only in `client.server.ts` / `.server.ts` files.
- Do NOT edit the production Supabase schema directly or assume app-key migrations work; use the storage-JSON side-channel pattern for column-less state.
- Do NOT call Anthropic/Gemini from the Worker or browser — AI belongs in the local `gateway/`. <!-- TODO: confirm the Kie.ai-proxy requirement above. -->
- Do NOT use `vh`/`vw` for OBS display sizing.
