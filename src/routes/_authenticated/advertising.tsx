import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/Nav";
import { listSponsorLogos, uploadSponsorLogo, deleteSponsorLogo, getSponsorConfig, setSponsorConfig, orderLogos, uploadCourtImage, getCourtImageUrl, listAdVideos, uploadAdVideo, deleteAdVideo, playAd, stopAd, type AdVideo } from "@/lib/ads";
import { COURT_IDS } from "@/lib/game-state";
import { toast } from "sonner";
import { Trash2, Upload, Play, Square, ChevronUp, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/advertising")({
  head: () => ({ meta: [{ title: "Advertising — BDC" }] }),
  component: AdvertisingPage,
});

function AdvertisingPage() {
  const [logos, setLogos] = useState<string[]>([]);   // already in priority order
  const [limit, setLimit] = useState(0);              // 0 = show all
  const [busy, setBusy] = useState(false);
  const [court, setCourt] = useState<string | null>(null);
  const [courtBusy, setCourtBusy] = useState(false);

  const load = async () => {
    try {
      const [list, cfg] = await Promise.all([listSponsorLogos(), getSponsorConfig()]);
      setLogos(orderLogos(list, cfg.order));
      setLimit(cfg.limit || 0);
    } catch { /* ignore */ }
  };
  const loadCourt = () => getCourtImageUrl().then(setCourt).catch(() => {});
  useEffect(() => { load(); loadCourt(); }, []);

  // Persist a new order/limit, and optimistically reflect it.
  async function saveConfig(order: string[], lim: number) {
    setLogos(order); setLimit(lim);
    try { await setSponsorConfig({ order, limit: lim }); } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  }
  function move(url: string, dir: -1 | 1) {
    const i = logos.indexOf(url); const j = i + dir;
    if (i < 0 || j < 0 || j >= logos.length) return;
    const next = [...logos]; [next[i], next[j]] = [next[j], next[i]];
    saveConfig(next, limit);
  }

  async function onCourtUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setCourtBusy(true);
    try { await uploadCourtImage(files[0]); toast.success("Court image updated"); loadCourt(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setCourtBusy(false); }
  }

  const [vids, setVids] = useState<AdVideo[]>([]);
  const [vidBusy, setVidBusy] = useState(false);
  const [adCourt, setAdCourt] = useState<string>("main");
  const loadVids = () => listAdVideos().then(setVids).catch(() => {});
  useEffect(() => { loadVids(); }, []);

  async function onVideoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setVidBusy(true);
    try { for (const f of Array.from(files)) await uploadAdVideo(f); toast.success("Ad video uploaded"); loadVids(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setVidBusy(false); }
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadSponsorLogo(f);
      toast.success("Sponsor logo(s) uploaded");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  async function onDelete(url: string) {
    try { await deleteSponsorLogo(url); await setSponsorConfig({ order: logos.filter((u) => u !== url), limit }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-3xl font-black tracking-tight">Advertising</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sponsor logos run as a slideshow in the strip under every arena display (Katigo / ARENA1 / NCAA1) during the game.
        </p>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-wider">Sponsor logos ({logos.length})</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                Max shown
                <input type="number" min={0} max={logos.length} value={limit} onChange={(e) => saveConfig(logos, Math.max(0, Math.min(logos.length, Number(e.target.value) || 0)))} className="w-16 rounded-md border bg-background px-2 py-1.5 text-foreground" title="0 = show all" />
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background">
                <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload logos"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
              </label>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Order = rotation priority (top first). {limit > 0 ? `Only the first ${limit} are shown on displays.` : "All logos are shown."} Use ▲▼ to reorder.</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {logos.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No sponsor logos yet. Upload PNG/JPG logos to start the slideshow.</p>}
            {logos.map((url, i) => {
              const beyond = limit > 0 && i >= limit;
              return (
                <div key={url} className={`group relative rounded-xl border bg-white p-3 ${beyond ? "opacity-40" : ""}`}>
                  <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-foreground text-[11px] font-black text-background">{i + 1}</span>
                  <img src={url} alt="sponsor" className="h-24 w-full object-contain" />
                  <div className="absolute bottom-2 left-2 hidden gap-1 group-hover:flex">
                    <button onClick={() => move(url, -1)} disabled={i === 0} className="rounded-md border bg-white p-1 text-foreground shadow disabled:opacity-30" title="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(url, 1)} disabled={i === logos.length - 1} className="rounded-md border bg-white p-1 text-foreground shadow disabled:opacity-30" title="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <button onClick={() => onDelete(url)} className="absolute right-2 top-2 hidden rounded-md border border-destructive/40 bg-white p-1.5 text-destructive shadow group-hover:block" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider">Stat-keeper court image</h2>
              <p className="mt-1 text-xs text-muted-foreground">The half-court background used on the Player Stat Keeping shot chart. Upload a top-down half-court (square-ish, basket at top).</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background">
              <Upload className="h-4 w-4" /> {courtBusy ? "Uploading…" : "Upload court"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onCourtUpload(e.target.files)} />
            </label>
          </div>
          <div className="mt-4">
            {court
              ? <img src={court} alt="court" className="mx-auto max-h-72 rounded-lg border object-contain" />
              : <p className="text-sm text-muted-foreground">No court image uploaded — the stat keeper shows a default drawn court.</p>}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider">Ad videos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Preset clips you can play full-screen on an arena display during game or rest.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background">
              <Upload className="h-4 w-4" /> {vidBusy ? "Uploading…" : "Upload video"}
              <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => onVideoUpload(e.target.files)} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Play on</span>
            <select value={adCourt} onChange={(e) => setAdCourt(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-xs font-semibold capitalize">
              {COURT_IDS.map((c) => <option key={c} value={c}>{c === "main" ? "Main Court" : c.replace("court", "Court ")}</option>)}
            </select>
            <button onClick={() => { stopAd(adCourt); toast("Ad stopped", { duration: 1000 }); }} className="ml-auto flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold hover:bg-secondary">
              <Square className="h-3.5 w-3.5" /> Stop ad
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {vids.length === 0 && <p className="text-sm text-muted-foreground">No ad videos yet. Upload MP4/WebM clips.</p>}
            {vids.map((v) => (
              <div key={v.url} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <video src={v.url} className="h-12 w-20 rounded object-cover" muted />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{v.name}</span>
                <button onClick={() => { playAd(adCourt, v.url); toast.success("Playing ad", { duration: 1000 }); }} className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500">
                  <Play className="h-3.5 w-3.5" /> Play
                </button>
                <button onClick={() => deleteAdVideo(v.url).then(loadVids)} className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">The selected court's arena/scoreboard displays (Display 1, Display 2, Timer) will play the clip full-screen, then return to the live display when it ends or you hit Stop.</p>
        </div>
      </main>
    </div>
  );
}
