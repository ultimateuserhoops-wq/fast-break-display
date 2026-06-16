import { useEffect, useState } from "react";

/** OBS pages: black background, no scrollbars, polls 100ms for clock animation. */
export function ObsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-hidden" style={{ background: "#000", color: "#fff" }}>
      {children}
    </div>
  );
}

export function useTick(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => (n + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);
}
