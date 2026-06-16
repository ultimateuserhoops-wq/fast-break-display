ALTER TABLE public.game_state
  ADD COLUMN IF NOT EXISTS three_pulse_home integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS three_pulse_away integer NOT NULL DEFAULT 0;