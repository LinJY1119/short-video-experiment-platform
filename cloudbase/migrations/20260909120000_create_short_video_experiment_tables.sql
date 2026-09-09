CREATE TABLE IF NOT EXISTS public.participant_sessions (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  participant_name text,
  source text,
  study text,
  condition text,
  entry_url text,
  return_url text,
  status text,
  started_at bigint,
  pre_questionnaire_submitted_at bigint,
  feed_started_at bigint,
  completed_at bigint,
  user_agent text,
  screen jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  completion_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.preference_responses (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  participant_name text,
  study text,
  condition text,
  selected_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_category_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_selected integer,
  max_selected integer,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assigned_feeds (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  participant_name text,
  study text,
  condition text,
  selected_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_sequence jsonb NOT NULL DEFAULT '[]'::jsonb,
  preference_match_ratio numeric(6,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feed_summaries (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  participant_name text,
  return_url text,
  study text,
  condition text,
  exit_method text,
  time_cap_choice text,
  start_epoch_ms bigint,
  exit_epoch_ms bigint,
  videos_viewed integer,
  last_index integer,
  total_feed_ms bigint,
  total_dwell_ms bigint,
  swipe_next_count integer,
  swipe_prev_count integer,
  speed_2x_count integer,
  speed_2x_total_ms bigint,
  action_tap_count integer,
  like_count integer,
  favorite_count integer,
  follow_count integer,
  sound_unmuted integer,
  exit_prompt_count integer,
  exit_cancel_count integer,
  first_exit_attempt_ms bigint,
  exit_decision_latency_ms bigint,
  watch_ms_after_first_exit_attempt bigint,
  dwell_ms_per_slide text,
  event_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feed_events (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  participant_name text,
  return_url text,
  study text,
  condition text,
  chunk_index integer,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.completion_records (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  participant_name text,
  study text,
  condition text,
  completed boolean NOT NULL DEFAULT false,
  completion_code text,
  return_url text,
  redirected_at bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  session_id text,
  study text,
  condition text,
  type text,
  message text,
  mode text,
  source text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participant_sessions_session_id ON public.participant_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_study ON public.participant_sessions (study);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_condition ON public.participant_sessions (condition);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_created_at ON public.participant_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_updated_at ON public.participant_sessions (updated_at);
CREATE INDEX IF NOT EXISTS idx_preference_responses_session_id ON public.preference_responses (session_id);
CREATE INDEX IF NOT EXISTS idx_preference_responses_study ON public.preference_responses (study);
CREATE INDEX IF NOT EXISTS idx_preference_responses_condition ON public.preference_responses (condition);
CREATE INDEX IF NOT EXISTS idx_preference_responses_created_at ON public.preference_responses (created_at);
CREATE INDEX IF NOT EXISTS idx_preference_responses_updated_at ON public.preference_responses (updated_at);
CREATE INDEX IF NOT EXISTS idx_assigned_feeds_session_id ON public.assigned_feeds (session_id);
CREATE INDEX IF NOT EXISTS idx_assigned_feeds_study ON public.assigned_feeds (study);
CREATE INDEX IF NOT EXISTS idx_assigned_feeds_condition ON public.assigned_feeds (condition);
CREATE INDEX IF NOT EXISTS idx_assigned_feeds_created_at ON public.assigned_feeds (created_at);
CREATE INDEX IF NOT EXISTS idx_assigned_feeds_updated_at ON public.assigned_feeds (updated_at);
CREATE INDEX IF NOT EXISTS idx_feed_summaries_session_id ON public.feed_summaries (session_id);
CREATE INDEX IF NOT EXISTS idx_feed_summaries_study ON public.feed_summaries (study);
CREATE INDEX IF NOT EXISTS idx_feed_summaries_condition ON public.feed_summaries (condition);
CREATE INDEX IF NOT EXISTS idx_feed_summaries_created_at ON public.feed_summaries (created_at);
CREATE INDEX IF NOT EXISTS idx_feed_summaries_updated_at ON public.feed_summaries (updated_at);
CREATE INDEX IF NOT EXISTS idx_feed_events_session_id ON public.feed_events (session_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_study ON public.feed_events (study);
CREATE INDEX IF NOT EXISTS idx_feed_events_condition ON public.feed_events (condition);
CREATE INDEX IF NOT EXISTS idx_feed_events_created_at ON public.feed_events (created_at);
CREATE INDEX IF NOT EXISTS idx_feed_events_updated_at ON public.feed_events (updated_at);
CREATE INDEX IF NOT EXISTS idx_completion_records_session_id ON public.completion_records (session_id);
CREATE INDEX IF NOT EXISTS idx_completion_records_study ON public.completion_records (study);
CREATE INDEX IF NOT EXISTS idx_completion_records_condition ON public.completion_records (condition);
CREATE INDEX IF NOT EXISTS idx_completion_records_created_at ON public.completion_records (created_at);
CREATE INDEX IF NOT EXISTS idx_completion_records_updated_at ON public.completion_records (updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON public.audit_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_study ON public.audit_logs (study);
CREATE INDEX IF NOT EXISTS idx_audit_logs_condition ON public.audit_logs (condition);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_updated_at ON public.audit_logs (updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON public.audit_logs (type);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participant_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preference_responses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assigned_feeds TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_summaries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.completion_records TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.participant_sessions TO service_role;
GRANT ALL PRIVILEGES ON public.preference_responses TO service_role;
GRANT ALL PRIVILEGES ON public.assigned_feeds TO service_role;
GRANT ALL PRIVILEGES ON public.feed_summaries TO service_role;
GRANT ALL PRIVILEGES ON public.feed_events TO service_role;
GRANT ALL PRIVILEGES ON public.completion_records TO service_role;
GRANT ALL PRIVILEGES ON public.audit_logs TO service_role;

ALTER TABLE public.participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assigned_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participant_sessions_all ON public.participant_sessions;
CREATE POLICY participant_sessions_all ON public.participant_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS preference_responses_all ON public.preference_responses;
CREATE POLICY preference_responses_all ON public.preference_responses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS assigned_feeds_all ON public.assigned_feeds;
CREATE POLICY assigned_feeds_all ON public.assigned_feeds FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS feed_summaries_all ON public.feed_summaries;
CREATE POLICY feed_summaries_all ON public.feed_summaries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS feed_events_all ON public.feed_events;
CREATE POLICY feed_events_all ON public.feed_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS completion_records_all ON public.completion_records;
CREATE POLICY completion_records_all ON public.completion_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS audit_logs_all ON public.audit_logs;
CREATE POLICY audit_logs_all ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
