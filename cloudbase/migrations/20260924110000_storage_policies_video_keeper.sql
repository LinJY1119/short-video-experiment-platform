-- Storage RLS for the video-keeper bucket.
--
-- The bucket ships with a single SELECT policy scoped to `owner_id = auth.jwt()->>'sub'`,
-- which blocks browser uploads outright and would also hide each uploader's files from
-- the reviewer. Uploading happens from upload.html behind an admin login, so the right
-- boundary is "any authenticated session may read and write this bucket".
--
-- Participants do not rely on these policies: the bucket is public=true, so playback
-- goes through the public-read endpoint without a session.
--
-- Already applied to video-d3g9diest3dcce7b7 via:
--   tcb db execute -e <envId> --sql "$(cat <this file>)"

DROP POLICY IF EXISTS allow_public_read_ ON storage.objects;
DROP POLICY IF EXISTS allow_public_read_ ON storage.buckets;

DROP POLICY IF EXISTS video_keeper_bucket_read ON storage.buckets;
CREATE POLICY video_keeper_bucket_read ON storage.buckets
  FOR SELECT TO authenticated
  USING (id = 'video-keeper');

DROP POLICY IF EXISTS video_keeper_read ON storage.objects;
CREATE POLICY video_keeper_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'video-keeper');

DROP POLICY IF EXISTS video_keeper_insert ON storage.objects;
CREATE POLICY video_keeper_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'video-keeper');

DROP POLICY IF EXISTS video_keeper_update ON storage.objects;
CREATE POLICY video_keeper_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'video-keeper')
  WITH CHECK (bucket_id = 'video-keeper');

DROP POLICY IF EXISTS video_keeper_delete ON storage.objects;
CREATE POLICY video_keeper_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'video-keeper');
