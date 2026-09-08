(function () {
  const baseBrowsing = {
    minDurationSec: 600,
    maxDurationSec: 600,
    feedLength: 80,
    allowEarlyExit: true,
    videoSelectionMode: 'weighted_random',
  };

  const baseRecommendation = {
    enabled: true,
    preferredRatio: 0.7,
    minSelectedCategories: 1,
    maxSelectedCategories: 3,
    fallbackMode: 'fill_with_global_pool',
    selectionMode: 'weighted_random',
    seedMode: 'session_id',
  };

  const baseRecording = {
    saveEventLog: true,
    saveDwellPerVideo: true,
    saveClicks: true,
    saveExitAttempts: true,
  };

  const basicExit = {
    type: 'basic',
    title: '确定要退出吗？',
    messageTemplate: '退出后将结束本次观看，并记录你的浏览行为。',
    confirmText: '确认退出',
    cancelText: '继续观看',
  };

  function condition(study, conditionId, name, overrides) {
    return {
      id: `${study}_${conditionId}`,
      study,
      condition: conditionId,
      name,
      enabled: true,
      entry: {
        requireParticipantId: false,
        allowAnonymous: true,
        returnUrlRequired: false,
      },
      browsing: { ...baseBrowsing, ...(overrides.browsing || {}) },
      recommendation: { ...baseRecommendation, ...(overrides.recommendation || {}) },
      exitNudge: { ...basicExit, ...(overrides.exitNudge || {}) },
      continueMode: overrides.continueMode || 'tap_cancel',
      holdConfig: overrides.holdConfig || null,
      swipeConfig: overrides.swipeConfig || null,
      visualTreatment: {
        grayscale: false,
        saturationPercent: 100,
        applyAtSec: null,
        applyScope: 'feed',
        ...(overrides.visualTreatment || {}),
      },
      dataRecording: { ...baseRecording, ...(overrides.dataRecording || {}) },
      completion: {
        showCompletionPage: true,
        autoRedirect: false,
        redirectDelaySec: 3,
        ...(overrides.completion || {}),
      },
      notes: overrides.notes || '',
    };
  }

  const feedbackMessages = {
    time: {
      type: 'time_feedback',
      title: '浏览状态提醒',
      messageTemplate: '你已经累计观看 {{watch_time}}。是否结束本次浏览？',
      confirmText: '结束浏览',
      cancelText: '滑动继续观看',
      feedbackItems: ['watch_time'],
    },
    count: {
      type: 'count_feedback',
      title: '浏览状态提醒',
      messageTemplate: '你已经浏览 {{viewed_count}} 条视频。是否结束本次浏览？',
      confirmText: '结束浏览',
      cancelText: '滑动继续观看',
      feedbackItems: ['viewed_count'],
    },
    combined: {
      type: 'combined_feedback',
      title: '浏览状态提醒',
      messageTemplate: '你已经浏览 {{viewed_count}} 条视频，累计观看 {{watch_time}}。是否结束本次浏览？',
      confirmText: '结束浏览',
      cancelText: '滑动继续观看',
      feedbackItems: ['viewed_count', 'watch_time'],
    },
  };

  window.EXPERIMENTS = [
    {
      id: '1a',
      title: '研究1A：反馈信息对用户愉悦感的影响',
      summary: '信息反馈与简单退出界面对比。',
    },
    {
      id: '1b',
      title: '研究1B：灰色界面对用户自主性的影响',
      summary: '正常色彩与低饱和度界面对比。',
    },
    {
      id: '2a',
      title: '研究2A：反馈类型与继续方式',
      summary: '控制组以及滑动继续、长按继续两种方式组合。'
    },
    {
      id: '2b',
      title: '研究2B：界面饱和度与呈现时间',
      summary: '按组别在 5、10、15 分钟各发生一次饱和度变化，20 分钟自动弹出退出界面并强制进入后测。',
    },
  ];

  window.EXPERIMENT_CONDITIONS = [
    condition('1a', 'g1', '研究1A-G1：无反馈控制组', {
      exitNudge: basicExit,
      notes: '退出界面仅提供确认与取消按钮。',
    }),
    condition('1a', 'g2', '研究1A-G2：信息反馈组', {
      exitNudge: feedbackMessages.combined,
      notes: '退出界面显示已浏览条数与累计观看时长。',
    }),

    condition('1b', 'g1', '研究1B-G1：正常色彩组', {
      visualTreatment: { grayscale: false, saturationPercent: 100 },
      exitNudge: basicExit,
    }),
    condition('1b', 'g2', '研究1B-G2：低饱和度组', {
      visualTreatment: { grayscale: true, saturationPercent: 30, applyAtSec: 0, applyScope: 'feed' },
      exitNudge: basicExit,
    }),

    condition('2a', 'g1', '研究2A-G1：无反馈控制组', {
      exitNudge: basicExit,
      continueMode: 'tap_cancel',
    }),
    condition('2a', 'g2', '研究2A-G2：时间反馈-滑动继续', {
      exitNudge: { ...feedbackMessages.time, cancelText: '滑动继续观看' },
      continueMode: 'swipe_to_continue',
      swipeConfig: { direction: 'up', instructionText: '滑动继续观看' },
    }),
    condition('2a', 'g3', '研究2A-G3：条数反馈-滑动继续', {
      exitNudge: { ...feedbackMessages.count, cancelText: '滑动继续观看' },
      continueMode: 'swipe_to_continue',
      swipeConfig: { direction: 'up', instructionText: '滑动继续观看' },
    }),
    condition('2a', 'g4', '研究2A-G4：组合反馈-滑动继续', {
      exitNudge: { ...feedbackMessages.combined, cancelText: '滑动继续观看' },
      continueMode: 'swipe_to_continue',
      swipeConfig: { direction: 'up', instructionText: '滑动继续观看' },
    }),
    condition('2a', 'g5', '研究2A-G5：时间反馈-长按继续', {
      exitNudge: { ...feedbackMessages.time, cancelText: '长按继续观看' },
      continueMode: 'hold_to_continue',
      holdConfig: { requiredMs: 1500, progressText: '长按继续观看' },
    }),
    condition('2a', 'g6', '研究2A-G6：条数反馈-长按继续', {
      exitNudge: { ...feedbackMessages.count, cancelText: '长按继续观看' },
      continueMode: 'hold_to_continue',
      holdConfig: { requiredMs: 1500, progressText: '长按继续观看' },
    }),
    condition('2a', 'g7', '研究2A-G7：组合反馈-长按继续', {
      exitNudge: { ...feedbackMessages.combined, cancelText: '长按继续观看' },
      continueMode: 'hold_to_continue',
      holdConfig: { requiredMs: 1500, progressText: '长按继续观看' },
    }),

    condition('2b', 'g1', '研究2B-G1：5分钟-30%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 120 },
      visualTreatment: { grayscale: true, saturationPercent: 30, applyAtSec: 300, applyScope: 'feed' },
    }),
    condition('2b', 'g2', '研究2B-G2：5分钟-65%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 120 },
      visualTreatment: { grayscale: true, saturationPercent: 65, applyAtSec: 300, applyScope: 'feed' },
    }),
    condition('2b', 'g3', '研究2B-G3：5分钟-100%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 120 },
      visualTreatment: { grayscale: false, saturationPercent: 100, applyAtSec: 300, applyScope: 'feed' },
    }),
    condition('2b', 'g4', '研究2B-G4：10分钟-30%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 120 },
      visualTreatment: { grayscale: true, saturationPercent: 30, applyAtSec: 600, applyScope: 'feed' },
    }),
    condition('2b', 'g5', '研究2B-G5：10分钟-65%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 120 },
      visualTreatment: { grayscale: true, saturationPercent: 65, applyAtSec: 600, applyScope: 'feed' },
    }),
    condition('2b', 'g6', '研究2B-G6：10分钟-100%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 120 },
      visualTreatment: { grayscale: false, saturationPercent: 100, applyAtSec: 600, applyScope: 'feed' },
    }),
    condition('2b', 'g7', '研究2B-G7：15分钟-30%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 150 },
      visualTreatment: { grayscale: true, saturationPercent: 30, applyAtSec: 900, applyScope: 'feed' },
    }),
    condition('2b', 'g8', '研究2B-G8：15分钟-65%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 150 },
      visualTreatment: { grayscale: true, saturationPercent: 65, applyAtSec: 900, applyScope: 'feed' },
    }),
    condition('2b', 'g9', '研究2B-G9：15分钟-100%饱和度', {
      browsing: { maxDurationSec: 1200, feedLength: 150 },
      visualTreatment: { grayscale: false, saturationPercent: 100, applyAtSec: 900, applyScope: 'feed' },
    }),
  ];

  window.findExperimentCondition = function findExperimentCondition(study, conditionId) {
    return window.EXPERIMENT_CONDITIONS.find(
      (item) => item.study === String(study).toLowerCase() && item.condition === String(conditionId).toLowerCase()
    );
  };
})();
