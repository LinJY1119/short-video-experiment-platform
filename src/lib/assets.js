(function () {
  // Loads experiment stimuli from the video_assets table and reshapes them into the
  // object form the recommendation engine and runner already expect, so neither needs
  // to know whether an asset came from the database or from the static fallback in
  // src/config/videos.js.
  //
  // Deliberately does not go through window.ExperimentStore. That module's readAll()
  // pulls every participant-data table at once; adding a few hundred stimulus rows to
  // it would slow down the entry page for no benefit.

  const POOL_COLUMN = {
    core: 'in_core_pool',
    tracking: 'in_tracking_pool',
  };

  // Studies 1A/1B/2A/2B share the curated pool; study 3 draws from the growing one.
  const STUDY_POOL = {
    '1a': 'core',
    '1b': 'core',
    '2a': 'core',
    '2b': 'core',
    3: 'tracking',
  };

  const state = {
    cache: new Map(),
    lastError: null,
    lastSource: null,
  };

  function poolForStudy(study) {
    return STUDY_POOL[String(study).toLowerCase()] || 'core';
  }

  function publicUrl(bucket, key) {
    const config = window.CLOUDBASE_CONFIG || {};
    const env = config.env || '';
    return `https://${env}.api.tcloudbasegateway.com`
      + `/v1/storages/object/public/${bucket}/${key}`;
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value.slice();
    if (value == null || value === '') return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch (error) {
        return [value];
      }
    }
    return [value];
  }

  function numberOr(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  // Maps a database row onto the shape used throughout the front end. Keeping the same
  // field names means recommendation.js and runner.js work unchanged.
  function fromRow(row) {
    const bucket = row.storage_bucket || 'video-keeper';
    return {
      id: String(row.id || ''),
      sample_id: String(row.sample_id || row.id || ''),
      source_platform: row.source_platform || 'upload',
      uploader_name: row.uploader_name || '',
      primary_category: row.primary_category || 'uncategorized',
      secondary_tags: normalizeList(row.secondary_tags),
      content_type: row.primary_category || '',
      caption: row.caption || '',
      hashtags: normalizeList(row.hashtags),
      music: row.music || '',
      duration_sec: numberOr(row.duration_sec, 0),
      resolution: row.resolution || '',
      like_count: numberOr(row.like_count, 0),
      view_count: numberOr(row.view_count, 0),
      comment_count: numberOr(row.comment_count, 0),
      favorite_count: numberOr(row.favorite_count, 0),
      share_count: numberOr(row.share_count, 0),
      // Prefer an explicit URL when one was stored; otherwise derive it from the key so
      // the public-read host stays in one place.
      video: row.video_url || publicUrl(bucket, row.video_key),
      cover: row.cover_url || (row.cover_key ? publicUrl(bucket, row.cover_key) : ''),
      palette: row.palette || '',
      enabled: row.enabled !== false,
    };
  }

  // Identifies a pool by its exact composition rather than by a maintained counter.
  // Two participants share a fingerprint if and only if they drew from the same set of
  // assets, which is the question between-subject analysis actually needs to answer —
  // and it costs no writes when an asset is enabled or disabled.
  function fingerprint(sampleIds) {
    const joined = sampleIds.slice().sort().join('|');
    let hash = 2166136261;
    for (let i = 0; i < joined.length; i += 1) {
      hash ^= joined.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  async function getDb() {
    await window.ExperimentStore.whenReady;
    const app = window.ExperimentStore.getCloudBaseApp?.();
    if (!app) return null;
    return typeof app.rdb === 'function' ? app.rdb() : app.rdb;
  }

  function staticFallback() {
    return (window.VIDEO_ASSETS || []).filter((item) => item.enabled !== false);
  }

  /**
   * Returns { assets, poolTag, poolVersion, source }.
   *
   * source is 'cloudbase' or 'static'. Falling back to the bundled array keeps the
   * experiment runnable if the database is briefly unavailable, which matters more here
   * than serving the freshest pool.
   */
  async function load(options = {}) {
    const poolTag = options.poolTag || poolForStudy(options.study);
    const column = POOL_COLUMN[poolTag];
    if (!column) throw new Error(`Unknown pool: ${poolTag}`);

    if (!options.force && state.cache.has(poolTag)) {
      return state.cache.get(poolTag);
    }

    let result;
    try {
      const db = await getDb();
      if (!db) throw new Error('CloudBase unavailable');

      const response = await db.from('video_assets')
        .select('*')
        .eq(column, true)
        .eq('status', 'active')
        .eq('enabled', true);
      if (response?.error) throw response.error;

      const rows = Array.isArray(response?.data) ? response.data : [];
      if (!rows.length) throw new Error(`Pool "${poolTag}" returned no assets`);

      const assets = rows.map(fromRow).filter((item) => item.video);
      result = {
        assets,
        poolTag,
        // Size + fingerprint together identify which version of the pool produced a
        // participant's sequence, without needing a counter column kept in sync.
        poolVersion: fingerprint(assets.map((item) => item.sample_id)),
        poolSize: assets.length,
        source: 'cloudbase',
      };
      state.lastError = null;
    } catch (error) {
      state.lastError = String(error?.message || error);
      const assets = staticFallback();
      result = {
        assets,
        poolTag,
        poolVersion: 0,
        poolSize: assets.length,
        source: 'static',
      };
    }

    state.lastSource = result.source;
    state.cache.set(poolTag, result);
    return result;
  }

  window.VideoAssets = {
    load,
    poolForStudy,
    fromRow,
    publicUrl,
    get lastError() {
      return state.lastError;
    },
    get lastSource() {
      return state.lastSource;
    },
    clearCache() {
      state.cache.clear();
    },
  };
})();
