import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/auth";
import { getOperatorName, setOperatorName } from "@/lib/audit";

export function TopNav() {
  const navigate = useNavigate();
  const { isAuthed } = useAuthSession();
  const [operator, setOperator] = useState(getOperatorName);

  function renameOperator() {
    const next = prompt("Operator name for this device (shown in the change log):", operator);
    if (next && next.trim()) { setOperatorName(next); setOperator(next.trim()); }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background font-black">
            B
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">BDCSCOREBOARD</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              A property of BDC VIETNAM
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/">Hub</NavLink>
          <NavLink to="/scoreboard">Scoreboard</NavLink>
          <NavLink to="/teams">Teams</NavLink>
          <NavLink to="/tournaments">Tournaments</NavLink>
        </nav>
        <div className="flex items-center gap-3 text-xs">
          {isAuthed ? (
            <>
              <button
                onClick={renameOperator}
                title="Operator name for this device — click to change. Every score/clock change is logged under this name."
                className="hidden rounded-md border px-2.5 py-1.5 font-medium text-muted-foreground hover:bg-secondary sm:inline"
              >
                {operator || "Set operator name"}
              </button>
              <button
                onClick={handleSignOut}
                className="rounded-md border px-3 py-1.5 font-medium hover:bg-secondary"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/auth" className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background">
              Operator login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      activeProps={{ className: "bg-secondary text-foreground" }}
    >
      {children}
    </Link>
  );
}
