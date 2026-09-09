ALTER TABLE public.feed_summaries
  ADD COLUMN IF NOT EXISTS exit_epoch_ms bigint;
