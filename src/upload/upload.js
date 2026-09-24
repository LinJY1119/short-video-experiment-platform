(function () {
  // Batch uploader for experiment stimuli.
  //
  // Everything the video_assets index needs is already available in the browser at
  // upload time: the category comes from the folder the file sits in, duration and
  // resolution from a <video> element, and the cover from a canvas frame grab. So the
  // operator only ever picks folders — no per-file metadata entry.
  //
  // Ordering matters: the storage object is written first and the database row only
  // after it succeeds. The reverse would leave rows pointing at files that do not
  // exist, and the recommendation engine would happily schedule them — a participant
  // would hit a black screen mid-task. A failure in this direction only leaves an
  // orphaned file, which costs storage but breaks nothing.

  const CONCURRENCY = 4;
  const COVER_SEEK_SEC = 1;
  const COVER_MAX_WIDTH = 720;
  const COVER_QUALITY = 0.82;

  const CATEGORY_IDS = (window.CONTENT_CATEGORIES || []).map((item) => item.id);

  // Reuse the palettes already used by the static assets so new uploads look identical
  // to the originals while a video is still loading.
  const CATEGORY_PALETTE = {
    humor: 'linear-gradient(160deg, #301818 0%, #81433d 54%, #d79a61 100%)',
    life_record: 'linear-gradient(160deg, #1b1f3b 0%, #4b255f 45%, #c45f53 100%)',
    trend_recommendation: 'linear-gradient(160deg, #1f1f1f 0%, #6f5943 52%, #d2bb91 100%)',
    talent_show: 'linear-gradient(160deg, #281b2b 0%, #6b4b5b 52%, #cc8360 100%)',
    knowledge_news: 'linear-gradient(160deg, #102026 0%, #31535b 52%, #97a66b 100%)',
  };

  const CATEGORY_HASHTAGS = {
    humor: ['轻松搞笑', '娱乐'],
    life_record: ['生活记录', '日常'],
    trend_recommendation: ['潮流推荐', '好物'],
    talent_show: ['才艺展示', '技能'],
    knowledge_news: ['知识资讯', '科普'],
  };

  const state = {
    files: [],
    uploading: false,
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function log(message) {
    const box = els.uploadLog;
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    box.textContent = `[${stamp}] ${message}\n${box.textContent}`.slice(0, 20000);
  }

  function formatBytes(bytes) {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function todayStamp() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return parts.replace(/-/g, '');
  }

  // Generated names avoid the problems that come with arbitrary uploads: non-ASCII
  // characters in URLs, spaces, and same-name collisions across days. The original is
  // kept in the row for traceability. The run token keeps a second upload on the same
  // day from regenerating IDs that already exist.
  function assetIdFor(category, stamp, runToken, index) {
    return `${category}_${stamp}${runToken}_${String(index).padStart(4, '0')}`;
  }

  function newRunToken() {
    return Math.random().toString(36).slice(2, 6);
  }

  function categoryFromPath(file) {
    const relative = file.webkitRelativePath || file.name;
    const segments = relative.split('/').filter(Boolean);
    // Accept both <parent>/<category>/<file> and <category>/<file>.
    for (let i = segments.length - 2; i >= 0; i -= 1) {
      if (CATEGORY_IDS.includes(segments[i])) return segments[i];
    }
    return null;
  }

  function readVideoMetadata(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => URL.revokeObjectURL(url);
      const fail = (message) => { cleanup(); reject(new Error(message)); };

      video.addEventListener('error', () => fail('无法解码该视频文件'), { once: true });
      video.addEventListener('loadedmetadata', () => {
        resolve({
          element: video,
          url,
          cleanup,
          durationSec: Number.isFinite(video.duration) ? video.duration : null,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }, { once: true });

      video.src = url;
    });
  }

  // Grabs a frame for the cover. The file is local, so the canvas is not tainted and
  // toBlob() works without any cross-origin setup.
  function captureCover(meta) {
    return new Promise((resolve, reject) => {
      const video = meta.element;
      const target = Math.min(COVER_SEEK_SEC, Math.max(0, (meta.durationSec || 1) / 2));

      const draw = () => {
        try {
          const scale = video.videoWidth > COVER_MAX_WIDTH ? COVER_MAX_WIDTH / video.videoWidth : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('封面生成失败'))),
            'image/jpeg',
            COVER_QUALITY,
          );
        } catch (error) {
          reject(error);
        }
      };

      video.addEventListener('seeked', draw, { once: true });
      video.addEventListener('error', () => reject(new Error('封面抓取失败')), { once: true });
      video.currentTime = target;
    });
  }

  async function sha256(file) {
    if (!window.crypto?.subtle) return null;
    try {
      const buffer = await file.arrayBuffer();
      const digest = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      return null;
    }
  }

  // Interaction counts have no real source when only an MP4 is uploaded. They are drawn
  // once here and stored, never regenerated at render time — otherwise the same video
  // would show different numbers to different participants.
  function syntheticEngagement() {
    const views = Math.floor(2000 + Math.random() * 900000);
    const likeRate = 0.02 + Math.random() * 0.06;
    const likes = Math.floor(views * likeRate);
    return {
      view_count: views,
      like_count: likes,
      comment_count: Math.floor(likes * (0.01 + Math.random() * 0.04)),
      favorite_count: Math.floor(likes * (0.05 + Math.random() * 0.15)),
      share_count: Math.floor(likes * (0.01 + Math.random() * 0.05)),
    };
  }

  async function analyzeFiles(fileList) {
    const videos = Array.from(fileList).filter((file) => file.type.startsWith('video/'));
    if (!videos.length) {
      els.analyzeStatus.textContent = '没有找到视频文件。请确认选择的是包含视频的文件夹。';
      return [];
    }

    const stamp = todayStamp();
    const runToken = newRunToken();
    const counters = {};
    const analyzed = [];

    els.analyzeStatus.textContent = `正在解析 ${videos.length} 个文件……`;

    for (const file of videos) {
      const category = categoryFromPath(file);
      const entry = {
        file,
        category,
        originalFilename: file.name,
        sizeBytes: file.size,
        status: 'pending',
        error: null,
      };

      if (!category) {
        entry.status = 'skipped';
        entry.error = '无法识别类别文件夹';
        analyzed.push(entry);
        continue;
      }

      counters[category] = (counters[category] || 0) + 1;
      entry.assetId = assetIdFor(category, stamp, runToken, counters[category]);

      try {
        const meta = await readVideoMetadata(file);
        entry.durationSec = meta.durationSec;
        entry.resolution = meta.width && meta.height ? `${meta.width}x${meta.height}` : '';
        entry.coverBlob = await captureCover(meta).catch(() => null);
        meta.cleanup();
        entry.checksum = await sha256(file);
        entry.status = 'ready';
      } catch (error) {
        entry.status = 'skipped';
        entry.error = error.message || String(error);
      }

      analyzed.push(entry);
      renderFileRows(analyzed);
    }

    const ready = analyzed.filter((item) => item.status === 'ready');
    els.analyzeStatus.textContent = `解析完成：${ready.length} 个可上传，${analyzed.length - ready.length} 个被跳过。`;
    return analyzed;
  }

  function renderFileRows(entries) {
    els.fileRows.innerHTML = entries.map((entry) => {
      const note = entry.error ? `<br><span class="muted">${entry.error}</span>` : '';
      return `<tr>
        <td>${entry.assetId || entry.originalFilename}<br><span class="muted">${entry.originalFilename}</span></td>
        <td>${entry.category || '—'}</td>
        <td>${formatBytes(entry.sizeBytes)}</td>
        <td>${entry.durationSec ? `${Math.round(entry.durationSec)}s` : '—'}</td>
        <td>${entry.status}${note}</td>
      </tr>`;
    }).join('');
  }

  function getDb() {
    const app = window.ExperimentStore.getCloudBaseApp?.();
    if (!app) throw new Error('CloudBase 不可用');
    return typeof app.rdb === 'function' ? app.rdb() : app.rdb;
  }

  function getStorage() {
    const app = window.ExperimentStore.getCloudBaseApp?.();
    if (!app?.storage) throw new Error('CloudBase 存储不可用');
    return app.storage;
  }

  async function uploadObject(bucket, key, blob) {
    const result = await getStorage().from(bucket).upload(key, blob);
    if (result?.error) throw result.error;
    return result;
  }

  async function uploadEntry(entry, context) {
    const { poolTag, batchId, bucket, uploadedBy } = context;
    const base = `stimuli/${poolTag}/${entry.category}`;
    const videoKey = `${base}/video/${entry.assetId}.mp4`;
    const coverKey = entry.coverBlob ? `${base}/cover/${entry.assetId}.jpg` : null;

    // Storage first — see the note at the top of this file.
    await uploadObject(bucket, videoKey, entry.file);
    if (coverKey) await uploadObject(bucket, coverKey, entry.coverBlob);

    const engagement = syntheticEngagement();
    const row = {
      id: `video_${entry.assetId}`,
      batch_id: batchId,
      sample_id: entry.assetId,
      storage_bucket: bucket,
      video_key: videoKey,
      cover_key: coverKey,
      original_filename: entry.originalFilename,
      in_core_pool: poolTag === 'core',
      in_tracking_pool: poolTag === 'tracking',
      primary_category: entry.category,
      secondary_tags: [entry.category],
      caption: '',
      uploader_name: '',
      music: '',
      hashtags: CATEGORY_HASHTAGS[entry.category] || [],
      palette: CATEGORY_PALETTE[entry.category] || '',
      ...engagement,
      duration_sec: entry.durationSec || null,
      resolution: entry.resolution || null,
      file_size_bytes: entry.sizeBytes,
      checksum: entry.checksum,
      // Uploads never go straight into a running experiment.
      status: 'reviewing',
      enabled: false,
      uploaded_by: uploadedBy,
    };

    const { error } = await getDb().from('video_assets').insert(row);
    if (error) throw error;
  }

  // Resuming a partial upload: skip anything already indexed. Checksum is the reliable
  // key because the operator may have renamed folders between attempts.
  async function findAlreadyUploaded(entries) {
    const checksums = entries.map((entry) => entry.checksum).filter(Boolean);
    if (!checksums.length) return new Set();

    // Chunked so a 400-file batch does not build an IN clause long enough to blow the
    // request's URL length limit.
    const CHUNK = 50;
    const found = new Set();
    for (let i = 0; i < checksums.length; i += CHUNK) {
      try {
        const slice = checksums.slice(i, i + CHUNK);
        const result = await getDb().from('video_assets').select('checksum').in('checksum', slice);
        if (result?.error) continue;
        (result.data || []).forEach((row) => {
          if (row.checksum) found.add(row.checksum);
        });
      } catch (error) {
        // A failed lookup only costs a duplicate-detection opportunity; the unique
        // constraint on (storage_bucket, video_key) is the real guard.
      }
    }
    return found;
  }

  async function runPool(entries, worker) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
      while (cursor < entries.length) {
        const index = cursor;
        cursor += 1;
        await worker(entries[index], index);
      }
    });
    await Promise.all(workers);
  }

  async function startUpload() {
    if (state.uploading) return;
    const ready = state.files.filter((entry) => entry.status === 'ready');
    if (!ready.length) return;

    state.uploading = true;
    els.uploadBtn.disabled = true;
    const poolTag = els.poolSelect.value;
    const bucket = 'video-keeper';
    const uploadedBy = window.AdminAuth.currentUserLabel() || 'unknown';
    const batchId = `batch_${poolTag}_${Date.now()}`;

    try {
      const known = await findAlreadyUploaded(ready);
      const pending = ready.filter((entry) => !entry.checksum || !known.has(entry.checksum));
      const skipped = ready.length - pending.length;
      if (skipped) log(`跳过 ${skipped} 个已入库的文件（按 checksum 比对）。`);

      if (!pending.length) {
        els.uploadStatus.textContent = '所有文件都已上传过，无需重复上传。';
        return;
      }

      const { error: batchError } = await getDb().from('video_upload_batches').insert({
        id: batchId,
        pool_tag: poolTag,
        status: 'reviewing',
        asset_count: pending.length,
        uploaded_by: uploadedBy,
        note: `浏览器批量上传 ${pending.length} 个文件`,
      });
      if (batchError) throw batchError;

      let done = 0;
      let failed = 0;
      await runPool(pending, async (entry) => {
        try {
          await uploadEntry(entry, { poolTag, batchId, bucket, uploadedBy });
          entry.status = 'uploaded';
          done += 1;
        } catch (error) {
          entry.status = 'failed';
          entry.error = error.message || String(error);
          failed += 1;
          log(`失败：${entry.originalFilename} — ${entry.error}`);
        }
        els.uploadStatus.textContent = `已完成 ${done + failed}/${pending.length}（成功 ${done}，失败 ${failed}）`;
        renderFileRows(state.files);
      });

      log(`上传结束：成功 ${done}，失败 ${failed}。素材处于待审核状态，请到后台启用。`);
      els.uploadStatus.textContent = `完成：成功 ${done}，失败 ${failed}。请到后台审核启用。`;
      window.VideoAssets.clearCache();
    } catch (error) {
      log(`上传中断：${error.message || error}`);
      els.uploadStatus.textContent = `上传中断：${error.message || error}`;
    } finally {
      state.uploading = false;
      els.uploadBtn.disabled = false;
    }
  }

  async function init() {
    if (!(await window.AdminAuth.requireAuth('admin.html'))) return;

    els.uploadShell = $('uploadShell');
    els.poolSelect = $('poolSelect');
    els.folderInput = $('folderInput');
    els.analyzeBtn = $('analyzeBtn');
    els.analyzeStatus = $('analyzeStatus');
    els.fileRows = $('fileRows');
    els.uploadBtn = $('uploadBtn');
    els.uploadStatus = $('uploadStatus');
    els.uploadLog = $('uploadLog');

    els.uploadShell.hidden = false;
    $('uploadUserLabel').textContent = window.AdminAuth.currentUserLabel();
    $('categoryHint').textContent = CATEGORY_IDS.join(' / ');

    els.analyzeBtn.addEventListener('click', async () => {
      if (!els.folderInput.files?.length) {
        els.analyzeStatus.textContent = '请先选择文件夹。';
        return;
      }
      els.analyzeBtn.disabled = true;
      els.uploadBtn.disabled = true;
      try {
        state.files = await analyzeFiles(els.folderInput.files);
        renderFileRows(state.files);
        els.uploadBtn.disabled = !state.files.some((entry) => entry.status === 'ready');
      } finally {
        els.analyzeBtn.disabled = false;
      }
    });

    els.uploadBtn.addEventListener('click', startUpload);
  }

  init();
})();
