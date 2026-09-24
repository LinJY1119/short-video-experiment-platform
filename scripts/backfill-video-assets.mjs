#!/usr/bin/env node
/**
 * Backfills the existing 100 assets from src/config/videos.js into the video_assets
 * table, so the dynamic loader has something to read before the upload page exists.
 *
 * Only writes rows. Storage objects are left exactly where they are: the originals live
 * under stimuli/video/ and stimuli/cover/, and video_key records that full path, so the
 * new stimuli/<pool>/<category>/ layout used by uploads can coexist with them.
 *
 * Emits SQL rather than calling the SDK, so it can be piped through the CLI without
 * needing account credentials:
 *
 *   node scripts/backfill-video-assets.mjs --dry-run          # summary only
 *   node scripts/backfill-video-assets.mjs --sql > out.sql    # inspect first
 *   tcb db execute -e <envId> --sql "$(node scripts/backfill-video-assets.mjs --sql)"
 *
 * Re-runnable: rows use ON CONFLICT DO NOTHING.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

const EMIT_SQL = process.argv.includes('--sql');
const BATCH_ID = 'batch_legacy_seed';

// videos.js is a browser IIFE that assigns to window and reads window.location.
function loadStaticAssets() {
  globalThis.window = { location: { search: '', hostname: 'localhost' } };
  require(path.join(projectRoot, 'src/config/videos.js'));
  const assets = globalThis.window.VIDEO_ASSETS;
  if (!Array.isArray(assets) || !assets.length) {
    throw new Error('window.VIDEO_ASSETS is empty — did src/config/videos.js change shape?');
  }
  return assets;
}

// The static array stores fully-resolved URLs; the table stores object keys so the
// public-read host can change without rewriting every row.
function keyFromUrl(url, kind) {
  const match = String(url || '').match(new RegExp(`${kind}/([^/?#]+)$`));
  if (!match) throw new Error(`Could not derive ${kind} key from ${url}`);
  return `stimuli/${kind}/${match[1]}`;
}

function quote(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonQuote(value) {
  return `'${JSON.stringify(value ?? []).replace(/'/g, "''")}'::jsonb`;
}

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? String(next) : 'NULL';
}

function toValuesRow(asset) {
  return `(${[
    quote(asset.id),
    quote(BATCH_ID),
    quote(asset.sample_id),
    quote('video-keeper'),
    quote(keyFromUrl(asset.video, 'video')),
    quote(keyFromUrl(asset.cover, 'cover')),
    // The legacy set seeds both pools: studies 1/2 use it as-is, and study 3 starts from
    // it rather than from an empty pool.
    'true',
    'true',
    quote(asset.primary_category),
    jsonQuote(asset.secondary_tags),
    quote(asset.caption),
    quote(asset.uploader_name),
    quote(asset.music),
    jsonQuote(asset.hashtags),
    quote(asset.palette),
    numberOrNull(asset.like_count) === 'NULL' ? '0' : numberOrNull(asset.like_count),
    numberOrNull(asset.view_count) === 'NULL' ? '0' : numberOrNull(asset.view_count),
    numberOrNull(asset.comment_count) === 'NULL' ? '0' : numberOrNull(asset.comment_count),
    numberOrNull(asset.favorite_count) === 'NULL' ? '0' : numberOrNull(asset.favorite_count),
    numberOrNull(asset.share_count) === 'NULL' ? '0' : numberOrNull(asset.share_count),
    numberOrNull(asset.duration_sec),
    quote(asset.resolution || asset.source_resolution),
    quote(asset.enabled === false ? 'disabled' : 'active'),
    asset.enabled === false ? 'false' : 'true',
    quote('Backfilled from src/config/videos.js'),
    quote('backfill-script'),
    'now()',
  ].join(', ')})`;
}

function buildSql(assets) {
  const batch = `INSERT INTO public.video_upload_batches
  (id, pool_tag, status, asset_count, uploaded_by, note, published_at)
VALUES
  (${quote(BATCH_ID)}, 'legacy', 'published', ${assets.length}, 'backfill-script',
   'Original 100 assets migrated out of src/config/videos.js', now())
ON CONFLICT (id) DO UPDATE SET asset_count = EXCLUDED.asset_count;`;

  const rows = `INSERT INTO public.video_assets
  (id, batch_id, sample_id, storage_bucket, video_key, cover_key,
   in_core_pool, in_tracking_pool, primary_category, secondary_tags,
   caption, uploader_name, music, hashtags, palette,
   like_count, view_count, comment_count, favorite_count, share_count,
   duration_sec, resolution, status, enabled, review_note, uploaded_by, published_at)
VALUES
${assets.map(toValuesRow).join(',\n')}
ON CONFLICT (id) DO NOTHING;`;

  return `${batch}\n\n${rows}`;
}

function summarize(assets) {
  const byCategory = assets.reduce((acc, asset) => {
    acc[asset.primary_category] = (acc[asset.primary_category] || 0) + 1;
    return acc;
  }, {});
  return { total: assets.length, byCategory };
}

function main() {
  const assets = loadStaticAssets();

  if (EMIT_SQL) {
    process.stdout.write(buildSql(assets));
    return;
  }

  const summary = summarize(assets);
  console.log(`Prepared ${summary.total} rows`);
  for (const [category, count] of Object.entries(summary.byCategory).sort()) {
    console.log(`  ${category}: ${count}`);
  }
  console.log('\nRun with --sql to emit the INSERT statements, e.g.');
  console.log('  tcb db execute -e <envId> --sql "$(node scripts/backfill-video-assets.mjs --sql)"');
}

main();
