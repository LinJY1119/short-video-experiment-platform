const params = new URLSearchParams(window.location.search);
const DEBUG = params.get('debug') === '1';
const sessionId = params.get('sessionId') || '';
const INCLUDE_EVENT_LOG = params.get('events') !== '0';
const SPEED_RATE = 2.0;
const SWIPE_THRESHOLD_PX = 36;
const SWIPE_LOCKOUT_MS = 280;
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 300;

const target = document.getElementById('experiment-target');
const storedCondition = sessionId ? window.sessionStorage.getItem(`condition_${sessionId}`) : null;
const storedFeed = sessionId ? window.sessionStorage.getItem(`feed_${sessionId}`) : null;
const storedMeta = sessionId ? window.sessionStorage.getItem(`session_meta_${sessionId}`) : null;

let sessionMeta = null;
if (storedMeta) {
  try {
    sessionMeta = JSON.parse(storedMeta);
  } catch (error) {
    sessionMeta = null;
  }
}

const condition = storedCondition
  ? JSON.parse(storedCondition)
  : window.findExperimentCondition(params.get('study') || '1a', params.get('condition') || 'g1');

const fallbackCategories = sessionMeta?.selectedCategories || ['life_record'];
const participantName = sessionMeta?.participantName || params.get('name') || '';
const returnUrl = sessionMeta?.returnUrl || params.get('returnUrl') || '';
const feed = storedFeed
  ? JSON.parse(storedFeed)
  : window.Recommendation.buildRecommendedFeed({
      assets: window.VIDEO_ASSETS,
      selectedCategories: fallbackCategories,
      feedLength: condition?.browsing?.feedLength || 80,
      preferredRatio: condition?.recommendation?.preferredRatio ?? 0.7,
      seed: sessionId || 'fallback',
    });

const TIME_CAP_MS = Number(params.get('cap') || condition?.browsing?.maxDurationSec || 0) * 1000;

const ICONS = {
  heart: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 42.7l-2.6-2.3C11.5 31.6 5 25.7 5 18.5 5 12.7 9.6 8 15.4 8c3.3 0 6.4 1.5 8.6 4 2.2-2.5 5.3-4 8.6-4C38.4 8 43 12.7 43 18.5c0 7.2-6.5 13.1-16.4 21.9L24 42.7z"/></svg>',
  bubble: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5C13 5 4 12.3 4 21.4c0 5.1 2.9 9.7 7.4 12.7-.2 2.5-1.3 5.2-3.2 7.7-.5.6.1 1.5.8 1.3 4.4-1.1 7.9-3 10.5-5.2 1.5.3 3 .4 4.5.4 11 0 20-7.3 20-16.9C44 12.3 35 5 24 5z"/></svg>',
  star: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3.5l6.3 12.8 14.1 2-10.2 10 2.4 14.1L24 35.7 11.4 42.4l2.4-14.1-10.2-10 14.1-2z"/></svg>',
  share: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27.6 6.8c0-1.5 1.8-2.3 2.9-1.3l14.1 13.2c.8.7.8 1.9 0 2.6L30.5 34.5c-1.1 1-2.9.2-2.9-1.3v-6.4c-11.1.2-18.6 3-23 8.6-.9 1.2-2.8.5-2.6-1 1.6-13 9.9-20.4 25.6-21.3V6.8z"/></svg>',
  music: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M41 4.6L17.5 9.9v22.4A8.4 8.4 0 1 0 21.7 39V19.2l15.1-3.4v12.5A8.4 8.4 0 1 0 41 34.6z"/></svg>',
  back: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M30 8L14 24l16 16"/></svg>',
  search: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" aria-hidden="true"><circle cx="20.5" cy="20.5" r="13.5"/><path d="M30.5 30.5L42 42"/></svg>',
  fast: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 10l16 14L4 38V10zm22 0l16 14-16 14V10z"/></svg>',
  signal: '<svg viewBox="0 0 20 14" aria-hidden="true"><rect x="0" y="9" width="3" height="5" rx="1"/><rect x="5" y="6" width="3" height="8" rx="1"/><rect x="10" y="3" width="3" height="11" rx="1"/><rect x="15" y="0" width="3" height="14" rx="1"/></svg>',
  wifi: '<svg viewBox="0 0 20 14" aria-hidden="true"><path d="M10 13.4l-3-3.6a4.7 4.7 0 016 0l-3 3.6zM3.6 6.1A10.2 10.2 0 0110 3.8c2.4 0 4.7.8 6.4 2.3l-1.6 1.9A7.7 7.7 0 0010 6.3c-1.8 0-3.5.6-4.8 1.7L3.6 6.1zM.6 2.6A14.7 14.7 0 0110 0c3.5 0 6.8 1 9.4 2.6l-1.6 1.9A12.2 12.2 0 0010 2.5c-2.9 0-5.6.7-7.8 2L.6 2.6z"/></svg>',
  battery: '<svg viewBox="0 0 26 14" aria-hidden="true"><rect x="0.5" y="0.5" width="21" height="13" rx="4" fill="none" stroke="#fff" stroke-opacity=".5"/><rect x="2.5" y="2.5" width="14" height="9" rx="2.5"/><path d="M23.5 5v4a2.6 2.6 0 000-4z"/></svg>',
};

let events = [];
let startedAt = 0;
let startEpoch = 0;

function nowMs() {
  return Math.round(performance.now() - startedAt);
}

function logEvent(type, detail = {}) {
  events.push({
    type,
    timestamp: Date.now(),
    elapsed_ms: startedAt ? nowMs() : 0,
    stage: 'content',
    target: detail.target ?? null,
    x: detail.x ?? null,
    y: detail.y ?? null,
    duration: detail.duration ?? null,
    value: detail.value ?? null,
  });
}

function formatCount(n) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return String(n);
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}分${String(sec).padStart(2, '0')}秒`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(template, state) {
  return String(template || '')
    .replace(/{{\s*viewed_count\s*}}/g, String(state.visited.size))
    .replace(/{{\s*watch_time\s*}}/g, formatDuration(nowMs()));
}

function renderPlainStage(html) {
  target.innerHTML = `<div class="plain-stage">${html}</div>`;
}

function showLaunchError() {
  renderPlainStage(`
    <h1>无法启动实验</h1>
    <p>缺少实验条件或视频序列。请从入口页重新进入。</p>
    <div class="stage-actions"><button type="button" class="runner-btn" id="backHomeBtn">返回入口</button></div>
  `);
  document.getElementById('backHomeBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

function showIntro() {
  void window.ExperimentStore.upsert('participant_sessions', {
    id: sessionId,
    participantName,
    returnUrl,
    selectedCategories: fallbackCategories,
    status: 'runner_ready',
  });
  renderPlainStage(`
    <h1>短视频浏览任务</h1>
    <p>接下来你将进入一个短视频信息流界面。系统已根据你选择的内容类型生成推荐序列。</p>
    <ul>
      <li>在屏幕中间<strong>上滑</strong>切换到下一条，<strong>下滑</strong>回到上一条。</li>
      <li>按住屏幕<strong>左侧或右侧边缘</strong>为 2 倍速播放，松开恢复正常速度。</li>
      <li>轻点屏幕中间可开启或关闭声音。</li>
      <li>如需退出，页面会先提示你返回见数继续完成问卷；完成后可按按钮继续观看或查看完成码。</li>
    </ul>
    <p>请按自己平时的习惯自由浏览。</p>
    <div class="stage-actions"><button type="button" class="runner-btn" id="startFeedBtn">开始浏览</button></div>
  `);
  document.getElementById('startFeedBtn').addEventListener('click', startFeed);
}

function slideHTML(item, index) {
  return `
    <div class="slide" data-index="${index}" data-sample="${escapeHtml(item.sample_id)}">
      <div class="slide__fallback" style="background:${item.palette}"></div>
      <video
        data-index="${index}"
        data-src="${escapeHtml(item.video)}"
        data-poster="${escapeHtml(item.cover)}"
        preload="none"
        loop
        muted
        playsinline
        webkit-playsinline
        disablepictureinpicture
      ></video>
    </div>
  `;
}

function actionsHTML(item) {
  return `
    <div class="actions">
      <button type="button" class="action action--avatar" data-action="follow">
        <span class="avatar" style="background-image:url('${escapeHtml(item.cover)}')"></span>
        <span class="avatar-plus">+</span>
      </button>
      <button type="button" class="action action--like" data-action="like">${ICONS.heart}<span class="action__count" data-count="like">${formatCount(item.like_count)}</span></button>
      <button type="button" class="action action--comment" data-action="comment">${ICONS.bubble}<span class="action__count">${formatCount(item.comment_count)}</span></button>
      <button type="button" class="action action--favorite" data-action="favorite">${ICONS.star}<span class="action__count" data-count="favorite">${formatCount(item.favorite_count)}</span></button>
      <button type="button" class="action action--share" data-action="share">${ICONS.share}<span class="action__count">${formatCount(item.share_count)}</span></button>
      <span class="disc">${ICONS.music}</span>
    </div>
  `;
}

function captionHTML(item) {
  const tags = (item.hashtags || []).map((t) => `<span class="caption__tag">#${escapeHtml(t)}</span>`).join('');
  return `
    <div class="caption">
      <p class="caption__author">@${escapeHtml(item.uploader_name)}</p>
      <p class="caption__text">${escapeHtml(item.caption)} ${tags}</p>
      <div class="caption__music">${ICONS.music}<span>${escapeHtml(item.music || '原声')}</span></div>
    </div>
  `;
}

function statusBarHTML() {
  return `
    <div class="status-bar">
      <span>21:47</span>
      <span class="status-bar__right">${ICONS.signal}${ICONS.wifi}${ICONS.battery}</span>
    </div>
  `;
}

function feedHTML(feedItems) {
  const first = feedItems[0];
  return `
    <div class="feed is-hinting" id="feed">
      <div class="feed__visual" id="feedVisual">
        <div class="feed__track" id="feedTrack">${feedItems.map(slideHTML).join('')}</div>
      </div>
      <button type="button" class="zone zone--left" id="zoneLeft" aria-label="按住左侧边缘 2 倍速"></button>
      <button type="button" class="zone zone--right" id="zoneRight" aria-label="按住右侧边缘 2 倍速"></button>
      <button type="button" class="zone zone--middle" id="zoneMiddle" aria-label="上滑切换下一条"></button>
      <div class="edge-hint edge-hint--left"></div>
      <div class="edge-hint edge-hint--right"></div>
      ${statusBarHTML()}
      <div class="speed-banner" id="speedBanner">${ICONS.fast}<span>${SPEED_RATE.toFixed(1)} 倍速播放中</span></div>
      <div class="topbar">
        <button type="button" class="icon-btn" id="exitBtn" aria-label="退出">${ICONS.back}</button>
        <div class="tabs"><span>关注</span><span class="is-active">推荐</span></div>
        <button type="button" class="icon-btn" id="searchBtn" aria-label="搜索">${ICONS.search}</button>
      </div>
      <div id="actionsSlot">${actionsHTML(first)}</div>
      <div id="captionSlot">${captionHTML(first)}</div>
      <div class="sound-hint" id="soundHint">轻点画面开启声音</div>
      <div class="swipe-hint" id="swipeHint">上滑查看下一条</div>
      <div class="progress"><span id="progressFill"></span></div>
      <div class="exit-layer" id="exitLayer"><div class="exit-card" id="exitCard"></div></div>
      <div class="debug ${DEBUG ? 'is-on' : ''}" id="debugBox"></div>
    </div>
  `;
}

function metricsHTML() {
  return '';
}

function startFeed() {
  startedAt = performance.now();
  startEpoch = Date.now();
  events = [];
  target.innerHTML = feedHTML(feed);
  void window.ExperimentStore.upsert('participant_sessions', {
    id: sessionId,
    participantName,
    returnUrl,
    selectedCategories: fallbackCategories,
    status: 'feed_started',
    feedStartedAt: Date.now(),
  });

  const feedEl = document.getElementById('feed');
  const feedVisual = document.getElementById('feedVisual');
  const track = document.getElementById('feedTrack');
  const videos = Array.from(track.querySelectorAll('video'));
  const slides = Array.from(track.querySelectorAll('.slide'));
  const zoneMiddle = document.getElementById('zoneMiddle');
  const zoneLeft = document.getElementById('zoneLeft');
  const zoneRight = document.getElementById('zoneRight');
  const speedBanner = document.getElementById('speedBanner');
  const actionsSlot = document.getElementById('actionsSlot');
  const captionSlot = document.getElementById('captionSlot');
  const progressFill = document.getElementById('progressFill');
  const soundHint = document.getElementById('soundHint');
  const swipeHint = document.getElementById('swipeHint');
  const exitBtn = document.getElementById('exitBtn');
  const searchBtn = document.getElementById('searchBtn');
  const exitLayer = document.getElementById('exitLayer');
  const exitCard = document.getElementById('exitCard');
  const debugBox = document.getElementById('debugBox');

  const state = {
    index: 0,
    enterAt: performance.now(),
    lastSwipeAt: 0,
    swipeNext: 0,
    swipePrev: 0,
    speedCount: 0,
    speedTotalMs: 0,
    speedStartAt: null,
    speedZone: null,
    actionTaps: 0,
    likes: new Set(),
    favorites: new Set(),
    follows: new Set(),
    visited: new Set([0]),
    dwellMs: new Array(feed.length).fill(0),
    exitOpened: 0,
    firstExitAttemptMs: null,
    exitPromptShownAt: null,
    exitReason: null,
    timeCapChoice: null,
    cancelCount: 0,
    unmuted: false,
    capTimer: null,
    visualTimer: null,
    finished: false,
  };

  slides.forEach((slide, i) => {
    slide.style.top = `${i * 100}%`;
    slide.style.left = '0';
  });

  const activeVideo = () => videos[state.index];

  function applyVisualTreatment() {
    const saturation = Number(condition.visualTreatment.saturationPercent || 100) / 100;
    feedVisual.style.setProperty('--feed-saturation', String(saturation));
    feedVisual.style.setProperty('--feed-brightness', saturation < 1 ? '0.92' : '1');
    logEvent('visual-treatment-applied', { target: 'feed', value: String(condition.visualTreatment.saturationPercent) });
  }

  function scheduleVisualTreatment() {
    if (!condition.visualTreatment.grayscale && condition.visualTreatment.saturationPercent >= 100) return;
    const delay = Math.max(0, Number(condition.visualTreatment.applyAtSec || 0) * 1000);
    if (delay === 0) applyVisualTreatment();
    else state.visualTimer = window.setTimeout(applyVisualTreatment, delay);
  }

  function ensureVideoLoaded(index, preload = 'metadata') {
    const video = videos[index];
    if (!video || video.dataset.loaded === '1') return video;
    const src = video.dataset.src;
    const poster = video.dataset.poster;
    if (poster) video.setAttribute('poster', poster);
    if (src) {
      video.preload = preload;
      video.src = src;
      video.dataset.loaded = '1';
      video.load();
      logEvent('video-lazy-load', { target: 'video_slide', value: feed[index]?.sample_id });
    }
    return video;
  }

  function unloadVideo(index) {
    const video = videos[index];
    if (!video || video.dataset.loaded !== '1') return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.dataset.loaded = '0';
    logEvent('video-unload', { target: 'video_slide', value: feed[index]?.sample_id });
  }

  function prepareNearbyVideos() {
    ensureVideoLoaded(state.index, 'auto');
    ensureVideoLoaded(state.index + 1, 'metadata');
    ensureVideoLoaded(state.index - 1, 'metadata');
  }

  function playActive() {
    const video = ensureVideoLoaded(state.index, 'auto');
    if (!video) return;
    video.playbackRate = state.speedZone ? SPEED_RATE : 1;
    video.muted = !state.unmuted;
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => logEvent('autoplay-blocked', { value: feed[state.index].sample_id }));
    }
  }

  function pauseOthers() {
    videos.forEach((video, i) => {
      if (i !== state.index) {
        video.pause();
        if (Math.abs(i - state.index) > 1) {
          video.currentTime = 0;
          unloadVideo(i);
        }
      }
    });
    prepareNearbyVideos();
  }

  videos.forEach((video) => {
    video.addEventListener('error', () => {
      video.closest('.slide').classList.add('is-fallback');
      logEvent('video-load-error', { value: video.getAttribute('src') });
    });
    video.addEventListener('timeupdate', () => {
      if (video !== activeVideo() || !video.duration || isNaN(video.duration)) return;
      progressFill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    });
  });

  function renderOverlay() {
    const item = feed[state.index];
    actionsSlot.innerHTML = actionsHTML(item);
    captionSlot.innerHTML = captionHTML(item);

    const likeBtn = actionsSlot.querySelector('.action--like');
    if (state.likes.has(state.index) && likeBtn) {
      likeBtn.classList.add('is-active');
      likeBtn.querySelector('[data-count="like"]').textContent = formatCount(item.like_count + 1);
    }
    const favBtn = actionsSlot.querySelector('.action--favorite');
    if (state.favorites.has(state.index) && favBtn) {
      favBtn.classList.add('is-active');
      favBtn.querySelector('[data-count="favorite"]').textContent = formatCount(item.favorite_count + 1);
    }
    const followBtn = actionsSlot.querySelector('.action--avatar');
    if (state.follows.has(item.sample_id) && followBtn) {
      followBtn.classList.add('is-followed');
      followBtn.querySelector('.avatar-plus').textContent = '✓';
    }
    bindActions();
  }

  function goTo(nextIndex, method, detail = {}) {
    if (state.finished) return;
    const targetIndex = Math.max(0, Math.min(feed.length - 1, nextIndex));
    if (targetIndex === state.index) {
      if (method === 'swipe-next') logEvent('feed-end-reached', { target: 'video_middle_zone', value: feed[state.index].sample_id });
      return;
    }
    const dwell = Math.round(performance.now() - state.enterAt);
    state.dwellMs[state.index] += dwell;
    logEvent('video-dwell', { target: 'video_slide', duration: dwell, value: feed[state.index].sample_id });
    const forward = targetIndex > state.index;
    if (forward) state.swipeNext += 1;
    else state.swipePrev += 1;
    logEvent(forward ? 'middle-swipe-next' : 'middle-swipe-prev', {
      target: 'video_middle_zone',
      x: detail.x ?? null,
      y: detail.y ?? null,
      duration: detail.duration ?? null,
      value: feed[targetIndex].sample_id,
    });
    state.index = targetIndex;
    state.enterAt = performance.now();
    state.visited.add(targetIndex);
    track.style.transform = `translateY(-${targetIndex * 100}%)`;
    progressFill.style.width = '0%';
    renderOverlay();
    pauseOthers();
    playActive();
    swipeHint.classList.add('is-hidden');
    renderDebug('swipe');
  }

  let touchStart = null;

  function swipeStart(x, y) {
    touchStart = { at: performance.now(), x, y };
  }

  function swipeEnd(x, y) {
    const start = touchStart;
    touchStart = null;
    if (!start) return;
    const deltaX = Math.round(x - start.x);
    const deltaY = Math.round(y - start.y);
    const duration = Math.round(performance.now() - start.at);
    if (Math.abs(deltaY) < TAP_MAX_MOVE_PX && Math.abs(deltaX) < TAP_MAX_MOVE_PX && duration < TAP_MAX_MS) {
      toggleSound(x, y);
      return;
    }
    if (Math.abs(deltaY) <= SWIPE_THRESHOLD_PX || Math.abs(deltaY) <= Math.abs(deltaX)) return;
    const now = performance.now();
    if (now - state.lastSwipeAt < SWIPE_LOCKOUT_MS) return;
    state.lastSwipeAt = now;
    goTo(state.index + (deltaY < 0 ? 1 : -1), deltaY < 0 ? 'swipe-next' : 'swipe-prev', { x, y, duration });
  }

  zoneMiddle.addEventListener('pointerdown', (e) => {
    zoneMiddle.setPointerCapture?.(e.pointerId);
    swipeStart(Math.round(e.clientX), Math.round(e.clientY));
  });
  zoneMiddle.addEventListener('pointerup', (e) => swipeEnd(Math.round(e.clientX), Math.round(e.clientY)));
  zoneMiddle.addEventListener('pointercancel', () => { touchStart = null; });
  zoneMiddle.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipeStart(Math.round(t.clientX), Math.round(t.clientY));
  }, { passive: true });
  zoneMiddle.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    swipeEnd(Math.round(t.clientX), Math.round(t.clientY));
  });

  function speedStart(zone, e) {
    e.preventDefault();
    if (state.speedZone || state.finished) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    state.speedZone = zone;
    state.speedStartAt = performance.now();
    state.speedCount += 1;
    const video = activeVideo();
    if (video) video.playbackRate = SPEED_RATE;
    speedBanner.classList.add('is-on');
    logEvent('speed-2x-start', { target: `${zone}_edge_zone`, x: Math.round(e.clientX), y: Math.round(e.clientY), value: `${SPEED_RATE}x` });
    renderDebug('speed_start');
  }

  function speedEnd(zone, e) {
    if (state.speedZone !== zone) return;
    const duration = Math.round(performance.now() - state.speedStartAt);
    state.speedTotalMs += duration;
    state.speedZone = null;
    state.speedStartAt = null;
    const video = activeVideo();
    if (video) video.playbackRate = 1;
    speedBanner.classList.remove('is-on');
    logEvent('speed-2x-end', { target: `${zone}_edge_zone`, x: e ? Math.round(e.clientX) : null, y: e ? Math.round(e.clientY) : null, duration, value: '1x' });
    renderDebug('speed_end');
  }

  [['left', zoneLeft], ['right', zoneRight]].forEach(([zone, el]) => {
    el.addEventListener('pointerdown', (e) => speedStart(zone, e));
    ['pointerup', 'pointercancel'].forEach((evt) => el.addEventListener(evt, (e) => speedEnd(zone, e)));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  });

  window.addEventListener('pointerup', (e) => {
    if (state.speedZone) speedEnd(state.speedZone, e);
  });

  function toggleSound(x, y) {
    const video = activeVideo();
    if (!video) return;
    state.unmuted = !state.unmuted;
    video.muted = !state.unmuted;
    soundHint.classList.toggle('is-hidden', state.unmuted);
    logEvent(state.unmuted ? 'sound-on' : 'sound-off', { target: 'video_middle_zone', x, y });
    if (state.unmuted) playActive();
  }

  function bindActions() {
    actionsSlot.querySelectorAll('.action').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        const action = btn.dataset.action;
        const item = feed[state.index];
        state.actionTaps += 1;
        if (action === 'like') {
          const on = !state.likes.has(state.index);
          if (on) state.likes.add(state.index); else state.likes.delete(state.index);
          btn.classList.toggle('is-active', on);
          btn.querySelector('[data-count="like"]').textContent = formatCount(item.like_count + (on ? 1 : 0));
        }
        if (action === 'favorite') {
          const on = !state.favorites.has(state.index);
          if (on) state.favorites.add(state.index); else state.favorites.delete(state.index);
          btn.classList.toggle('is-active', on);
          btn.querySelector('[data-count="favorite"]').textContent = formatCount(item.favorite_count + (on ? 1 : 0));
        }
        if (action === 'follow') {
          const on = !state.follows.has(item.sample_id);
          if (on) state.follows.add(item.sample_id); else state.follows.delete(item.sample_id);
          btn.classList.toggle('is-followed', on);
          btn.querySelector('.avatar-plus').textContent = on ? '✓' : '+';
        }
        logEvent('tap', { target: `action_${action}`, x: Math.round(e.clientX), y: Math.round(e.clientY), value: item.sample_id });
        renderDebug(`tap_${action}`);
      });
    });
  }

  searchBtn.addEventListener('pointerdown', (e) => {
    state.actionTaps += 1;
    logEvent('tap', { target: 'action_search', x: Math.round(e.clientX), y: Math.round(e.clientY), value: feed[state.index].sample_id });
  });

  function renderExitCard() {
    const message = condition.exitNudge.messageTemplate || '感谢观看视频，您现在需要去见数继续完成问卷。';
    const cancelText = escapeHtml(condition.exitNudge.cancelText || '继续观看');
    const secondary = condition.continueMode === 'hold_to_continue'
      ? `<button type="button" class="card-btn card-btn--secondary" id="cancelExitBtn"><span class="card-btn__progress" id="holdProgress"></span><span>${cancelText}</span></button>`
      : condition.continueMode === 'swipe_to_continue'
        ? `<div class="swipe-continue-slider" id="continueSlider">
            <div class="swipe-continue-slider__label">左右拖动滑块继续观看</div>
            <div class="swipe-continue-slider__track" id="continueSliderTrack">
              <div class="swipe-continue-slider__fill" id="continueSliderFill"></div>
              <button type="button" class="swipe-continue-slider__thumb" id="continueSliderThumb" aria-label="左右拖动滑块继续观看">↔</button>
            </div>
          </div>`
        : `<button type="button" class="card-btn card-btn--secondary" id="cancelExitBtn"><span>${cancelText}</span></button>`;
    exitCard.innerHTML = `
      <h2>${escapeHtml(condition.exitNudge.title || '观看提示')}</h2>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="card-btn card-btn--primary" id="confirmExitBtn"><span>${escapeHtml(condition.exitNudge.confirmText || '确认退出')}</span></button>
      ${secondary}
    `;

    exitCard.querySelector('#confirmExitBtn').addEventListener('click', () => {
      if (state.exitReason === 'time_cap') {
        state.timeCapChoice = 'confirm_exit_button';
        logEvent('time-cap-choice', { target: 'confirm_exit_button', value: feed[state.index].sample_id });
        state.exitPromptShownAt = null;
        state.exitReason = null;
        showQuestionnaireReminder('finish');
        renderDebug('time_cap_posttest');
        return;
      }
      void finish('confirm_exit_button');
    });
    const cancelBtn = exitCard.querySelector('#cancelExitBtn');
    const continueSlider = exitCard.querySelector('#continueSlider');
    if (condition.continueMode === 'hold_to_continue' && cancelBtn) bindHoldContinue(cancelBtn);
    else if (condition.continueMode === 'swipe_to_continue' && continueSlider) bindSwipeContinue(continueSlider);
    else if (cancelBtn) cancelBtn.addEventListener('click', cancelExit);
  }

  function renderBlockingNotice() {
    const video = activeVideo();
    if (video) video.pause();
    exitCard.innerHTML = `
      <h2>还未完成实验</h2>
      <p>还未完成实验，再耐心刷一会儿。</p>
      <button type="button" class="card-btn card-btn--primary" id="blockingOkBtn"><span>继续刷视频</span></button>
    `;
    exitLayer.classList.add('is-open');
    document.getElementById('blockingOkBtn').addEventListener('click', () => {
      exitLayer.classList.remove('is-open');
      playActive();
      renderDebug('exit_blocked_dismissed');
    });
  }

  function showQuestionnaireReminder(mode = 'resume') {
    const buttonText = mode === 'finish' ? '我已完成，查看完成码' : '我已完成，继续观看';
    const buttonAction = mode === 'finish' ? '查看完成码' : '继续观看';
    const video = activeVideo();
    if (video) video.pause();
    exitCard.innerHTML = `
      <h2>观看提示</h2>
      <p>感谢观看视频，您现在需要去见数继续完成问卷。完成后点击下方按钮${buttonAction}。</p>
      <button type="button" class="card-btn card-btn--primary" id="questionnaireDoneBtn"><span>${buttonText}</span></button>
    `;
    exitLayer.classList.add('is-open');
    document.getElementById('questionnaireDoneBtn').addEventListener('click', async () => {
      exitLayer.classList.remove('is-open');
      state.exitPromptShownAt = null;
      state.exitReason = null;
      if (mode === 'finish') {
        await finish('time_cap_posttest_done');
        return;
      }
      playActive();
      renderDebug('resume_after_questionnaire');
    });
  }

  function openExit(e, reason = 'manual') {
    if (exitLayer.classList.contains('is-open')) return;
    const unlockAtMs = condition.study === '2b'
      ? Number(condition.visualTreatment.applyAtSec || 0) * 1000
      : 0;
    if (unlockAtMs > 0 && nowMs() < unlockAtMs) {
      logEvent('exit-blocked', { target: 'exit_button', x: e ? Math.round(e.clientX) : null, y: e ? Math.round(e.clientY) : null, value: feed[state.index].sample_id });
      renderBlockingNotice();
      return;
    }
    state.exitOpened += 1;
    state.exitPromptShownAt = performance.now();
    state.exitReason = reason;
    if (state.firstExitAttemptMs === null) state.firstExitAttemptMs = nowMs();
    const video = activeVideo();
    if (video) video.pause();
    renderExitCard();
    exitLayer.classList.add('is-open');
    logEvent('exit-prompt-open', { target: reason === 'time_cap' ? 'time_cap' : 'exit_button', x: e ? Math.round(e.clientX) : null, y: e ? Math.round(e.clientY) : null, value: feed[state.index].sample_id });
    renderDebug('open_exit');
  }

  function cancelExit(method = 'cancel_exit_button') {
    state.cancelCount += 1;
    logEvent('exit-prompt-cancel', { target: method, duration: Math.round(performance.now() - state.exitPromptShownAt), value: feed[state.index].sample_id });
    const exitReason = state.exitReason;
    state.exitPromptShownAt = null;
    state.exitReason = null;
    if (exitReason === 'time_cap') {
      state.timeCapChoice = 'cancel_exit_button';
      logEvent('time-cap-choice', { target: 'cancel_exit_button', value: feed[state.index].sample_id });
      showQuestionnaireReminder('finish');
      renderDebug('time_cap_posttest');
      return;
    }
    showQuestionnaireReminder('resume');
    renderDebug('questionnaire_reminder');
  }

  async function finish(method) {
    if (state.finished) return;
    state.finished = true;
    if (state.capTimer) window.clearTimeout(state.capTimer);
    if (state.visualTimer) window.clearTimeout(state.visualTimer);
    state.dwellMs[state.index] += Math.round(performance.now() - state.enterAt);
    if (state.speedZone) state.speedTotalMs += Math.round(performance.now() - state.speedStartAt);
    videos.forEach((v) => v.pause());
    const decisionLatency = state.exitPromptShownAt ? Math.round(performance.now() - state.exitPromptShownAt) : null;
    const exitEpochMs = Date.now();
    const totalFeedMs = nowMs();
    logEvent('feed-finish', { target: method, value: feed[state.index].sample_id });

    const summary = {
      session_id: sessionId,
      participantName,
      study: condition.study,
      condition: condition.condition,
      exit_method: method,
      time_cap_choice: state.timeCapChoice ?? '',
      start_epoch_ms: startEpoch,
      exit_epoch_ms: exitEpochMs,
      videos_viewed: state.visited.size,
      last_index: state.index,
      total_feed_ms: totalFeedMs,
      total_dwell_ms: state.dwellMs.reduce((a, b) => a + b, 0),
      swipe_next_count: state.swipeNext,
      swipe_prev_count: state.swipePrev,
      speed_2x_count: state.speedCount,
      speed_2x_total_ms: state.speedTotalMs,
      action_tap_count: state.actionTaps,
      like_count: state.likes.size,
      favorite_count: state.favorites.size,
      follow_count: state.follows.size,
      sound_unmuted: state.unmuted ? 1 : 0,
      exit_prompt_count: state.exitOpened,
      exit_cancel_count: state.cancelCount,
      first_exit_attempt_ms: state.firstExitAttemptMs ?? '',
      exit_decision_latency_ms: decisionLatency ?? '',
      watch_ms_after_first_exit_attempt: state.firstExitAttemptMs === null ? '' : nowMs() - state.firstExitAttemptMs,
      dwell_ms_per_slide: state.dwellMs.join('|'),
      event_count: events.length,
    };

    const completionCode = `C-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await Promise.all([
      window.ExperimentStore.upsert('feed_summaries', {
        id: `summary_${sessionId}`,
        participantName,
        returnUrl,
        ...summary,
      }),
      INCLUDE_EVENT_LOG
        ? window.ExperimentStore.upsert('feed_events', {
            id: `events_${sessionId}_001`,
            sessionId,
            participantName,
            returnUrl,
            study: condition.study,
            condition: condition.condition,
            chunkIndex: 1,
            events,
          })
        : Promise.resolve(),
      window.ExperimentStore.upsert('completion_records', {
        id: `complete_${sessionId}`,
        sessionId,
        participantName,
        study: condition.study,
        condition: condition.condition,
        completed: true,
        completionCode,
        returnUrl,
        redirectedAt: null,
      }),
      window.ExperimentStore.upsert('participant_sessions', {
        id: sessionId,
        participantName,
        returnUrl,
        selectedCategories: fallbackCategories,
        status: 'feed_completed',
        feedStartedAt: startEpoch,
        completedAt: exitEpochMs,
        completionCode,
      }),
    ]);
    showOutro(summary, completionCode);
  }

  function renderDebug(action) {
    if (!DEBUG) return;
    debugBox.textContent = [
      `action: ${action}`,
      `condition: ${condition.study}/${condition.condition}`,
      `index: ${state.index + 1}/${feed.length}  ${feed[state.index].sample_id}`,
      `elapsed: ${nowMs()} ms`,
      `swipe: ↑${state.swipeNext} ↓${state.swipePrev}`,
      `2x: ${state.speedCount} 次 / ${state.speedTotalMs} ms`,
      `taps: ${state.actionTaps}  like:${state.likes.size} fav:${state.favorites.size}`,
      `exit: ${state.exitOpened} 次  取消 ${state.cancelCount} 次`,
    ].join('\n');
  }

  exitBtn.addEventListener('click', openExit);
  if (TIME_CAP_MS > 0) state.capTimer = window.setTimeout(() => { openExit(null, 'time_cap'); }, TIME_CAP_MS);
  scheduleVisualTreatment();
  renderOverlay();
  playActive();
  renderDebug('feed_start');
  logEvent('feed-start', { value: feed[0].sample_id });
  window.setTimeout(() => feedEl.classList.remove('is-hinting'), 2200);
  window.setTimeout(() => swipeHint.classList.add('is-hidden'), 6000);
}

function showOutro(summary, completionCode) {
  renderPlainStage(`
    <h1>感谢观看视频</h1>
    <p>您现在需要去见数继续完成问卷。完成后请返回本页面复制下方完成码并填写。</p>
    <div class="completion-code-box">
      <span class="completion-code-label">完成码</span>
      <strong id="completionCodeText">${escapeHtml(completionCode || '')}</strong>
    </div>
    <div class="stage-actions"><button type="button" class="runner-btn" id="copyCodeBtn">点击复制完成码</button></div>
    <p class="copy-feedback" id="copyFeedback" aria-live="polite"></p>
  `);
  const copyBtn = document.getElementById('copyCodeBtn');
  const codeText = document.getElementById('completionCodeText');
  const feedback = document.getElementById('copyFeedback');
  copyBtn.addEventListener('click', async () => {
    const code = codeText.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      feedback.textContent = '已复制完成码，请返回见数手动填写。';
    } catch (error) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(codeText);
      selection.removeAllRanges();
      selection.addRange(range);
      feedback.textContent = '请手动长按复制完成码，再返回见数填写。';
    }
  });
}

if (!condition || !feed.length || !target) {
  showLaunchError();
} else {
  showIntro();
}
