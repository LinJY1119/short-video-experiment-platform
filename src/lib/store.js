(function () {
  const KEY = 'short_video_experiment_platform_records';
  const DATA_TABLES = [
    'participant_sessions',
    'preference_responses',
    'assigned_feeds',
    'feed_summaries',
    'feed_events',
    'completion_records',
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
    lastWriteSource: null,
    lastWriteError: null,
  };

  function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  function isObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (value == null) return value;
    if (!isObject(value) && !Array.isArray(value)) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function stripInternalFields(record) {
    const clone = { ...(record || {}) };
    delete clone._id;
    delete clone._openid;
    delete clone._createTime;
    delete clone._updateTime;
    return clone;
  }

  function compactObject(record) {
    return Object.fromEntries(
      Object.entries(record || {}).filter(([, value]) => value !== undefined)
    );
  }

  function valueOf(record, ...keys) {
    for (const key of keys) {
      if (record && record[key] !== undefined) return record[key];
    }
    return undefined;
  }

  function normalizeTimestamp(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      const dateValue = value.getTime();
      return Number.isFinite(dateValue) ? dateValue : null;
    }
    const textValue = String(value);
    const numericValue = Number(textValue);
    if (/^-?\d+(\.\d+)?$/.test(textValue) && Number.isFinite(numericValue)) return numericValue;
    const parsedValue = Date.parse(textValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  // PostgreSQL timestamptz columns receive ISO 8601 strings. Experiment timing
  // fields remain numeric millisecond values and are not passed through here.
  function normalizePgTimestamp(value) {
    const milliseconds = normalizeTimestamp(value);
    return milliseconds == null ? null : new Date(milliseconds).toISOString();
  }

  function normalizePgTimestampFields(row) {
    const next = { ...(row || {}) };
    ['created_at', 'updated_at', 'submitted_at'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(next, field)) {
        next[field] = normalizePgTimestamp(next[field]);
      }
    });
    return next;
  }

  function normalizeNumber(value) {
    if (value == null || value === '') return null;
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }

  function normalizeBoolean(value) {
    if (value == null || value === '') return false;
    if (typeof value === 'string') return value === 'true' || value === '1';
    return Boolean(value);
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) return value.map((item) => cloneValue(item));
    if (value == null) return [];
    return [cloneValue(value)];
  }

  function normalizeObject(value) {
    if (isObject(value)) return cloneValue(value);
    return {};
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

  function localTableNames() {
    if (!Array.isArray(config.collections) || !config.collections.length) {
      return DATA_TABLES.slice();
    }
    return config.collections.filter((name) => DATA_TABLES.includes(name));
  }

  function getCloudBase() {
    return window.cloudbase || null;
  }

  function pickNewest(existing, next) {
    const existingTime = normalizeTimestamp(valueOf(existing, 'updatedAt', 'updated_at', 'createdAt', 'created_at')) || 0;
    const nextTime = normalizeTimestamp(valueOf(next, 'updatedAt', 'updated_at', 'createdAt', 'created_at')) || 0;
    return nextTime >= existingTime ? next : existing;
  }

  function sessionKeyOf(record) {
    return String(
      valueOf(record, 'sessionId', 'session_id', 'id') || ''
    );
  }

  function buildRecordMap(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const key = sessionKeyOf(item);
      if (!key) return;
      const current = map.get(key);
      if (!current) {
        map.set(key, item);
        return;
      }
      map.set(key, pickNewest(current, item));
    });
    return map;
  }

  function pushUnique(list, seen, value) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    list.push(value);
  }

  function tableHandlerFor(name) {
    switch (name) {
      case 'participant_sessions':
        return {
          prefix: 'sess',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id', 'sessionId', 'session_id') || makeId('sess'));
            return compactObject({
              id,
              session_id: String(valueOf(input, 'sessionId', 'session_id') || id),
              participant_name: valueOf(input, 'participantName', 'participant_name') ?? valueOf(existing || {}, 'participantName', 'participant_name') ?? null,
              source: valueOf(input, 'source') ?? valueOf(existing || {}, 'source') ?? null,
              study: valueOf(input, 'study') ?? valueOf(existing || {}, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? valueOf(existing || {}, 'condition') ?? null,
              entry_url: valueOf(input, 'entryUrl', 'entry_url') ?? valueOf(existing || {}, 'entryUrl', 'entry_url') ?? null,
              return_url: valueOf(input, 'returnUrl', 'return_url') ?? valueOf(existing || {}, 'returnUrl', 'return_url') ?? null,
              status: valueOf(input, 'status') ?? valueOf(existing || {}, 'status') ?? null,
              started_at: normalizeTimestamp(valueOf(input, 'startedAt', 'started_at') ?? valueOf(existing || {}, 'startedAt', 'started_at')),
              pre_questionnaire_submitted_at: normalizeTimestamp(valueOf(input, 'preQuestionnaireSubmittedAt', 'pre_questionnaire_submitted_at') ?? valueOf(existing || {}, 'preQuestionnaireSubmittedAt', 'pre_questionnaire_submitted_at')),
              feed_started_at: normalizeTimestamp(valueOf(input, 'feedStartedAt', 'feed_started_at') ?? valueOf(existing || {}, 'feedStartedAt', 'feed_started_at')),
              completed_at: normalizeTimestamp(valueOf(input, 'completedAt', 'completed_at') ?? valueOf(existing || {}, 'completedAt', 'completed_at')),
              user_agent: valueOf(input, 'userAgent', 'user_agent') ?? valueOf(existing || {}, 'userAgent', 'user_agent') ?? null,
              screen: normalizeObject(valueOf(input, 'screen') ?? valueOf(existing || {}, 'screen')),
              selected_categories: normalizeArray(valueOf(input, 'selectedCategories', 'selected_categories') ?? valueOf(existing || {}, 'selectedCategories', 'selected_categories')),
              completion_code: valueOf(input, 'completionCode', 'completion_code') ?? valueOf(existing || {}, 'completionCode', 'completion_code') ?? null,
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id', 'id') || '');
            const selectedCategories = normalizeArray(row.selected_categories);
            const screen = normalizeObject(row.screen);
            return {
              id: String(valueOf(row, 'id', 'session_id') || ''),
              sessionId,
              session_id: sessionId,
              participantName: valueOf(row, 'participant_name') ?? '',
              participant_name: valueOf(row, 'participant_name') ?? '',
              source: valueOf(row, 'source') ?? '',
              study: valueOf(row, 'study') ?? '',
              condition: valueOf(row, 'condition') ?? '',
              entryUrl: valueOf(row, 'entry_url') ?? '',
              entry_url: valueOf(row, 'entry_url') ?? '',
              returnUrl: valueOf(row, 'return_url') ?? '',
              return_url: valueOf(row, 'return_url') ?? '',
              status: valueOf(row, 'status') ?? '',
              startedAt: normalizeTimestamp(row.started_at),
              started_at: normalizeTimestamp(row.started_at),
              preQuestionnaireSubmittedAt: normalizeTimestamp(row.pre_questionnaire_submitted_at),
              pre_questionnaire_submitted_at: normalizeTimestamp(row.pre_questionnaire_submitted_at),
              feedStartedAt: normalizeTimestamp(row.feed_started_at),
              feed_started_at: normalizeTimestamp(row.feed_started_at),
              completedAt: normalizeTimestamp(row.completed_at),
              completed_at: normalizeTimestamp(row.completed_at),
              userAgent: valueOf(row, 'user_agent') ?? '',
              user_agent: valueOf(row, 'user_agent') ?? '',
              screen,
              selectedCategories,
              selected_categories: selectedCategories,
              completionCode: valueOf(row, 'completion_code') ?? '',
              completion_code: valueOf(row, 'completion_code') ?? '',
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
          },
        };
      case 'preference_responses':
        return {
          prefix: 'pref',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id') || makeId('pref'));
            const sessionId = String(valueOf(input, 'sessionId', 'session_id') || id.replace(/^pref_/, ''));
            return compactObject({
              id,
              session_id: sessionId,
              participant_name: valueOf(input, 'participantName', 'participant_name') ?? null,
              study: valueOf(input, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? null,
              selected_categories: normalizeArray(valueOf(input, 'selectedCategories', 'selected_categories')),
              selected_category_labels: normalizeArray(valueOf(input, 'selectedCategoryLabels', 'selected_category_labels')),
              min_selected: normalizeNumber(valueOf(input, 'minSelected', 'min_selected')),
              max_selected: normalizeNumber(valueOf(input, 'maxSelected', 'max_selected')),
              submitted_at: normalizeTimestamp(valueOf(input, 'submittedAt', 'submitted_at') ?? valueOf(existing || {}, 'submittedAt', 'submitted_at') ?? now),
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id') || '');
            const selectedCategories = normalizeArray(row.selected_categories);
            const selectedCategoryLabels = normalizeArray(row.selected_category_labels);
            return {
              id: String(valueOf(row, 'id') || ''),
              sessionId,
              session_id: sessionId,
              participantName: valueOf(row, 'participant_name') ?? '',
              participant_name: valueOf(row, 'participant_name') ?? '',
              study: valueOf(row, 'study') ?? '',
              condition: valueOf(row, 'condition') ?? '',
              selectedCategories,
              selected_categories: selectedCategories,
              selectedCategoryLabels,
              selected_category_labels: selectedCategoryLabels,
              minSelected: normalizeNumber(row.min_selected),
              min_selected: normalizeNumber(row.min_selected),
              maxSelected: normalizeNumber(row.max_selected),
              max_selected: normalizeNumber(row.max_selected),
              submittedAt: normalizeTimestamp(row.submitted_at),
              submitted_at: normalizeTimestamp(row.submitted_at),
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
          },
        };
      case 'assigned_feeds':
        return {
          prefix: 'feed',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id') || makeId('feed'));
            const sessionId = String(valueOf(input, 'sessionId', 'session_id') || id.replace(/^feed_/, ''));
            return compactObject({
              id,
              session_id: sessionId,
              participant_name: valueOf(input, 'participantName', 'participant_name') ?? null,
              study: valueOf(input, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? null,
              selected_categories: normalizeArray(valueOf(input, 'selectedCategories', 'selected_categories')),
              recommendation_rule: normalizeObject(valueOf(input, 'recommendationRule', 'recommendation_rule')),
              video_sequence: normalizeArray(valueOf(input, 'videoSequence', 'video_sequence')),
              preference_match_ratio: normalizeNumber(valueOf(input, 'preferenceMatchRatio', 'preference_match_ratio')),
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id') || '');
            const selectedCategories = normalizeArray(row.selected_categories);
            const recommendationRule = normalizeObject(row.recommendation_rule);
            const videoSequence = normalizeArray(row.video_sequence);
            return {
              id: String(valueOf(row, 'id') || ''),
              sessionId,
              session_id: sessionId,
              participantName: valueOf(row, 'participant_name') ?? '',
              participant_name: valueOf(row, 'participant_name') ?? '',
              study: valueOf(row, 'study') ?? '',
              condition: valueOf(row, 'condition') ?? '',
              selectedCategories,
              selected_categories: selectedCategories,
              recommendationRule,
              recommendation_rule: recommendationRule,
              videoSequence,
              video_sequence: videoSequence,
              preferenceMatchRatio: normalizeNumber(row.preference_match_ratio),
              preference_match_ratio: normalizeNumber(row.preference_match_ratio),
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
          },
        };
      case 'feed_summaries':
        return {
          prefix: 'summary',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id') || makeId('summary'));
            const sessionId = String(valueOf(input, 'sessionId', 'session_id') || id.replace(/^summary_/, ''));
            return compactObject({
              id,
              session_id: sessionId,
              participant_name: valueOf(input, 'participantName', 'participant_name') ?? null,
              return_url: valueOf(input, 'returnUrl', 'return_url') ?? null,
              study: valueOf(input, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? null,
              exit_method: valueOf(input, 'exitMethod', 'exit_method') ?? null,
              time_cap_choice: valueOf(input, 'timeCapChoice', 'time_cap_choice') ?? null,
              start_epoch_ms: normalizeTimestamp(valueOf(input, 'startEpochMs', 'start_epoch_ms')),
              exit_epoch_ms: normalizeTimestamp(valueOf(input, 'exitEpochMs', 'exit_epoch_ms')),
              videos_viewed: normalizeNumber(valueOf(input, 'videosViewed', 'videos_viewed')),
              last_index: normalizeNumber(valueOf(input, 'lastIndex', 'last_index')),
              total_feed_ms: normalizeTimestamp(valueOf(input, 'totalFeedMs', 'total_feed_ms')),
              total_dwell_ms: normalizeTimestamp(valueOf(input, 'totalDwellMs', 'total_dwell_ms')),
              swipe_next_count: normalizeNumber(valueOf(input, 'swipeNextCount', 'swipe_next_count')),
              swipe_prev_count: normalizeNumber(valueOf(input, 'swipePrevCount', 'swipe_prev_count')),
              speed_2x_count: normalizeNumber(valueOf(input, 'speed2xCount', 'speed_2x_count')),
              speed_2x_total_ms: normalizeTimestamp(valueOf(input, 'speed2xTotalMs', 'speed_2x_total_ms')),
              action_tap_count: normalizeNumber(valueOf(input, 'actionTapCount', 'action_tap_count')),
              like_count: normalizeNumber(valueOf(input, 'likeCount', 'like_count')),
              favorite_count: normalizeNumber(valueOf(input, 'favoriteCount', 'favorite_count')),
              follow_count: normalizeNumber(valueOf(input, 'followCount', 'follow_count')),
              sound_unmuted: normalizeNumber(valueOf(input, 'soundUnmuted', 'sound_unmuted')),
              exit_prompt_count: normalizeNumber(valueOf(input, 'exitPromptCount', 'exit_prompt_count')),
              exit_cancel_count: normalizeNumber(valueOf(input, 'exitCancelCount', 'exit_cancel_count')),
              first_exit_attempt_ms: normalizeTimestamp(valueOf(input, 'firstExitAttemptMs', 'first_exit_attempt_ms')),
              exit_decision_latency_ms: normalizeTimestamp(valueOf(input, 'exitDecisionLatencyMs', 'exit_decision_latency_ms')),
              watch_ms_after_first_exit_attempt: normalizeTimestamp(valueOf(input, 'watchMsAfterFirstExitAttempt', 'watch_ms_after_first_exit_attempt')),
              dwell_ms_per_slide: valueOf(input, 'dwellMsPerSlide', 'dwell_ms_per_slide') ?? null,
              event_count: normalizeNumber(valueOf(input, 'eventCount', 'event_count')),
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id') || '');
            const participantName = valueOf(row, 'participant_name') ?? '';
            const returnUrl = valueOf(row, 'return_url') ?? '';
            const study = valueOf(row, 'study') ?? '';
            const condition = valueOf(row, 'condition') ?? '';
            const record = {
              id: String(valueOf(row, 'id') || ''),
              session_id: sessionId,
              sessionId,
              participant_name: participantName,
              participantName,
              return_url: returnUrl,
              returnUrl,
              study,
              condition,
              exit_method: valueOf(row, 'exit_method') ?? '',
              time_cap_choice: valueOf(row, 'time_cap_choice') ?? '',
              start_epoch_ms: normalizeTimestamp(row.start_epoch_ms),
              startEpochMs: normalizeTimestamp(row.start_epoch_ms),
              exit_epoch_ms: normalizeTimestamp(row.exit_epoch_ms),
              exitEpochMs: normalizeTimestamp(row.exit_epoch_ms),
              videos_viewed: normalizeNumber(row.videos_viewed),
              last_index: normalizeNumber(row.last_index),
              total_feed_ms: normalizeTimestamp(row.total_feed_ms),
              total_dwell_ms: normalizeTimestamp(row.total_dwell_ms),
              swipe_next_count: normalizeNumber(row.swipe_next_count),
              swipe_prev_count: normalizeNumber(row.swipe_prev_count),
              speed_2x_count: normalizeNumber(row.speed_2x_count),
              speed_2x_total_ms: normalizeTimestamp(row.speed_2x_total_ms),
              action_tap_count: normalizeNumber(row.action_tap_count),
              like_count: normalizeNumber(row.like_count),
              favorite_count: normalizeNumber(row.favorite_count),
              follow_count: normalizeNumber(row.follow_count),
              sound_unmuted: normalizeNumber(row.sound_unmuted),
              exit_prompt_count: normalizeNumber(row.exit_prompt_count),
              exit_cancel_count: normalizeNumber(row.exit_cancel_count),
              first_exit_attempt_ms: normalizeTimestamp(row.first_exit_attempt_ms),
              exit_decision_latency_ms: normalizeTimestamp(row.exit_decision_latency_ms),
              watch_ms_after_first_exit_attempt: normalizeTimestamp(row.watch_ms_after_first_exit_attempt),
              dwell_ms_per_slide: valueOf(row, 'dwell_ms_per_slide') ?? '',
              event_count: normalizeNumber(row.event_count),
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
            return record;
          },
        };
      case 'feed_events':
        return {
          prefix: 'events',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id') || makeId('events'));
            const sessionId = String(valueOf(input, 'sessionId', 'session_id') || id.replace(/^events_/, '').replace(/_\d+$/, ''));
            return compactObject({
              id,
              session_id: sessionId,
              participant_name: valueOf(input, 'participantName', 'participant_name') ?? null,
              return_url: valueOf(input, 'returnUrl', 'return_url') ?? null,
              study: valueOf(input, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? null,
              chunk_index: normalizeNumber(valueOf(input, 'chunkIndex', 'chunk_index')),
              events: normalizeArray(valueOf(input, 'events')),
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id') || '');
            const participantName = valueOf(row, 'participant_name') ?? '';
            const returnUrl = valueOf(row, 'return_url') ?? '';
            const study = valueOf(row, 'study') ?? '';
            const condition = valueOf(row, 'condition') ?? '';
            return {
              id: String(valueOf(row, 'id') || ''),
              session_id: sessionId,
              sessionId,
              participant_name: participantName,
              participantName,
              return_url: returnUrl,
              returnUrl,
              study,
              condition,
              chunk_index: normalizeNumber(row.chunk_index),
              chunkIndex: normalizeNumber(row.chunk_index),
              events: normalizeArray(row.events),
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
          },
        };
      case 'completion_records':
        return {
          prefix: 'complete',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id') || makeId('complete'));
            const sessionId = String(valueOf(input, 'sessionId', 'session_id') || id.replace(/^complete_/, ''));
            return compactObject({
              id,
              session_id: sessionId,
              participant_name: valueOf(input, 'participantName', 'participant_name') ?? null,
              study: valueOf(input, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? null,
              completed: normalizeBoolean(valueOf(input, 'completed')),
              completion_code: valueOf(input, 'completionCode', 'completion_code') ?? null,
              return_url: valueOf(input, 'returnUrl', 'return_url') ?? null,
              redirected_at: normalizeTimestamp(valueOf(input, 'redirectedAt', 'redirected_at')),
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id') || '');
            const participantName = valueOf(row, 'participant_name') ?? '';
            const returnUrl = valueOf(row, 'return_url') ?? '';
            const study = valueOf(row, 'study') ?? '';
            const condition = valueOf(row, 'condition') ?? '';
            return {
              id: String(valueOf(row, 'id') || ''),
              sessionId,
              session_id: sessionId,
              participantName,
              participant_name: participantName,
              study,
              condition,
              completed: normalizeBoolean(row.completed),
              completionCode: valueOf(row, 'completion_code') ?? '',
              completion_code: valueOf(row, 'completion_code') ?? '',
              returnUrl,
              return_url: returnUrl,
              redirectedAt: normalizeTimestamp(row.redirected_at),
              redirected_at: normalizeTimestamp(row.redirected_at),
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
          },
        };
      case 'audit_logs':
        return {
          prefix: 'audit',
          toRow(record, existing) {
            const input = stripInternalFields(record);
            const now = Date.now();
            const id = String(valueOf(input, 'id') || makeId('audit'));
            const payload = compactObject({
              ...stripInternalFields(input),
              payload: undefined,
            });
            delete payload.id;
            delete payload.type;
            delete payload.message;
            delete payload.mode;
            delete payload.source;
            delete payload.sessionId;
            delete payload.session_id;
            delete payload.study;
            delete payload.condition;
            delete payload.createdAt;
            delete payload.created_at;
            delete payload.updatedAt;
            delete payload.updated_at;
            delete payload.completionCode;
            delete payload.completion_code;
            return compactObject({
              id,
              session_id: valueOf(input, 'sessionId', 'session_id') ?? null,
              study: valueOf(input, 'study') ?? null,
              condition: valueOf(input, 'condition') ?? null,
              type: valueOf(input, 'type') ?? null,
              message: valueOf(input, 'message') ?? null,
              mode: valueOf(input, 'mode') ?? null,
              source: valueOf(input, 'source') ?? null,
              payload: normalizeObject(valueOf(input, 'payload')),
              created_at: normalizeTimestamp(valueOf(input, 'createdAt', 'created_at') ?? valueOf(existing || {}, 'createdAt', 'created_at') ?? now),
              updated_at: normalizeTimestamp(valueOf(input, 'updatedAt', 'updated_at') ?? now),
            });
          },
          fromRow(row) {
            const sessionId = String(valueOf(row, 'session_id') || '');
            const payload = normalizeObject(row.payload);
            const base = {
              id: String(valueOf(row, 'id') || ''),
              sessionId,
              session_id: sessionId,
              study: valueOf(row, 'study') ?? '',
              condition: valueOf(row, 'condition') ?? '',
              type: valueOf(row, 'type') ?? '',
              message: valueOf(row, 'message') ?? '',
              mode: valueOf(row, 'mode') ?? '',
              source: valueOf(row, 'source') ?? '',
              payload,
              createdAt: normalizeTimestamp(row.created_at),
              created_at: normalizeTimestamp(row.created_at),
              updatedAt: normalizeTimestamp(row.updated_at),
              updated_at: normalizeTimestamp(row.updated_at),
            };
            return { ...base, ...payload };
          },
        };
      default:
        return null;
    }
  }

  function toRemoteRow(name, record, existing) {
    const handler = tableHandlerFor(name);
    if (!handler) return compactObject(stripInternalFields(record));
    return handler.toRow(record, existing);
  }

  function fromRemoteRow(name, row) {
    const handler = tableHandlerFor(name);
    if (!handler) return cloneValue(row);
    return handler.fromRow(row);
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
        const db = typeof app.rdb === 'function' ? app.rdb() : app.rdb;
        if (!auth || typeof auth.signInAnonymously !== 'function') {
          throw new Error('CloudBase auth interface unavailable');
        }
        if (!db || typeof db.from !== 'function') {
          throw new Error('CloudBase PostgreSQL client unavailable');
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

    try {
      const result = await db.from(name).select('*');
      if (result && result.error) throw result.error;
      const rows = Array.isArray(result && result.data) ? result.data : [];
      const mapped = rows.map((row) => fromRemoteRow(name, row));
      mapped.sort((a, b) => (normalizeTimestamp(valueOf(b, 'updatedAt', 'updated_at', 'createdAt', 'created_at')) || 0) - (normalizeTimestamp(valueOf(a, 'updatedAt', 'updated_at', 'createdAt', 'created_at')) || 0));
      return mapped;
    } catch (error) {
      throw error;
    }
  }

  async function readAll() {
    const output = {};
    const names = localTableNames();

    await initCloudBase();

    const entries = await Promise.all(names.map(async (name) => {
      try {
        const remote = await readRemoteCollection(name);
        return [name, remote || collectionLocal(name).list.slice()];
      } catch (error) {
        state.lastWriteError = String(error && error.message ? error.message : error);
        return [name, collectionLocal(name).list.slice()];
      }
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
      const result = await db.from(name).select('*').eq('id', docId);
      if (result && result.error) throw result.error;
      const rows = Array.isArray(result && result.data) ? result.data : [];
      return rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  function prepareInsertPayload(name, record, existing) {
    const row = toRemoteRow(name, record, existing);
    return compactObject(normalizePgTimestampFields(row));
  }

  function prepareUpdatePayload(name, row) {
    const payload = { ...row, updated_at: normalizePgTimestamp(Date.now()) };
    delete payload.id;
    delete payload.created_at;
    return compactObject(normalizePgTimestampFields(payload));
  }

  async function upsert(name, record, idField) {
    const field = idField || 'id';
    const input = stripInternalFields(record || {});
    const docId = String(valueOf(input, field, 'id', 'sessionId', 'session_id') || makeId(name));
    input[field] = docId;
    if (!input.id) input.id = docId;

    const db = await getDb();
    if (!db) {
      state.lastWriteSource = 'local';
      state.lastWriteError = state.initError ? String(state.initError.message || state.initError) : null;
      return upsertLocal(name, input, field);
    }

    try {
      let existingResult = null;
      try {
        existingResult = await getRemoteDoc(name, docId);
      } catch (error) {
        state.lastWriteSource = 'local';
        state.lastWriteError = String(error && error.message ? error.message : error);
        return upsertLocal(name, input, field);
      }
      const next = prepareInsertPayload(name, input, existingResult || undefined);
      if (existingResult) {
        const { error } = await db.from(name).update(prepareUpdatePayload(name, next)).eq('id', docId);
        if (error) throw error;
      } else {
        const { error } = await db.from(name).insert(next);
        if (error) throw error;
      }
      state.lastWriteSource = 'cloudbase';
      state.lastWriteError = null;
      return fromRemoteRow(name, next);
    } catch (error) {
      state.lastWriteSource = 'local';
      state.lastWriteError = String(error && error.message ? error.message : error);
      return upsertLocal(name, input, field);
    }
  }

  async function append(name, record) {
    const input = stripInternalFields(record || {});
    const docId = String(valueOf(input, 'id', 'sessionId', 'session_id') || makeId(name));
    input.id = docId;
    const now = Date.now();
    if (input.createdAt == null && input.created_at == null) input.createdAt = now;
    if (input.updatedAt == null && input.updated_at == null) input.updatedAt = now;

    const db = await getDb();
    if (!db) {
      state.lastWriteSource = 'local';
      state.lastWriteError = state.initError ? String(state.initError.message || state.initError) : null;
      return appendLocal(name, input);
    }

    try {
      const next = prepareInsertPayload(name, input, undefined);
      const { error } = await db.from(name).insert(next);
      if (error) throw error;
      state.lastWriteSource = 'cloudbase';
      state.lastWriteError = null;
      return fromRemoteRow(name, next);
    } catch (error) {
      state.lastWriteSource = 'local';
      state.lastWriteError = String(error && error.message ? error.message : error);
      return appendLocal(name, input);
    }
  }

  function upsertLocal(name, record, idField) {
    const { data, list } = collectionLocal(name);
    const field = idField || 'id';
    const next = compactObject({
      ...stripInternalFields(record),
      [field]: valueOf(record, field, 'id', 'sessionId', 'session_id') || makeId('doc'),
    });
    if (!next.id) next.id = String(next[field]);
    if (!next.createdAt) next.createdAt = Date.now();
    next.updatedAt = Date.now();
    const idx = list.findIndex((item) => item[field] === next[field]);
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
    data[name] = list;
    writeLocalAll(data);
    return next;
  }

  function appendLocal(name, record) {
    const { data, list } = collectionLocal(name);
    const next = compactObject({
      ...stripInternalFields(record),
      id: valueOf(record, 'id', 'sessionId', 'session_id') || makeId(name),
    });
    if (!next.createdAt) next.createdAt = Date.now();
    next.updatedAt = Date.now();
    list.push(next);
    data[name] = list;
    writeLocalAll(data);
    return next;
  }

  async function clearRemoteTable(name) {
    const db = await getDb();
    if (!db) return false;

    try {
      const rows = await readRemoteCollection(name);
      if (!rows || !rows.length) return true;
      await Promise.all(rows.map(async (row) => {
        const docId = valueOf(row, 'id');
        if (!docId) return;
        const result = await db.from(name).delete().eq('id', docId);
        if (result && result.error) throw result.error;
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function clear() {
    const db = await getDb();
    if (!db) {
      window.localStorage.removeItem(KEY);
      return;
    }

    try {
      const results = await Promise.all(DATA_TABLES.map((name) => clearRemoteTable(name)));
      if (results.some((result) => result === false)) {
        throw new Error('CloudBase PostgreSQL 清空记录失败');
      }
      window.localStorage.removeItem(KEY);
    } catch (error) {
      state.lastWriteSource = 'cloudbase';
      state.lastWriteError = String(error && error.message ? error.message : error);
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
      'start_epoch_ms',
      'exit_epoch_ms',
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
        returnUrl: completion.returnUrl || session.returnUrl || preference.returnUrl || assigned.returnUrl || summary.returnUrl || '',
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
        start_epoch_ms: summary.start_epoch_ms ?? '',
        exit_epoch_ms: summary.exit_epoch_ms ?? '',
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
    get mode() {
      return state.mode;
    },
    getMode() {
      return state.mode;
    },
    get initError() {
      return state.initError;
    },
    get lastWriteSource() {
      return state.lastWriteSource;
    },
    get lastWriteError() {
      return state.lastWriteError;
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
