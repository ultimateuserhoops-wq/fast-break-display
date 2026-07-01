import { useNavigate } from "@tanstack/react-router";
import { patchGameState } from "@/lib/game-state";

// Ref-friendly launch screen: one section per court (we normally use Court 1 & 2) with big cards
// for the functions an official actually opens — each with a mini preview so it's recognised at a
// glance, no reading. Everything else stays on the normal Hub below.
const COURTS = [
  { id: "main", label: "Court 1", accent: "#2563eb" },
  { id: "court2", label: "Court 2", accent: "#dc2626" },
];

function openDisplayWindow(path: string, key: string) {
  if (typeof window === "undefined") return;
  // ?local=1 → syncs instantly from a control on this device (BroadcastChannel) with 0 clock delay,
  // and shows an always-visible Fullscreen button. Drag it to the TV and press Fullscreen.
  window.open(`${window.location.origin}${path}?local=1`, `bdc_${key}`, "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
}

function CourtSection({ courtId, label, accent }: { courtId: string; label: string; accent: string }) {
  const navigate = useNavigate();
  const openControl = async (mode: "full" | "3x3") => {
    await patchGameState(courtId, { mode }).catch(() => { /* not signed in yet — the route guard prompts login */ });
    navigate({ to: "/scoreboard/$courtId", params: { courtId } });
  };
  const openArena = async () => {
    await patchGameState(courtId, { display_style_1: "arena" }).catch(() => {});
    openDisplayWindow(`/obs/display1/${courtId}`, `arena_${courtId}`);
  };

  const cards = [
    { title: "Full 5×5", sub: "Full-court control panel", preview: <FullPreview tag="5×5" />, onClick: () => openControl("full") },
    { title: "Full 3×3", sub: "3×3 control panel", preview: <FullPreview tag="3×3" />, onClick: () => openControl("3x3") },
    { title: "Arena Display", sub: "Big scoreboard for the TV", preview: <ArenaPreview />, onClick: openArena },
    { title: "Shot-Clock Controller", sub: "Run just the 24s", preview: <ShotCtrlPreview />, onClick: () => navigate({ to: "/shotclock/$courtId", params: { courtId } }) },
    { title: "Shot-Clock Display", sub: "24s screen for the TV", preview: <ShotDispPreview />, onClick: () => openDisplayWindow(`/obs/timer/${courtId}`, `shot_${courtId}`) },
  ];

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg text-xs font-black text-white" style={{ background: accent }}>{label.slice(-1)}</span>
        <h2 className="text-lg font-black tracking-tight">{label}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.title}
            onClick={c.onClick}
            className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg"
          >
            <div className="h-28 w-full border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>{c.preview}</div>
            <div className="p-4">
              <h3 className="text-base font-black leading-tight">{c.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
              <p className="mt-3 text-xs font-bold text-foreground/60 group-hover:text-foreground">Open →</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function RefLaunch() {
  return (
    <div className="space-y-8">
      {COURTS.map((c) => <CourtSection key={c.id} courtId={c.id} label={c.label} accent={c.accent} />)}
    </div>
  );
}

/* ---------- mini previews (rendered mock-ups, so they always match the current design) ---------- */

function FullPreview({ tag }: { tag: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center gap-2 bg-gradient-to-br from-[#0b1020] to-black">
      <span className="absolute left-2 top-2 rounded bg-white/12 px-1.5 py-0.5 text-[9px] font-black text-white/80">{tag}</span>
      <span className="clock-digits text-3xl font-black text-white">88</span>
      <span className="clock-digits text-lg font-black" style={{ color: "var(--amber-clock)" }}>10:00</span>
      <span className="clock-digits text-3xl font-black text-white">72</span>
    </div>
  );
}

function ArenaPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-1.5 bg-black">
      <span className="grid h-7 w-7 place-items-center rounded-full text-[9px] font-black text-white" style={{ border: "2px solid #2563eb" }}>H</span>
      <span className="grid h-12 w-11 place-items-center rounded-lg bg-white"><span className="clock-digits text-2xl font-black text-black">88</span></span>
      <span className="clock-digits text-base font-black" style={{ color: "var(--red-shot)" }}>24</span>
      <span className="grid h-12 w-11 place-items-center rounded-lg bg-white"><span className="clock-digits text-2xl font-black text-black">72</span></span>
      <span className="grid h-7 w-7 place-items-center rounded-full text-[9px] font-black text-white" style={{ border: "2px solid #dc2626" }}>A</span>
    </div>
  );
}

function ShotCtrlPreview() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#0b1020]">
      <span className="clock-digits text-4xl font-black" style={{ color: "var(--red-shot)" }}>24</span>
      <div className="flex gap-1">
        {["24", "14", "＋", "－"].map((x) => <span key={x} className="rounded bg-white/12 px-1.5 py-0.5 text-[9px] font-black text-white/80">{x}</span>)}
      </div>
    </div>
  );
}

function ShotDispPreview() {
  return (
    <div className="grid h-full w-full place-items-center bg-black">
      <span className="clock-digits text-5xl font-black" style={{ color: "var(--red-shot)", textShadow: "0 0 20px rgba(255,60,60,0.5)" }}>24</span>
    </div>
  );
}
