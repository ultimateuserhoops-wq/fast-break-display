
-- Helper: updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- COURTS
CREATE TABLE public.courts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courts TO authenticated;
GRANT ALL ON public.courts TO service_role;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courts read all" ON public.courts FOR SELECT USING (true);
CREATE POLICY "courts write auth" ON public.courts FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.courts (id, name, color, sort_order) VALUES
  ('main',  'Main Court', '#3b82f6', 1),
  ('court2','Court 2',    '#ef4444', 2),
  ('court3','Court 3',    '#22c55e', 3),
  ('court4','Court 4',    '#f97316', 4),
  ('court5','Court 5',    '#a855f7', 5),
  ('court6','Court 6',    '#06b6d4', 6);

-- TEAMS
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#1e3a8a',
  logo_url TEXT,
  photo_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams read all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams write auth" ON public.teams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PLAYERS
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jersey_number TEXT NOT NULL DEFAULT '',
  position TEXT,
  height TEXT,
  photo_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX players_team_id_idx ON public.players(team_id);
GRANT SELECT ON public.players TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read all" ON public.players FOR SELECT USING (true);
CREATE POLICY "players write auth" ON public.players FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER players_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TOURNAMENTS
CREATE TABLE public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournaments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournaments read all" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments write auth" ON public.tournaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tournament_teams (
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, team_id)
);
GRANT SELECT ON public.tournament_teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_teams TO authenticated;
GRANT ALL ON public.tournament_teams TO service_role;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt read all" ON public.tournament_teams FOR SELECT USING (true);
CREATE POLICY "tt write auth" ON public.tournament_teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- GAME STATE (one row per court)
CREATE TABLE public.game_state (
  court_id TEXT PRIMARY KEY REFERENCES public.courts(id) ON DELETE CASCADE,
  tournament_name TEXT NOT NULL DEFAULT 'BDC VIETNAM TOURNAMENT',
  mode TEXT NOT NULL DEFAULT 'full', -- quick | full | 3x3
  display_style_1 TEXT NOT NULL DEFAULT 'katigo',
  display_style_2 TEXT NOT NULL DEFAULT 'espn1',
  timer_style TEXT NOT NULL DEFAULT 'rectangular',

  home_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  away_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  home_name TEXT NOT NULL DEFAULT 'HOME',
  away_name TEXT NOT NULL DEFAULT 'AWAY',
  home_abbr TEXT NOT NULL DEFAULT 'HOM',
  away_abbr TEXT NOT NULL DEFAULT 'AWY',
  home_color TEXT NOT NULL DEFAULT '#1e40af',
  away_color TEXT NOT NULL DEFAULT '#b91c1c',
  home_logo TEXT,
  away_logo TEXT,

  home_score INT NOT NULL DEFAULT 0,
  away_score INT NOT NULL DEFAULT 0,
  home_fouls INT NOT NULL DEFAULT 0,
  away_fouls INT NOT NULL DEFAULT 0,
  home_timeouts INT NOT NULL DEFAULT 4,
  away_timeouts INT NOT NULL DEFAULT 4,

  quarter INT NOT NULL DEFAULT 1,
  quarter_length_seconds INT NOT NULL DEFAULT 600,

  -- Game clock state
  game_clock_seconds NUMERIC NOT NULL DEFAULT 600, -- remaining
  game_clock_running BOOLEAN NOT NULL DEFAULT false,
  game_clock_started_at TIMESTAMPTZ, -- when last started (null when paused)

  -- Shot clock state (stored in tenths for precision)
  shot_clock_tenths INT NOT NULL DEFAULT 240, -- 24.0s
  shot_clock_running BOOLEAN NOT NULL DEFAULT false,
  shot_clock_started_at TIMESTAMPTZ,

  buzzer_pulse INT NOT NULL DEFAULT 0,

  home_on_court UUID[] NOT NULL DEFAULT '{}',
  away_on_court UUID[] NOT NULL DEFAULT '{}',

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_state TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_state TO authenticated;
GRANT ALL ON public.game_state TO service_role;
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gs read all" ON public.game_state FOR SELECT USING (true);
CREATE POLICY "gs write auth" ON public.game_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER game_state_updated_at BEFORE UPDATE ON public.game_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed game_state rows for all 6 courts
INSERT INTO public.game_state (court_id) SELECT id FROM public.courts;

-- GAME EVENTS (play-by-play)
CREATE TABLE public.game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id TEXT NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  team_side TEXT NOT NULL, -- 'home' | 'away'
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  player_name TEXT,
  player_number TEXT,
  event_type TEXT NOT NULL, -- 2PT_MADE,2PT_MISS,3PT_MADE,3PT_MISS,FT_MADE,FT_MISS,REB,AST,STL,BLK,TO,FOUL,TIMEOUT,SUB_IN,SUB_OUT,ADJUST
  points INT NOT NULL DEFAULT 0,
  quarter INT NOT NULL DEFAULT 1,
  game_clock_seconds NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_events_court_id_idx ON public.game_events(court_id, created_at DESC);
CREATE INDEX game_events_player_id_idx ON public.game_events(player_id);
GRANT SELECT ON public.game_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_events TO authenticated;
GRANT ALL ON public.game_events TO service_role;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ge read all" ON public.game_events FOR SELECT USING (true);
CREATE POLICY "ge write auth" ON public.game_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
ALTER TABLE public.game_state REPLICA IDENTITY FULL;
ALTER TABLE public.game_events REPLICA IDENTITY FULL;
