(function () {
  const baseBrowsing = {
    minDurationSec: 600,
    maxDurationSec: 600,
    initialPromptSec: null,
    finalDurationSec: 600,
    phaseDurationSec: 600,
    twoPhase: false,
    finalPromptForced: false,
    questionnaireAfterFirstPrompt: false,
    manualExitUnlockSec: 0,
    feedLength: 300,
    allowEarlyExit: true,
    videoSelectionMode: 'weighted_random',
  };

  // 研究1A、1B、2A共用的两阶段时程：0–10分钟浏览，10分钟首次弹窗，
  // 选择继续后进入第二阶段，最长至20分钟并强制结束。
  const twoPhaseBrowsing = {
    twoPhase: true,
    minDurationSec: 600,
    maxDurationSec: 1200,
    initialPromptSec: 600,
    finalDurationSec: 1200,
    phaseDurationSec: 600,
    finalPromptForced: true,
    questionnaireAfterFirstPrompt: true,
    manualExitUnlockSec: 600,
  };

  // 研究2B的单阶段时程：呈现时间内强制观看，到点后降低饱和度并解锁退出，
  // 20分钟强制弹窗结束。基线对照组不改变饱和度，解锁时间与其配对的呈现时间一致。
  function twoBSchedule(presentationSec) {
    return {
      twoPhase: false,
      minDurationSec: presentationSec,
      maxDurationSec: 1200,
      initialPromptSec: null,
      finalDurationSec: 1200,
      finalPromptForced: true,
      questionnaireAfterFirstPrompt: false,
      manualExitUnlockSec: presentationSec,
      feedLength: 300,
    };
  }

  // 饱和度操纵：到达呈现时间点后降低饱和度；基线对照组全程不变。
  function saturationTreatment(saturationPercent, applyAtSec) {
    const reduced = saturationPercent < 100;
    return {
      grayscale: reduced,
      saturationPercent,
      applyAtSec: reduced ? applyAtSec : null,
      nominalApplyAtSec: applyAtSec,
      applyScope: 'feed',
    };
  }

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

  const genericExit = {
    type: 'basic',
    title: '观看提示',
    messageTemplate: '您确定结束本次短视频观看吗？',
    confirmText: '确认退出',
    cancelText: '继续观看',
  };

  const basicExit = genericExit;
  const timeFeedback = { enabled: true, showWatchTime: true, showViewedCount: false };
  const countFeedback = { enabled: true, showWatchTime: false, showViewedCount: true };
  const combinedFeedback = { enabled: true, showWatchTime: true, showViewedCount: true };

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
      exitNudge: { ...genericExit, ...(overrides.exitNudge || {}) },
      continueMode: overrides.continueMode || 'tap_cancel',
      holdConfig: overrides.holdConfig || null,
      swipeConfig: overrides.swipeConfig || null,
      visualTreatment: {
        grayscale: false,
        saturationPercent: 100,
        applyAtSec: null,
        nominalApplyAtSec: null,
        applyScope: 'feed',
        ...(overrides.visualTreatment || {}),
      },
      dataRecording: { ...baseRecording, ...(overrides.dataRecording || {}) },
      exitMode: overrides.exitMode || 'tap_confirm',
      exitHoldConfig: overrides.exitHoldConfig || null,
      exitFeedback: overrides.exitFeedback || null,
      completion: {
        showCompletionPage: true,
        autoRedirect: false,
        redirectDelaySec: 3,
        ...(overrides.completion || {}),
      },
      // 标记共用同一套两阶段基础流程、可复用同一对照编码的基线组。
      mergeableBaseline: overrides.mergeableBaseline === true,
      notes: overrides.notes || '',
    };
  }

  window.EXPERIMENTS = [
    {
      id: '1a',
      title: '研究1A：反馈信息对用户愉悦感的影响',
      summary: '信息反馈与简单退出界面对比；10分钟首次弹窗，最长20分钟。',
    },
    {
      id: '1b',
      title: '研究1B：灰色界面对用户自主性的影响',
      summary: '全程正常色彩与全程低饱和度界面对比；10分钟首次弹窗，最长20分钟。',
    },
    {
      id: '2a',
      title: '研究2A：反馈类型与继续方式',
      summary: '无助推基线组，以及3（反馈类型）×2（滑动继续、长按继续）共7组；10分钟首次弹窗，最长20分钟。'
    },
    {
      id: '2b',
      title: '研究2B：界面饱和度与呈现时间',
      summary: '3（呈现时间：5、10、15分钟）×2（饱和度：30%、65%）加一个饱和度不变的基线对照，共7组；呈现时间结束后降低饱和度并解锁退出，20分钟自动弹窗强制结束。',
    },
    {
      id: '3',
      title: '研究3：追踪式短视频使用助推',
      summary: '10分钟、65%饱和度、时间与条数反馈、长按退出。',
    },
  ];

  window.EXPERIMENT_CONDITIONS = [
    condition('1a', 'g1', '研究1A-G1：无反馈控制组', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: basicExit,
      exitFeedback: { enabled: false, showWatchTime: false, showViewedCount: false },
      mergeableBaseline: true,
      notes: '共同基础对照（与1B-G1、2A-G1同流程）：0–10分钟正常浏览，10分钟首次弹窗，继续后浏览至20分钟；无反馈、轻点继续、普通色彩。',
    }),
    condition('1a', 'g2', '研究1A-G2：信息反馈组', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: basicExit,
      exitFeedback: { enabled: true, showWatchTime: true, showViewedCount: true },
      notes: '与1A-G1仅以时间与条数反馈区分。',
    }),

    condition('1b', 'g1', '研究1B-G1：正常色彩组', {
      browsing: { ...twoPhaseBrowsing },
      visualTreatment: saturationTreatment(100, 0),
      exitNudge: basicExit,
      exitFeedback: { enabled: false, showWatchTime: false, showViewedCount: false },
      mergeableBaseline: true,
      notes: '共同基础对照（与1A-G1、2A-G1同流程）：全程100%正常色彩，其他流程与1B-G2一致。',
    }),
    condition('1b', 'g2', '研究1B-G2：低饱和度组', {
      browsing: { ...twoPhaseBrowsing },
      visualTreatment: saturationTreatment(30, 0),
      exitNudge: basicExit,
      exitFeedback: { enabled: false, showWatchTime: false, showViewedCount: false },
      notes: '与1B-G1仅以全程30%饱和度区分。',
    }),

    condition('2a', 'g1', '研究2A-G1：无反馈控制组', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: basicExit,
      continueMode: 'tap_cancel',
      exitFeedback: { enabled: false, showWatchTime: false, showViewedCount: false },
      mergeableBaseline: true,
      notes: '共同基础对照（与1A-G1、1B-G1同流程）：无反馈、轻点继续、普通色彩；仅可在研究编号与招募批次可比时与其他研究基线合并。2B-G6走2B自己的流程，不与本组合并。',
    }),
    condition('2a', 'g2', '研究2A-G2：时间反馈-滑动继续', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: { ...basicExit, cancelText: '滑动继续观看' },
      continueMode: 'swipe_to_continue',
      swipeConfig: { direction: 'up', instructionText: '滑动继续观看' },
      exitFeedback: timeFeedback,
    }),
    condition('2a', 'g3', '研究2A-G3：条数反馈-滑动继续', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: { ...basicExit, cancelText: '滑动继续观看' },
      continueMode: 'swipe_to_continue',
      swipeConfig: { direction: 'up', instructionText: '滑动继续观看' },
      exitFeedback: countFeedback,
    }),
    condition('2a', 'g4', '研究2A-G4：组合反馈-滑动继续', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: { ...basicExit, cancelText: '滑动继续观看' },
      continueMode: 'swipe_to_continue',
      swipeConfig: { direction: 'up', instructionText: '滑动继续观看' },
      exitFeedback: combinedFeedback,
    }),
    condition('2a', 'g5', '研究2A-G5：时间反馈-长按继续', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: { ...basicExit, cancelText: '长按继续观看' },
      continueMode: 'hold_to_continue',
      holdConfig: { requiredMs: 5000, progressText: '长按继续观看' },
      exitFeedback: timeFeedback,
    }),
    condition('2a', 'g6', '研究2A-G6：条数反馈-长按继续', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: { ...basicExit, cancelText: '长按继续观看' },
      continueMode: 'hold_to_continue',
      holdConfig: { requiredMs: 5000, progressText: '长按继续观看' },
      exitFeedback: countFeedback,
    }),
    condition('2a', 'g7', '研究2A-G7：组合反馈-长按继续', {
      browsing: { ...twoPhaseBrowsing },
      exitNudge: { ...basicExit, cancelText: '长按继续观看' },
      continueMode: 'hold_to_continue',
      holdConfig: { requiredMs: 5000, progressText: '长按继续观看' },
      exitFeedback: combinedFeedback,
    }),

    // 研究2B：3（呈现时间：5/10/15分钟）×2（饱和度：30%/65%）+ 基线对照，共7组。
    // 沿用原有编号，g3/g9（原100%组）已移除，g6 为新的基线对照组。
    condition('2b', 'g1', '研究2B-G1：5分钟-30%饱和度', {
      browsing: twoBSchedule(300),
      visualTreatment: saturationTreatment(30, 300),
    }),
    condition('2b', 'g2', '研究2B-G2：5分钟-65%饱和度', {
      browsing: twoBSchedule(300),
      visualTreatment: saturationTreatment(65, 300),
    }),
    condition('2b', 'g4', '研究2B-G4：10分钟-30%饱和度', {
      browsing: twoBSchedule(600),
      visualTreatment: saturationTreatment(30, 600),
    }),
    condition('2b', 'g5', '研究2B-G5：10分钟-65%饱和度', {
      browsing: twoBSchedule(600),
      visualTreatment: saturationTreatment(65, 600),
    }),
    condition('2b', 'g7', '研究2B-G7：15分钟-30%饱和度', {
      browsing: twoBSchedule(900),
      visualTreatment: saturationTreatment(30, 900),
    }),
    condition('2b', 'g8', '研究2B-G8：15分钟-65%饱和度', {
      browsing: twoBSchedule(900),
      visualTreatment: saturationTreatment(65, 900),
    }),
    condition('2b', 'g6', '研究2B-G6：基线对照组（饱和度不变）', {
      browsing: twoBSchedule(600),
      visualTreatment: saturationTreatment(100, null),
      exitFeedback: { enabled: false, showWatchTime: false, showViewedCount: false },
      notes: '基线对照：0–20分钟全程100%饱和度，不发生视觉切换；解锁时间取10分钟（呈现时间中间水平），其余流程与2B各实验组一致。',
    }),

    condition('3', 'g1', '研究3-G1：追踪实验组', {
      browsing: { minDurationSec: 600, maxDurationSec: 600, trackingDurationSec: 600, feedLength: 300 },
      visualTreatment: { ...saturationTreatment(65, 0), brightnessPercent: 100 },
      exitFeedback: { enabled: true, showWatchTime: true, showViewedCount: true },
      exitMode: 'hold_to_exit',
      exitHoldConfig: { requiredMs: 5000, progressText: '长按确认退出' },
      notes: '10分钟、65%饱和度、有效观看时长与浏览条数双反馈、长按退出。',
    }),
  ];

  window.findExperimentCondition = function findExperimentCondition(study, conditionId) {
    return window.EXPERIMENT_CONDITIONS.find(
      (item) => item.study === String(study).toLowerCase() && item.condition === String(conditionId).toLowerCase()
    );
  };
})();
