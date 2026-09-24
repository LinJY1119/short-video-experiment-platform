-- Dynamic video asset pools for the short-video experiment platform.
--
-- Replaces the hard-coded window.VIDEO_ASSETS array in src/config/videos.js with a
-- database-backed index. Files still live in CloudBase storage; these tables record
-- where each file is, which pool it belongs to, and whether it has been approved for
-- use in a running experiment.
--
-- Two pools share one table:
--   in_core_pool     -> studies 1A / 1B / 2A / 2B (roughly 20 assets per category)
--   in_tracking_pool -> study 3, grows over time, "least recently seen" rotation
-- The existing 100 assets belong to both, so pool membership is two booleans rather
-- than a single pool_tag column.
--
-- Unlike the participant-data tables, anon is read-only here and can only see assets
-- that have been published. Uploading and approving require an authenticated session.

CREATE TABLE IF NOT EXISTS public.video_upload_batches (
  id text PRIMARY KEY,
  pool_tag text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  asset_count integer NOT NULL DEFAULT 0,
  uploaded_by text,
  note text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.video_assets (
  id text PRIMARY KEY,
  batch_id text,
  sample_id text NOT NULL,
  -- Storage location. video_key is the full object path, so assets uploaded into the
  -- new stimuli/<pool>/<category>/ layout and the original stimuli/video/ files can
  -- coexist without moving anything.
  storage_bucket text NOT NULL DEFAULT 'video-keeper',
  video_key text NOT NULL,
  cover_key text,
  video_url text,
  cover_url text,
  original_filename text,
  -- Pool membership. Two booleans rather than one pool_tag column, because the original
  -- 100 assets seed both pools at once.
  in_core_pool boolean NOT NULL DEFAULT false,
  in_tracking_pool boolean NOT NULL DEFAULT false,
  -- Category and display metadata consumed by src/runner/runner.js.
  primary_category text NOT NULL,
  secondary_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text,
  uploader_name text,
  music text,
  hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
  palette text,
  like_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  favorite_count integer NOT NULL DEFAULT 0,
  share_count integer NOT NULL DEFAULT 0,
  -- Collected in the browser at upload time.
  duration_sec numeric(10,3),
  resolution text,
  file_size_bytes bigint,
  checksum text,
  -- Review state. Assets start as 'reviewing' and are invisible to participants until
  -- an admin publishes them.
  status text NOT NULL DEFAULT 'reviewing',
  enabled boolean NOT NULL DEFAULT false,
  review_note text,
  disabled_reason text,
  uploaded_by text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, video_key)
);

-- Records which pool produced a participant's frozen sequence. pool_version is a
-- fingerprint of the pool's exact membership (see src/lib/assets.js), so two sessions
-- share a value only if they drew from the same set of assets.
ALTER TABLE public.assigned_feeds
  ADD COLUMN IF NOT EXISTS pool_tag text,
  ADD COLUMN IF NOT EXISTS pool_version bigint,
  ADD COLUMN IF NOT EXISTS pool_size integer;

-- Study 3 rotates on "least recently seen", so each participant carries the ordered
-- list of sample_ids they have already been shown (oldest first).
ALTER TABLE public.tracking_participants
  ADD COLUMN IF NOT EXISTS seen_sample_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_video_assets_core_live ON public.video_assets (in_core_pool, status, enabled);
CREATE INDEX IF NOT EXISTS idx_video_assets_tracking_live ON public.video_assets (in_tracking_pool, status, enabled);
CREATE INDEX IF NOT EXISTS idx_video_assets_category ON public.video_assets (primary_category);
CREATE INDEX IF NOT EXISTS idx_video_assets_checksum ON public.video_assets (checksum);
CREATE INDEX IF NOT EXISTS idx_video_assets_batch ON public.video_assets (batch_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_sample_id ON public.video_assets (sample_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_created_at ON public.video_assets (created_at);
CREATE INDEX IF NOT EXISTS idx_video_upload_batches_pool_tag ON public.video_upload_batches (pool_tag);
CREATE INDEX IF NOT EXISTS idx_video_upload_batches_status ON public.video_upload_batches (status);
CREATE INDEX IF NOT EXISTS idx_video_upload_batches_created_at ON public.video_upload_batches (created_at);

-- anon is deliberately SELECT-only: the publishable key in src/config/cloudbase.js is
-- visible to anyone who opens the page, so write access there would be write access for
-- the public internet.
GRANT SELECT ON public.video_assets TO anon;
GRANT SELECT ON public.video_upload_batches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_upload_batches TO authenticated;
GRANT ALL PRIVILEGES ON public.video_assets TO service_role;
GRANT ALL PRIVILEGES ON public.video_upload_batches TO service_role;

ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_upload_batches ENABLE ROW LEVEL SECURITY;

-- Participants only ever see published assets; anything still under review is hidden.
DROP POLICY IF EXISTS video_assets_read_published ON public.video_assets;
CREATE POLICY video_assets_read_published ON public.video_assets
  FOR SELECT TO anon
  USING (status = 'active' AND enabled = true);

DROP POLICY IF EXISTS video_assets_manage ON public.video_assets;
CREATE POLICY video_assets_manage ON public.video_assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS video_upload_batches_read ON public.video_upload_batches;
CREATE POLICY video_upload_batches_read ON public.video_upload_batches
  FOR SELECT TO anon
  USING (status = 'published');

DROP POLICY IF EXISTS video_upload_batches_manage ON public.video_upload_batches;
CREATE POLICY video_upload_batches_manage ON public.video_upload_batches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
