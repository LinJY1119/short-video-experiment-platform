CREATE TABLE IF NOT EXISTS public.tracking_participants (
  id text PRIMARY KEY,
  participant_name text NOT NULL,
  tracking_code text NOT NULL,
  source text,
  study text NOT NULL,
  condition text NOT NULL,
  start_date date NOT NULL,
  selected_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  final_completion_code text,
  final_completed_at bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_name, tracking_code, study, condition)
);

CREATE TABLE IF NOT EXISTS public.tracking_runs (
  id text PRIMARY KEY,
  participant_id text NOT NULL,
  session_id text NOT NULL UNIQUE,
  participant_name text NOT NULL,
  study text NOT NULL,
  condition text NOT NULL,
  tracking_day integer NOT NULL,
  session_slot text NOT NULL,
  target_date date NOT NULL,
  target_time text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  late_after_slot boolean NOT NULL DEFAULT false,
  started_at bigint,
  completed_at bigint,
  task_completion_code text,
  summary_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, target_date, session_slot)
);

CREATE TABLE IF NOT EXISTS public.tracking_questionnaires (
  id text PRIMARY KEY,
  participant_id text NOT NULL,
  participant_name text NOT NULL,
  study text NOT NULL,
  condition text NOT NULL,
  tracking_day integer NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  questionnaire_version text,
  external_record_id text,
  completed_at bigint,
  registered_at bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, tracking_day)
);

CREATE TABLE IF NOT EXISTS public.tracking_followups (
  id text PRIMARY KEY,
  participant_id text NOT NULL,
  participant_name text NOT NULL,
  study text NOT NULL,
  condition text NOT NULL,
  tracking_day integer,
  target_date date,
  reason text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  contacted_at bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_participants_name ON public.tracking_participants (participant_name);
CREATE INDEX IF NOT EXISTS idx_tracking_participants_study_condition ON public.tracking_participants (study, condition);
CREATE INDEX IF NOT EXISTS idx_tracking_participants_status ON public.tracking_participants (status);
CREATE INDEX IF NOT EXISTS idx_tracking_runs_participant ON public.tracking_runs (participant_id);
CREATE INDEX IF NOT EXISTS idx_tracking_runs_date ON public.tracking_runs (target_date);
CREATE INDEX IF NOT EXISTS idx_tracking_runs_day_slot ON public.tracking_runs (tracking_day, session_slot);
CREATE INDEX IF NOT EXISTS idx_tracking_questionnaires_participant ON public.tracking_questionnaires (participant_id);
CREATE INDEX IF NOT EXISTS idx_tracking_questionnaires_day ON public.tracking_questionnaires (tracking_day);
CREATE INDEX IF NOT EXISTS idx_tracking_followups_participant ON public.tracking_followups (participant_id);
CREATE INDEX IF NOT EXISTS idx_tracking_followups_status ON public.tracking_followups (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_participants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_runs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_questionnaires TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_followups TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.tracking_participants TO service_role;
GRANT ALL PRIVILEGES ON public.tracking_runs TO service_role;
GRANT ALL PRIVILEGES ON public.tracking_questionnaires TO service_role;
GRANT ALL PRIVILEGES ON public.tracking_followups TO service_role;

ALTER TABLE public.tracking_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_participants_all ON public.tracking_participants;
CREATE POLICY tracking_participants_all ON public.tracking_participants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tracking_runs_all ON public.tracking_runs;
CREATE POLICY tracking_runs_all ON public.tracking_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tracking_questionnaires_all ON public.tracking_questionnaires;
CREATE POLICY tracking_questionnaires_all ON public.tracking_questionnaires FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tracking_followups_all ON public.tracking_followups;
CREATE POLICY tracking_followups_all ON public.tracking_followups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
