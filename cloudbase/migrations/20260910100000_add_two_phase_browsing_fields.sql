-- Two-phase browsing fields for studies 1A, 1B and 2A.
-- Run this migration after the original experiment tables have been created.

ALTER TABLE public.feed_summaries
  ADD COLUMN IF NOT EXISTS first_phase_choice text,
  ADD COLUMN IF NOT EXISTS second_phase_choice text,
  ADD COLUMN IF NOT EXISTS final_exit_phase text,
  ADD COLUMN IF NOT EXISTS first_phase_prompt_at_ms bigint,
  ADD COLUMN IF NOT EXISTS second_phase_started_at_ms bigint,
  ADD COLUMN IF NOT EXISTS second_phase_prompt_at_ms bigint,
  ADD COLUMN IF NOT EXISTS questionnaire_reminder_shown_at_ms bigint,
  ADD COLUMN IF NOT EXISTS questionnaire_returned_at_ms bigint,
  ADD COLUMN IF NOT EXISTS first_phase_watch_ms bigint,
  ADD COLUMN IF NOT EXISTS second_phase_watch_ms bigint,
  ADD COLUMN IF NOT EXISTS questionnaire_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questionnaire_return_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS second_phase_manual_exit_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_feed_summaries_final_exit_phase
  ON public.feed_summaries (final_exit_phase);

CREATE INDEX IF NOT EXISTS idx_feed_summaries_first_phase_choice
  ON public.feed_summaries (first_phase_choice);

CREATE INDEX IF NOT EXISTS idx_feed_summaries_second_phase_choice
  ON public.feed_summaries (second_phase_choice);

-- One row per exit prompt/decision. This preserves the first choice and any
-- later manual or time-cap decision without overwriting either one.
CREATE TABLE IF NOT EXISTS public.feed_exit_decisions (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  participant_name text,
  study text,
  condition text,
  prompt_index integer NOT NULL,
  phase text NOT NULL,
  reason text NOT NULL,
  opened_at_ms bigint NOT NULL,
  opened_epoch_ms bigint NOT NULL,
  choice text,
  decided_at_ms bigint,
  decided_epoch_ms bigint,
  decision_latency_ms bigint,
  questionnaire_reminder_shown boolean NOT NULL DEFAULT false,
  questionnaire_returned boolean NOT NULL DEFAULT false,
  questionnaire_returned_at_ms bigint,
  questionnaire_returned_epoch_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_exit_decisions_session_id
  ON public.feed_exit_decisions (session_id);

CREATE INDEX IF NOT EXISTS idx_feed_exit_decisions_study_condition
  ON public.feed_exit_decisions (study, condition);

CREATE INDEX IF NOT EXISTS idx_feed_exit_decisions_phase
  ON public.feed_exit_decisions (phase);

CREATE INDEX IF NOT EXISTS idx_feed_exit_decisions_choice
  ON public.feed_exit_decisions (choice);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_exit_decisions TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.feed_exit_decisions TO service_role;

ALTER TABLE public.feed_exit_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feed_exit_decisions_all ON public.feed_exit_decisions;
CREATE POLICY feed_exit_decisions_all ON public.feed_exit_decisions
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
