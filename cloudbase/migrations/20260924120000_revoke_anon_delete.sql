-- Removes DELETE from anon on the participant-data tables.
--
-- The publishable key in src/config/cloudbase.js is visible to anyone who opens the
-- site, and the repository is public, so the anon role should be assumed compromised.
-- Participants only ever insert and update their own session rows; the one code path
-- that deletes is the admin dashboard's "clear records" button, which now runs under an
-- authenticated session and is unaffected.
--
-- SELECT is deliberately left in place: store.js upsert() reads a row by id before
-- deciding between insert and update, and tracking participants resume their 10-day
-- progress by looking themselves up by name + tracking code. Closing that hole needs
-- upsert() reworked onto INSERT ... ON CONFLICT first.
--
-- Already applied to video-d3g9diest3dcce7b7 via:
--   tcb db execute -e <envId> --sql "$(cat <this file>)"

REVOKE DELETE ON public.participant_sessions FROM anon;
REVOKE DELETE ON public.preference_responses FROM anon;
REVOKE DELETE ON public.assigned_feeds FROM anon;
REVOKE DELETE ON public.feed_summaries FROM anon;
REVOKE DELETE ON public.feed_events FROM anon;
REVOKE DELETE ON public.feed_exit_decisions FROM anon;
REVOKE DELETE ON public.completion_records FROM anon;
REVOKE DELETE ON public.audit_logs FROM anon;
REVOKE DELETE ON public.tracking_participants FROM anon;
REVOKE DELETE ON public.tracking_runs FROM anon;
REVOKE DELETE ON public.tracking_questionnaires FROM anon;
REVOKE DELETE ON public.tracking_followups FROM anon;
