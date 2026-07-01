# Local Gateway — LAN-speed clock & score

When you run on local Wi-Fi, route the clock/score through this gateway instead of the
cloud. Updates relay between the control panel and the OBS displays in **~0.2–5 ms**
instead of ~500 ms through Supabase realtime — the timer stops instantly and the score
is in sync immediately, with no jump-back.

## Run it

On the operator's laptop (or any machine on the venue Wi-Fi), from the project root:

```bash
bun run gateway
```

It prints a LAN URL, e.g.:

```
open on LAN : http://10.173.189.107:8787/scoreboard/main
```

## Use it

Open that **http://<lan-ip>:8787/…** URL (NOT the cloud workers.dev URL) on every device:

- **Control laptop:** `http://<lan-ip>:8787/scoreboard/main`
- **OBS browser sources:** `http://<lan-ip>:8787/obs/timer/main`, `/obs/display1/main`, `/obs/display2/main`

That's it. The app auto-detects it's on the gateway and switches to the LAN transport;
the little ~0.6 s display delay automatically shrinks to ~80 ms. Open the cloud URL
instead and everything falls back to Supabase exactly as before.

## How it works

- Serves the deployed app over **http** on the LAN (proxies Cloudflare), so browsers can
  open a same-origin `ws://` (an `https://` page can't connect to a `ws://` LAN address).
- A WebSocket hub at `/__gateway` relays every state change to all screens instantly.
- Serves `/api/time` from this machine, so all LAN devices share one clock (no drift).
- Loads current state from Supabase on boot (public read) for screens that join mid-game.

It's a **pure relay** — no credentials. Persistence stays on the authenticated control
panel, which writes `game_state` to Supabase in the background (history, cloud displays,
and restart-recovery keep working). If the venue is fully offline, the LAN relay still
runs; only persistence pauses until you're back online.

## AI footage analysis (Gemini)

Turn a game video into detailed per-player stats (shot chart + play-by-play), matched
to your roster by jersey number, and cross-checked against the scoreboard's score.

**Setup** — add your Google Gemini key to the project `.env` (the gateway auto-loads it):

```
GEMINI_API_KEY=your_google_ai_studio_key
# optional — alert the admin on Telegram when the AI score ≠ the scoreboard:
HERMES_TELEGRAM_TOKEN=123456:abc...
HERMES_ADMIN_CHAT_ID=987654321
```

Then restart the gateway:

```
launchctl kickstart -k gui/$(id -u)/com.bdc.scoreboard-gateway
```

Check it's picked up: `curl http://<host>:8787/__gateway/health` → `"gemini":true`.

**Use it** — open **Quick Links → Footage & AI Stats** (via the gateway URL), paste the
YouTube/recording link, **Analyze (preview)** to see the draft + score check, then
**Commit to stats** to populate the shot chart / play-by-play / box score. The scoreboard
score stays authoritative; the AI fills the detail layer, and a mismatch pings the admin.

For long games, tick **Analyze quarter-by-quarter** — hit **✨ Auto-detect quarters** (a
cheap low-FPS pre-pass reads the on-screen game clock and fills Q1–Q4 start/end for you),
review/adjust, then Analyze. (Or enter total length → **Split into 4** → trim manually.) Each
quarter is analyzed in its own denser pass (2 FPS) in parallel and the correct quarter is
forced onto its events — much more accurate than one pass over the whole video.

Notes: public YouTube/video URLs only · runs on the gateway (no Worker time limit, key
stays local) · committing replaces the previous AI-sourced events (idempotent re-runs).

## Options (env vars)

- `GATEWAY_PORT` — listen port (default `8787`)
- `GATEWAY_UPSTREAM` — app origin to proxy (default the deployed workers.dev URL)
- `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash`)
- `HERMES_TELEGRAM_TOKEN`, `HERMES_ADMIN_CHAT_ID` — score-mismatch alert
- `GATEWAY_OPERATOR_EMAIL` / `GATEWAY_OPERATOR_PASSWORD` — to write game_events (default operator)

Health check: `curl http://<lan-ip>:8787/__gateway/health`
