(function () {
  const KEY = 'short_video_experiment_platform_records';
  const DEFAULT_COLLECTIONS = [
    'participant_sessions',
    'preference_responses',
    'assigned_feeds',
    'feed_summaries',
    'feed_events',
    'completion_records',
    'experiments',
    'experiment_conditions',
    'video_assets',
    'admin_users',
    'audit_logs',
  ];

  const config = window.CLOUDBASE_CONFIG || {};
  const state = {
    mode: 'local',
    app: null,
    auth: null,
    db: null,
    initError: null,
    initPromise: null,
  };

  function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  function readLocalAll() {
    try {
      return JSON.parse(window.localStorage.getItem(KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function writeLocalAll(data) {
    window.localStorage.setItem(KEY, JSON.stringify(data, null, 2));
  }

  function collectionLocal(name) {
    const data = readLocalAll();
    if (!Array.isArray(data[name])) data[name] = [];
    return { data, list: data[name] };
  }

  function stripInternalFields(record) {
    const clone = { ...(record || {}) };
    delete clone._id;
    delete clone._openid;
    delete clone._createTime;
    delete clone._updateTime;
    return clone;
  }

  function normalizeLocalRecord(record, idField) {
    const data = stripInternalFields(record);
    const field = idField || 'id';
    const docId = String(data[field] || data.id || makeId('doc'));
    data[field] = docId;
    if (!data.id) data.id = docId;
    const now = Date.now();
    if (data.createdAt == null) data.createdAt = now;
    data.updatedAt = now;
    return data;
  }

  function upsertLocal(name, record, idField) {
    const { data, list } = collectionLocal(name);
    const field = idField || 'id';
    const next = normalizeLocalRecord(record, field);
    const idx = list.findIndex((item) => item[field] === next[field]);
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
    data[name] = list;
    writeLocalAll(data);
    return next;
  }

  function appendLocal(name, record) {
    const { data, list } = collectionLocal(name);
    const next = normalizeLocalRecord(record, 'id');
    if (!next.id) next.id = makeId(name);
    list.push(next);
    data[name] = list;
    writeLocalAll(data);
    return next;
  }

  function getCloudBase() {
    return window.cloudbase || null;
  }

  function getCollectionNames() {
    return Array.isArray(config.collections) && config.collections.length
      ? config.collections.slice()
      : DEFAULT_COLLECTIONS.slice();
  }

  async function initCloudBase() {
    if (state.initPromise) return state.initPromise;

    state.initPromise = (async () => {
      const cloudbase = getCloudBase();
      if (!cloudbase || !config.env || !config.accessKey) {
        state.mode = 'local';
        return null;
      }

      try {
        const app = cloudbase.init({
          env: config.env,
          region: config.region || 'ap-shanghai',
          accessKey: config.accessKey,
          auth: { detectSessionInUrl: true },
        });
        const auth = typeof app.auth === 'function' ? app.auth() : app.auth;
        const db = typeof app.database === 'function' ? app.database() : app.database;
        if (!auth || typeof auth.signInAnonymously !== 'function') {
          throw new Error('CloudBase auth interface unavailable');
        }
        if (config.anonymousLogin !== false) {
          const result = await auth.signInAnonymously();
          if (result && result.error) throw result.error;
        }
        state.app = app;
        state.auth = auth;
        state.db = db;
        state.mode = 'cloudbase';
        return state.db;
      } catch (error) {
        state.initError = error;
        state.app = null;
        state.auth = null;
        state.db = null;
        state.mode = 'local';
        return null;
      }
    })();

    return state.initPromise;
  }

  async function getDb() {
    if (state.db) return state.db;
    await initCloudBase();
    return state.db;
  }

  async function readRemoteCollection(name) {
    const db = await getDb();
    if (!db) return null;

    const rows = [];
    const pageSize = 100;
    let skip = 0;

    try {
      while (true) {
        const result = await db.collection(name)
          .orderBy('updatedAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();
        const batch = Array.isArray(result && result.data) ? result.data : [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
        if (skip >= 5000) break;
      }
      return rows;
    } catch (error) {
      return null;
    }
  }

  async function readAll() {
    const output = {};
    const names = getCollectionNames();

    await initCloudBase();

    const entries = await Promise.all(names.map(async (name) => {
      const remote = await readRemoteCollection(name);
      if (remote) return [name, remote];
      const local = collectionLocal(name).list.slice();
      return [name, local];
    }));

    entries.forEach(([name, list]) => {
      output[name] = list;
    });

    return output;
  }

  async function getRemoteDoc(name, docId) {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.collection(name).doc(docId).get();
      const rows = Array.isArray(result && result.data) ? result.data : [];
      return rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  function normalizeRemoteRecord(record, idField, existing) {
    const input = stripInternalFields(record);
    const field = idField || 'id';
    const docId = String(input[field] || input.id || makeId('doc'));
    const now = Date.now();
    const cleanExisting = stripInternalFields(existing || {});
    const merged = {
      ...cleanExisting,
      ...input,
      [field]: docId,
    };
    if (!merged.id) merged.id = docId;
    if (merged.createdAt == null) merged.createdAt = cleanExisting.createdAt || now;
    merged.updatedAt = now;
    return merged;
  }

  async function upsert(name, record, idField) {
    const field = idField || 'id';
    const input = stripInternalFields(record || {});
    const docId = String(input[field] || input.id || makeId(name));
    input[field] = docId;
    if (!input.id) input.id = docId;

    const existing = await getRemoteDoc(name, docId);
    const next = normalizeRemoteRecord(input, field, existing);

    const db = await getDb();
    if (!db) return upsertLocal(name, next, field);

    try {
      await db.collection(name).doc(docId).set(next);
      return next;
    } catch (error) {
      return upsertLocal(name, next, field);
    }
  }

  async function append(name, record) {
    const input = stripInternalFields(record || {});
    const docId = String(input.id || makeId(name));
    input.id = docId;
    const now = Date.now();
    if (input.createdAt == null) input.createdAt = now;
    input.updatedAt = now;

    const db = await getDb();
    if (!db) return appendLocal(name, input);

    try {
      await db.collection(name).doc(docId).set(input);
      return input;
    } catch (error) {
      return appendLocal(name, input);
    }
  }

  async function clearRemote() {
    const db = await getDb();
    if (!db) return false;

    const names = getCollectionNames();
    await Promise.all(names.map(async (name) => {
      const rows = await readRemoteCollection(name);
      if (!rows || !rows.length) return;
      await Promise.all(rows.map(async (row) => {
        const docId = row.id || row._id;
        if (!docId) return;
        try {
          await db.collection(name).doc(docId).remove();
        } catch (error) {
          return null;
        }
      }));
    }));
    return true;
  }

  async function clear() {
    const db = await getDb();
    if (!db) {
      window.localStorage.removeItem(KEY);
      return;
    }

    try {
      await clearRemote();
      window.localStorage.removeItem(KEY);
    } catch (error) {
      window.localStorage.removeItem(KEY);
    }
  }

  function normalizeCsvValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  function csvEscape(value) {
    const text = normalizeCsvValue(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function sessionKeyOf(record) {
    return String(record?.sessionId || record?.session_id || record?.id || '');
  }

  function buildRecordMap(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const key = sessionKeyOf(item);
      if (key) map.set(key, item);
    });
    return map;
  }

  function pushUnique(list, seen, value) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    list.push(value);
  }

  async function exportJson() {
    return JSON.stringify(await readAll(), null, 2);
  }

  async function exportCsv() {
    const records = await readAll();
    const sessionMap = buildRecordMap(records.participant_sessions);
    const preferenceMap = buildRecordMap(records.preference_responses);
    const assignedMap = buildRecordMap(records.assigned_feeds);
    const summaryMap = buildRecordMap(records.feed_summaries);
    const completionMap = buildRecordMap(records.completion_records);
    const eventMap = buildRecordMap(records.feed_events);

    const orderedIds = [];
    const seenIds = new Set();
    [
      records.participant_sessions,
      records.preference_responses,
      records.assigned_feeds,
      records.feed_summaries,
      records.completion_records,
      records.feed_events,
    ].forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((item) => pushUnique(orderedIds, seenIds, sessionKeyOf(item)));
    });

    const columns = [
      'participantName',
      'sessionId',
      'source',
      'study',
      'condition',
      'entryUrl',
      'returnUrl',
      'status',
      'startedAt',
      'preQuestionnaireSubmittedAt',
      'feedStartedAt',
      'completedAt',
      'selectedCategories',
      'selectedCategoryLabels',
      'minSelected',
      'maxSelected',
      'preferenceMatchRatio',
      'videoSequence',
      'videos_viewed',
      'total_feed_ms',
      'total_dwell_ms',
      'swipe_next_count',
      'swipe_prev_count',
      'speed_2x_count',
      'speed_2x_total_ms',
      'action_tap_count',
      'like_count',
      'favorite_count',
      'follow_count',
      'sound_unmuted',
      'exit_prompt_count',
      'exit_cancel_count',
      'first_exit_attempt_ms',
      'exit_decision_latency_ms',
      'watch_ms_after_first_exit_attempt',
      'dwell_ms_per_slide',
      'event_count',
      'completed',
      'completionCode',
      'redirectedAt',
      'createdAt',
      'updatedAt',
    ];

    const rows = [columns.join(',')];
    orderedIds.forEach((sessionId) => {
      const session = sessionMap.get(sessionId) || {};
      const preference = preferenceMap.get(sessionId) || {};
      const assigned = assignedMap.get(sessionId) || {};
      const summary = summaryMap.get(sessionId) || {};
      const completion = completionMap.get(sessionId) || {};
      const feedEvents = eventMap.get(sessionId) || {};

      const row = {
        participantName: session.participantName || preference.participantName || summary.participantName || completion.participantName || assigned.participantName || '',
        sessionId,
        source: session.source || '',
        study: session.study || preference.study || summary.study || completion.study || assigned.study || '',
        condition: session.condition || preference.condition || summary.condition || completion.condition || assigned.condition || '',
        entryUrl: session.entryUrl || '',
        returnUrl: completion.returnUrl || session.returnUrl || preference.returnUrl || assigned.returnUrl || '',
        status: session.status || '',
        startedAt: session.startedAt || '',
        preQuestionnaireSubmittedAt: session.preQuestionnaireSubmittedAt || '',
        feedStartedAt: session.feedStartedAt || '',
        completedAt: session.completedAt || '',
        selectedCategories: preference.selectedCategories || session.selectedCategories || '',
        selectedCategoryLabels: preference.selectedCategoryLabels || '',
        minSelected: preference.minSelected ?? '',
        maxSelected: preference.maxSelected ?? '',
        preferenceMatchRatio: assigned.preferenceMatchRatio ?? '',
        videoSequence: assigned.videoSequence || '',
        videos_viewed: summary.videos_viewed ?? '',
        total_feed_ms: summary.total_feed_ms ?? '',
        total_dwell_ms: summary.total_dwell_ms ?? '',
        swipe_next_count: summary.swipe_next_count ?? '',
        swipe_prev_count: summary.swipe_prev_count ?? '',
        speed_2x_count: summary.speed_2x_count ?? '',
        speed_2x_total_ms: summary.speed_2x_total_ms ?? '',
        action_tap_count: summary.action_tap_count ?? '',
        like_count: summary.like_count ?? '',
        favorite_count: summary.favorite_count ?? '',
        follow_count: summary.follow_count ?? '',
        sound_unmuted: summary.sound_unmuted ?? '',
        exit_prompt_count: summary.exit_prompt_count ?? '',
        exit_cancel_count: summary.exit_cancel_count ?? '',
        first_exit_attempt_ms: summary.first_exit_attempt_ms ?? '',
        exit_decision_latency_ms: summary.exit_decision_latency_ms ?? '',
        watch_ms_after_first_exit_attempt: summary.watch_ms_after_first_exit_attempt ?? '',
        dwell_ms_per_slide: summary.dwell_ms_per_slide ?? '',
        event_count: summary.event_count ?? (Array.isArray(feedEvents.events) ? feedEvents.events.length : ''),
        completed: completion.completed ?? '',
        completionCode: completion.completionCode || session.completionCode || '',
        redirectedAt: completion.redirectedAt ?? '',
        createdAt: session.createdAt || preference.createdAt || assigned.createdAt || summary.createdAt || completion.createdAt || '',
        updatedAt: session.updatedAt || preference.updatedAt || assigned.updatedAt || summary.updatedAt || completion.updatedAt || '',
      };

      rows.push(columns.map((column) => csvEscape(row[column])).join(','));
    });

    return rows.join('\n');
  }

  window.ExperimentStore = {
    key: KEY,
    mode: 'local',
    getMode() {
      return state.mode;
    },
    get initError() {
      return state.initError;
    },
    whenReady: initCloudBase(),
    readAll,
    upsert,
    append,
    makeId,
    exportJson,
    exportCsv,
    clear,
  };
})();
