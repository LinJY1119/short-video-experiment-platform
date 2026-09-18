-- Condition manipulation and prompt-schedule fields for feed_summaries.
-- Separates the nominal design level (e.g. 100% saturation control) from the
-- visual treatment that was actually rendered, and records the prompt schedule
-- so the shared baseline conditions can be verified per session.

ALTER TABLE public.feed_summaries
  ADD COLUMN IF NOT EXISTS nominal_saturation_percent integer,
  ADD COLUMN IF NOT EXISTS nominal_apply_at_sec integer,
  ADD COLUMN IF NOT EXISTS visual_treatment_applied integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visual_applied_at_ms bigint,
  ADD COLUMN IF NOT EXISTS exit_feedback_mode text,
  ADD COLUMN IF NOT EXISTS continue_mode text,
  ADD COLUMN IF NOT EXISTS exit_mode text,
  ADD COLUMN IF NOT EXISTS first_prompt_sec integer,
  ADD COLUMN IF NOT EXISTS final_duration_sec integer,
  ADD COLUMN IF NOT EXISTS blocked_exit_attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_feed_summaries_exit_feedback_mode
  ON public.feed_summaries (exit_feedback_mode);

CREATE INDEX IF NOT EXISTS idx_feed_summaries_continue_mode
  ON public.feed_summaries (continue_mode);

CREATE INDEX IF NOT EXISTS idx_feed_summaries_nominal_saturation_percent
  ON public.feed_summaries (nominal_saturation_percent);
