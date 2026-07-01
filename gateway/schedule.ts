// The auto-scheduler now lives in src/lib so the browser can run it too (no gateway
// round-trip needed). Re-export it here so gateway/server.ts keeps working unchanged.
export * from "../src/lib/schedule";
