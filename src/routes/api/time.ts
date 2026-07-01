import { createFileRoute } from "@tanstack/react-router";

// Shared wall-clock reference for every screen. The control panel and each OBS
// display extrapolate the running clock from an absolute anchor; if two devices'
// system clocks differ (e.g. an un-synced OBS PC), they'd disagree on the time.
// All screens calibrate to THIS endpoint (the Cloudflare edge clock) so they share
// one "now". Must never be cached.
export const Route = createFileRoute("/api/time")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { t: Date.now() },
          { headers: { "cache-control": "no-store, no-cache, must-revalidate" } },
        ),
    },
  },
});
