import { createFileRoute, Link } from "@tanstack/react-router";
import { TopNav } from "@/components/Nav";
import { Activity, ClipboardList, Users, Trophy, BookUser, Tv } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Basketball Scoreboard System — BDC VIETNAM" },
      { name: "description", content: "Multi-court scoreboard, broadcast control, and team management. A property of BDC VIETNAM." },
    ],
  }),
  component: HubPage,
});

function HubPage() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">A property of BDC VIETNAM</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">THE BASKETBALL SCOREBOARD SYSTEM</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Run six independent courts at once. Score, fouls, timeouts, game clock and shot clock are persisted in the cloud and stream live to every broadcast display in real time.
          </p>
        </section>

        <RowSection title="GAME MANAGEMENT">
          <HubCard to="/scoreboard" icon={<Activity className="h-5 w-5" />} title="Scoreboard" desc="Pick a court and control the live game state." />
          <HubCard to="/game-log/$courtId" params={{ courtId: "main" }} icon={<ClipboardList className="h-5 w-5" />} title="Game Log" desc="Play-by-play history per court." />
          <HubCard to="/scoreboard" icon={<BookUser className="h-5 w-5" />} title="Player Stats" desc="Box scores derived from play-by-play." />
        </RowSection>

        <RowSection title="TEAM AND TOURNAMENT DATABASE">
          <HubCard to="/teams" icon={<Users className="h-5 w-5" />} title="Team Library" desc="Teams, logos, photos and rosters." />
          <HubCard to="/tournaments" icon={<Trophy className="h-5 w-5" />} title="Tournament Hub" desc="Tournaments, schedules and standings." />
          <HubCard to="/scoreboard" icon={<Tv className="h-5 w-5" />} title="Broadcast Displays" desc="Copy OBS browser-source URLs per court." />
        </RowSection>
      </main>
    </div>
  );
}

function RowSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      <div className="grid gap-4 md:grid-cols-3">{children}</div>
    </section>
  );
}

function HubCard({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border bg-card p-5 transition hover:border-foreground/30 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-foreground">{icon}</div>
        <h3 className="font-bold">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{desc}</p>
      <p className="mt-4 text-xs font-medium text-foreground/70 group-hover:text-foreground">Open →</p>
    </Link>
  );
}
