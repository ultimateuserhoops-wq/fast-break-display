import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Operator login — BDC Scoreboard" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { isAuthed } = useAuthSession();
  const [email, setEmail] = useState("operator@bdcvietnam.app");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthed) navigate({ to: "/", replace: true });
  }, [isAuthed, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed in");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/40 to-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background font-black">B</div>
          <div className="leading-tight">
            <div className="text-sm font-bold">THE BASKETBALL SCOREBOARD SYSTEM</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">A property of BDC VIETNAM</div>
          </div>
        </Link>
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Operator login</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to control scoreboards and clocks. Broadcast/OBS display pages remain public.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-foreground py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
