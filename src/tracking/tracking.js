(function () {
  const TRACKING_DAYS = 10;
  const QUESTIONNAIRE_DAYS = [1, 5, 10];
  const SLOTS = [
    { id: 'slot_1', label: '上午', targetTime: '10:00' },
    { id: 'slot_2', label: '下午早些时候', targetTime: '14:00' },
    { id: 'slot_3', label: '傍晚', targetTime: '18:00' },
    { id: 'slot_4', label: '晚上', targetTime: '21:00' },
  ];

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeCode(value) {
    return text(value).toUpperCase();
  }

  function getBeijingParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  }

  function beijingDateKey(date = new Date()) {
    const parts = getBeijingParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function dateValue(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(dateKey));
    if (!match) return NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function dayNumber(startDate, currentDate = beijingDateKey()) {
    const startValue = dateValue(startDate);
    const currentValue = dateValue(currentDate);
    if (!Number.isFinite(startValue) || !Number.isFinite(currentValue)) return 1;
    return Math.floor((currentValue - startValue) / 86400000) + 1;
  }

  function targetEpoch(dateKey, targetTime) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(dateKey));
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(text(targetTime));
    if (!dateMatch || !timeMatch) return NaN;
    // Date.UTC represents UTC; subtract eight hours to represent Beijing time.
    return Date.UTC(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      Number(timeMatch[1]) - 8,
      Number(timeMatch[2]),
    );
  }

  function isTrackingMode(params) {
    const study = text(params?.get('study')).toLowerCase();
    return params?.get('tracking') === '1'
      || study === '3';
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function findParticipant(records, { participantName, trackingCode, study, condition }) {
    const name = text(participantName);
    const code = normalizeCode(trackingCode);
    const studyValue = text(study).toLowerCase();
    const conditionValue = text(condition).toLowerCase();
    return (records?.tracking_participants || []).find((item) => (
      text(item.participantName || item.participant_name) === name
      && normalizeCode(item.trackingCode || item.tracking_code) === code
      && text(item.study).toLowerCase() === studyValue
      && text(item.condition).toLowerCase() === conditionValue
    )) || null;
  }

  function runsForParticipant(records, participantId) {
    return (records?.tracking_runs || []).filter((item) => text(item.participantId || item.participant_id) === text(participantId));
  }

  function questionnairesForParticipant(records, participantId) {
    return (records?.tracking_questionnaires || []).filter((item) => text(item.participantId || item.participant_id) === text(participantId));
  }

  function completedRunsForDay(records, participantId, day) {
    return runsForParticipant(records, participantId).filter((item) => (
      Number(item.trackingDay || item.tracking_day) === Number(day)
      && text(item.status).toLowerCase() === 'completed'
    ));
  }

  function questionnaireForDay(records, participantId, day) {
    return questionnairesForParticipant(records, participantId).find((item) => Number(item.trackingDay || item.tracking_day) === Number(day)) || null;
  }

  function isComplete(participant, records) {
    const participantId = participant?.id || participant?.participantId;
    if (!participantId) return false;
    const allRunsComplete = Array.from({ length: TRACKING_DAYS }, (_, index) => index + 1)
      .every((day) => completedRunsForDay(records, participantId, day).length >= SLOTS.length);
    const allQuestionnairesComplete = QUESTIONNAIRE_DAYS.every((day) => {
      const item = questionnaireForDay(records, participantId, day);
      return item && (item.completed === true || item.completed === 'true' || item.completed === 1 || item.completed === '1');
    });
    return allRunsComplete && allQuestionnairesComplete;
  }

  async function maybeFinalize(participant, records) {
    if (!participant || participant.finalCompletionCode || !isComplete(participant, records)) return participant;
    const code = `F-${Date.now().toString(36).slice(-6).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    return window.ExperimentStore.upsert('tracking_participants', {
      ...participant,
      id: participant.id,
      finalCompletionCode: code,
      finalCompletedAt: Date.now(),
      status: 'completed',
    });
  }

  function buildFeed(condition, selectedCategories, sessionId, participantName) {
    return window.Recommendation.buildRecommendedFeed({
      assets: window.VIDEO_ASSETS,
      selectedCategories: selectedCategories?.length ? selectedCategories : ['life_record'],
      feedLength: condition?.browsing?.feedLength || 80,
      preferredRatio: condition?.recommendation?.preferredRatio ?? 0.7,
      seed: `${sessionId}_${participantName}_${condition?.study || ''}_${condition?.condition || ''}`,
    });
  }

  async function renderEntry({ form, participantInput, categoryGrid, notice, submitBtn, params, study, condition, source, returnUrl }) {
    await window.ExperimentStore.whenReady;
    const trackingCodeParam = normalizeCode(params.get('trackingCode') || params.get('code') || '');
    const codeInput = document.createElement('input');
    codeInput.id = 'trackingCode';
    codeInput.name = 'trackingCode';
    codeInput.autocomplete = 'off';
    codeInput.autocapitalize = 'characters';
    codeInput.spellcheck = false;
    codeInput.placeholder = '例如 A7K92P';
    codeInput.value = trackingCodeParam;
    codeInput.pattern = '[A-Za-z0-9_-]{4,20}';
    codeInput.maxLength = 20;

    const codeRow = document.createElement('div');
    codeRow.className = 'form-row';
    codeRow.innerHTML = '<label for="trackingCode">追踪编号（必填）</label><small class="form-help">首次进入时请自行设置 4–20 位字母、数字、短横线或下划线，并在后续 10 天使用同一编号。</small>';
    codeRow.appendChild(codeInput);
    participantInput.closest('.form-row')?.insertAdjacentElement('afterend', codeRow);
    form.querySelector('h1').textContent = '进入10天短视频追踪';
    const intro = form.querySelector('p');
    if (intro) intro.textContent = '每天从同一入口进入 4 次短视频任务。请使用同一姓名和追踪编号恢复进度；姓名与编号仅用于匹配追踪记录，请勿使用真实姓名以外的可识别信息。';
    notice.textContent = '请输入姓名和追踪编号；首次进入还需选择感兴趣的视频类型。';

    function selectedCategories() {
      return Array.from(form.querySelectorAll('input[name="category"]:checked')).map((item) => item.value);
    }

    function replaceRecords(nextRecords, participant) {
      const current = nextRecords || {};
      const existingParticipant = participant || null;
      renderDashboard(existingParticipant, current);
    }

    async function loadParticipant(name, code) {
      const records = await window.ExperimentStore.readAll();
      const participant = findParticipant(records, {
        participantName: name,
        trackingCode: code,
        study,
        condition: condition.condition,
      });
      return { records, participant };
    }

      function freshRecordsWithParticipant(records, participant) {
      return {
        ...(records || {}),
        tracking_participants: [
          ...((records && records.tracking_participants) || []).filter((item) => item.id !== participant.id),
          participant,
        ],
      };
    }

    function trackingReturnUrl(participant) {
      const url = new URL(window.location.href);
      url.searchParams.set('tracking', '1');
      url.searchParams.set('name', participant.participantName || participant.participant_name || '');
      url.searchParams.set('trackingCode', participant.trackingCode || participant.tracking_code || '');
      url.searchParams.delete('slot');
      return url.toString();
    }

    async function launchSlot(participant, records, day, slot) {
      if (!slot) throw new Error('无效的任务时段。');
      const targetDate = (() => {
        const startDate = participant.startDate || participant.start_date || beijingDateKey();
        const value = dateValue(startDate) + (day - 1) * 86400000;
        const date = new Date(value);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      })();
      const existing = runsForParticipant(records, participant.id || participant.participantId)
        .find((item) => text(item.targetDate || item.target_date) === targetDate && text(item.sessionSlot || item.session_slot) === slot.id);
      if (existing && text(existing.status).toLowerCase() === 'completed') return;

      const sessionId = text(existing?.sessionId || existing?.session_id) || window.ExperimentStore.makeId('sess');
      const runId = text(existing?.id) || `run_${sessionId}`;
      const selected = participant.selectedCategories || participant.selected_categories || [];
      const feed = buildFeed(condition, selected, sessionId, participant.participantName || participant.participant_name);
      const lateAfterSlot = Date.now() > targetEpoch(targetDate, slot.targetTime);
      const run = {
        id: runId,
        participantId: participant.id || participant.participantId,
        participantName: participant.participantName || participant.participant_name,
        study,
        condition: condition.condition,
        sessionId,
        trackingDay: day,
        sessionSlot: slot.id,
        targetDate,
        targetTime: slot.targetTime,
        status: 'started',
        lateAfterSlot,
        startedAt: existing?.startedAt || existing?.started_at || Date.now(),
        completedAt: null,
        taskCompletionCode: null,
        summaryId: null,
      };
      const screenInfo = {
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      };
      const participantName = participant.participantName || participant.participant_name;
      const assignedFeed = {
        id: `feed_${sessionId}`,
        sessionId,
        participantName,
        study,
        condition: condition.condition,
        selectedCategories: selected,
        recommendationRule: condition.recommendation,
        videoSequence: feed.map((item) => ({
          videoId: item.id,
          sampleId: item.sample_id,
          primaryCategory: item.primary_category,
          matchedPreference: item.matched_preference,
        })),
        preferenceMatchRatio: feed.filter((item) => item.matched_preference).length / feed.length,
      };
      await Promise.all([
        window.ExperimentStore.upsert('participant_sessions', {
          id: sessionId,
          participantName,
          source,
          study,
          condition: condition.condition,
          entryUrl: window.location.href,
          returnUrl,
          status: 'preference_completed',
          startedAt: Date.now(),
          preQuestionnaireSubmittedAt: null,
          feedStartedAt: null,
          completedAt: null,
          userAgent: navigator.userAgent,
          screen: screenInfo,
          selectedCategories: selected,
          participantId: participant.id || participant.participantId,
          trackingDay: day,
          sessionSlot: slot.id,
        }),
        window.ExperimentStore.upsert('assigned_feeds', assignedFeed),
        window.ExperimentStore.upsert('tracking_runs', run),
      ]);
      window.sessionStorage.setItem(`condition_${sessionId}`, JSON.stringify(condition));
      window.sessionStorage.setItem(`feed_${sessionId}`, JSON.stringify(feed));
      window.sessionStorage.setItem(`session_meta_${sessionId}`, JSON.stringify({
        participantName,
        study,
        condition: condition.condition,
        selectedCategories: selected,
        returnUrl,
        participantId: participant.id || participant.participantId,
        trackingDay: day,
        sessionSlot: slot.id,
        trackingRunId: runId,
        targetDate,
        targetTime: slot.targetTime,
        lateAfterSlot,
        trackingReturn: trackingReturnUrl(participant),
      }));
      window.location.href = `runner.html?sessionId=${encodeURIComponent(sessionId)}&tracking=1&debug=${params.get('debug') || '0'}`;
    }

    function formatDate(dateKey) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(dateKey));
      return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : text(dateKey);
    }

    function completed(item) {
      return text(item?.status).toLowerCase() === 'completed';
    }

    function renderDashboard(participant, records) {
      if (!participant) return;
      const participantId = participant.id || participant.participantId;
      const startDate = participant.startDate || participant.start_date || beijingDateKey();
      const currentDate = params.get('trackingDate') || beijingDateKey();
      const rawDay = Number(params.get('trackingDay')) || dayNumber(startDate, currentDate);
      const day = Math.max(1, Math.min(TRACKING_DAYS, rawDay));
      const isOnTrackingDay = dayNumber(startDate, currentDate) === day;
      const dayDate = isOnTrackingDay ? currentDate : (() => {
        const value = dateValue(startDate) + (day - 1) * 86400000;
        const date = new Date(value);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      })();
      const dayRuns = completedRunsForDay(records, participantId, day).filter((item) => text(item.targetDate || item.target_date) === dayDate);
      const allRuns = runsForParticipant(records, participantId);
      const dayQuestionnaire = questionnaireForDay(records, participantId, day);
      const finalCode = participant.finalCompletionCode || participant.final_completion_code || '';
      const dayCards = Array.from({ length: TRACKING_DAYS }, (_, index) => {
        const dayNumberValue = index + 1;
        const count = completedRunsForDay(records, participantId, dayNumberValue).length;
        const q = questionnaireForDay(records, participantId, dayNumberValue);
        const qDone = q && q.completed;
        return `<span class="tracking-day-chip ${count >= SLOTS.length ? 'is-complete' : ''} ${dayNumberValue === day ? 'is-current' : ''}">第${dayNumberValue}天 ${count}/4${QUESTIONNAIRE_DAYS.includes(dayNumberValue) ? ` · 量表${qDone ? '已登记' : '待登记'}` : ''}</span>`;
      }).join('');
      const slots = SLOTS.map((slot) => {
        const run = allRuns.find((item) => Number(item.trackingDay || item.tracking_day) === day && text(item.targetDate || item.target_date) === dayDate && text(item.sessionSlot || item.session_slot) === slot.id);
        const isDone = completed(run);
        const isStarted = run && !isDone;
        return `<article class="tracking-slot ${isDone ? 'is-complete' : ''}">
          <div><small>${escapeHtml(slot.label)}</small><strong>${escapeHtml(slot.targetTime)}</strong></div>
          <span class="tracking-slot-status">${isDone ? '已完成' : isStarted ? '可继续' : '待完成'}</span>
          <button class="btn ${isDone || !isOnTrackingDay ? '' : 'btn--primary'} tracking-launch" data-slot="${escapeHtml(slot.id)}" ${isDone || !isOnTrackingDay ? 'disabled' : ''}>${isDone ? '完成码见记录' : !isOnTrackingDay ? '非当天' : isStarted ? '继续任务' : '开始任务'}</button>
        </article>`;
      }).join('');
      const questionnaireBlock = QUESTIONNAIRE_DAYS.includes(day)
        ? `<div class="tracking-questionnaire-status ${dayQuestionnaire?.completed ? 'is-complete' : ''}">
            <strong>第${day}天见数量表</strong>
            <span>${dayQuestionnaire?.completed ? `已登记${dayQuestionnaire.externalRecordId ? `（记录号：${escapeHtml(dayQuestionnaire.externalRecordId)}）` : ''}` : '请按见数安排完成；网站由管理员登记状态。'}</span>
          </div>`
        : '';
      form.innerHTML = `
        <div class="tracking-dashboard-head"><div><small>研究3 · 追踪实验</small><h1>你好，${escapeHtml(participant.participantName || participant.participant_name)}</h1></div><button type="button" class="btn" id="trackingLogout">切换记录</button></div>
        <p>追踪编号：<strong>${escapeHtml(participant.trackingCode || participant.tracking_code)}</strong>。请保存该编号，后续每天从同一入口进入。当前进度按北京时间计算。</p>
        <div class="tracking-progress">${dayCards}</div>
        <div class="tracking-notice"><strong>第${day}天 · ${formatDate(dayDate)}</strong><span>${isOnTrackingDay ? `今日完成 ${dayRuns.length}/${SLOTS.length} 次。错过目标时段可在当天补做，系统会记录实际进入时间。` : `当前日期不在第${day}天，任务卡仅用于查看追踪进度。`}</span></div>
        <div class="tracking-slots">${slots}</div>
        ${questionnaireBlock}
        ${finalCode ? `<div class="tracking-final-code"><small>10天追踪最终完成码</small><strong>${escapeHtml(finalCode)}</strong><span>请在第10天全部任务及见数量表登记完成后，按见数要求填写。</span></div>` : ''}
        <p class="tracking-footnote">如遇到页面异常，请不要重复提交同一时段；先记录姓名、追踪编号和出现问题的时段，再联系研究人员。</p>
      `;
      document.getElementById('trackingLogout')?.addEventListener('click', () => window.location.reload());
      form.querySelectorAll('.tracking-launch').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        const slot = SLOTS.find((item) => item.id === button.dataset.slot);
        try {
          if (!isOnTrackingDay) throw new Error('当前不在该追踪日，不能启动任务。');
          await launchSlot(participant, records, day, slot);
        } catch (error) {
          button.disabled = false;
          notice.textContent = `任务启动失败：${error.message || error}`;
        }
      }));
    }

    submitBtn.textContent = '进入追踪';
    submitBtn.disabled = false;
    participantInput.addEventListener('input', () => { submitBtn.disabled = !participantInput.value.trim() || !codeInput.value.trim(); });
    codeInput.addEventListener('input', () => {
      codeInput.value = normalizeCode(codeInput.value).replace(/[^A-Z0-9_-]/g, '');
      submitBtn.disabled = !participantInput.value.trim() || !codeInput.value.trim();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const participantName = text(participantInput.value);
      const trackingCode = normalizeCode(codeInput.value);
      if (!participantName || !/^[A-Z0-9_-]{4,20}$/.test(trackingCode)) {
        notice.textContent = '请输入姓名，并设置 4–20 位字母、数字、短横线或下划线组成的追踪编号。';
        return;
      }
      submitBtn.disabled = true;
      const { records, participant: existing } = await loadParticipant(participantName, trackingCode);
      if (existing) {
        const next = await maybeFinalize(existing, records);
        const refreshedRecords = next && next !== existing
          ? freshRecordsWithParticipant(records, next)
          : records;
        replaceRecords(refreshedRecords, next || existing);
        return;
      }
      const categories = selectedCategories();
      if (!categories.length || categories.length > 3) {
        notice.textContent = '首次进入请至少选择 1 类、最多选择 3 类视频内容。';
        submitBtn.disabled = false;
        return;
      }
      const participant = await window.ExperimentStore.upsert('tracking_participants', {
        id: window.ExperimentStore.makeId('participant'),
        participantName,
        trackingCode,
        source,
        study,
        condition: condition.condition,
        startDate: params.get('trackingStartDate') || beijingDateKey(),
        selectedCategories: categories,
        status: 'active',
      });
      const nextRecords = await window.ExperimentStore.readAll();
      replaceRecords(nextRecords, participant);
    });
    if (participantInput.value.trim() && codeInput.value.trim()) submitBtn.disabled = false;
  }

  window.Tracking = {
    TRACKING_DAYS,
    QUESTIONNAIRE_DAYS,
    SLOTS,
    escapeHtml,
    normalizeCode,
    getBeijingParts,
    beijingDateKey,
    dateValue,
    dayNumber,
    targetEpoch,
    isTrackingMode,
    findParticipant,
    runsForParticipant,
    questionnairesForParticipant,
    completedRunsForDay,
    questionnaireForDay,
    isComplete,
    maybeFinalize,
    buildFeed,
    renderEntry,
  };
})();
