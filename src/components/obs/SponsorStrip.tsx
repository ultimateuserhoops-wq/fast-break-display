import { useEffect, useState } from "react";
import { useSponsorLogos } from "@/lib/ads";

/** Bottom sponsor-logo slideshow shown under the arena displays. Renders nothing
 *  until at least one sponsor logo has been uploaded. */
export function SponsorStrip({ height = 96 }: { height?: number }) {
  const logos = useSponsorLogos();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (logos.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % logos.length), 4000);
    return () => clearInterval(id);
  }, [logos.length]);

  if (logos.length === 0) return null;
  const url = logos[i % logos.length];

  return (
    <div className="mt-2 flex w-full items-center justify-center gap-10 overflow-hidden rounded-xl bg-white px-8" style={{ height }}>
      <span className="text-lg font-black uppercase tracking-[0.25em] text-zinc-400">Sponsored by</span>
      <img key={url} src={url} alt="sponsor" className="max-h-[70%] max-w-[45%] object-contain transition-opacity duration-500" />
    </div>
  );
}
