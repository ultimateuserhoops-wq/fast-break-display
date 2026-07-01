import { useEffect, useRef, useState } from "react";
import { useAdSignal } from "@/lib/ads";

/** Full-screen ad video overlay for the arena/OBS displays. Plays when the
 *  control panel triggers "Play", hides on "Stop" or when the clip ends. */
export function AdOverlay({ courtId }: { courtId: string }) {
  const sig = useAdSignal(courtId);
  const [clip, setClip] = useState<{ url: string; ts: number } | null>(null);

  useEffect(() => {
    if (!sig) return;
    if (sig.action === "play" && sig.url) {
      setClip((c) => (c && c.ts === sig.ts ? c : { url: sig.url!, ts: sig.ts }));
    } else if (sig.action === "stop") {
      setClip(null);
    }
  }, [sig]);

  const ref = useRef<HTMLVideoElement>(null);
  if (!clip) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <video
        key={clip.ts}
        ref={ref}
        src={clip.url}
        autoPlay
        playsInline
        className="h-full w-full object-contain"
        onCanPlay={() => {
          const v = ref.current;
          if (v) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
        }}
        onEnded={() => setClip(null)}
      />
    </div>
  );
}
