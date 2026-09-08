(function () {
  function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
  }

  function createRng(seed) {
    let state = hashString(seed || 'default-seed') || 1;
    return function rng() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 4294967296);
    };
  }

  function shuffle(list, rng) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildSlotTypes(length, preferredCount, rng) {
    const slots = [];
    for (let i = 0; i < length; i += 1) slots.push(i < preferredCount ? 'preferred' : 'other');
    return shuffle(slots, rng);
  }

  function createCyclingPicker(source, rng) {
    let queue = [];

    function refill(avoidSampleId) {
      queue = shuffle(source, rng);
      if (queue.length > 1 && queue[0]?.sample_id === avoidSampleId) {
        const swapIndex = queue.findIndex((item) => item.sample_id !== avoidSampleId);
        if (swapIndex > 0) [queue[0], queue[swapIndex]] = [queue[swapIndex], queue[0]];
      }
    }

    return function pick(avoidSampleId) {
      if (!source.length) return null;
      if (!queue.length) refill(avoidSampleId);
      if (queue.length > 1 && queue[0]?.sample_id === avoidSampleId) {
        const swapIndex = queue.findIndex((item) => item.sample_id !== avoidSampleId);
        if (swapIndex > 0) [queue[0], queue[swapIndex]] = [queue[swapIndex], queue[0]];
      }
      return queue.shift();
    };
  }

  function reduceAdjacentRepeats(sequence) {
    for (let i = 1; i < sequence.length; i += 1) {
      if (sequence[i].sample_id !== sequence[i - 1].sample_id) continue;
      const swapIndex = sequence.findIndex((item, index) => (
        index > i
        && item.sample_id !== sequence[i - 1].sample_id
        && (index === sequence.length - 1 || sequence[i].sample_id !== sequence[index + 1]?.sample_id)
      ));
      if (swapIndex > i) [sequence[i], sequence[swapIndex]] = [sequence[swapIndex], sequence[i]];
    }
    return sequence;
  }

  function buildRecommendedFeed(options) {
    const assets = (options.assets || []).filter((item) => item.enabled !== false);
    const selected = new Set(options.selectedCategories || []);
    const length = Number(options.feedLength) || 80;
    const ratio = Number(options.preferredRatio ?? 0.7);
    const rng = createRng(options.seed || 'session');
    const preferred = assets.filter((item) => selected.has(item.primary_category));
    const other = assets.filter((item) => !selected.has(item.primary_category));
    const preferredCount = Math.round(length * ratio);
    const slots = buildSlotTypes(length, preferredCount, rng);
    const pickPreferred = createCyclingPicker(preferred.length ? preferred : assets, rng);
    const pickOther = createCyclingPicker(other.length ? other : assets, rng);
    const sequence = [];

    slots.forEach((slot) => {
      const avoidSampleId = sequence[sequence.length - 1]?.sample_id;
      const picker = slot === 'preferred' ? pickPreferred : pickOther;
      const fallbackPicker = slot === 'preferred' ? pickOther : pickPreferred;
      const item = picker(avoidSampleId) || fallbackPicker(avoidSampleId);
      if (item) sequence.push({ ...item, matched_preference: selected.has(item.primary_category) });
    });

    return reduceAdjacentRepeats(sequence).map((item, index) => ({
      ...item,
      feed_index: index,
      slide_id: `${item.sample_id}#${index}`,
    }));
  }

  window.Recommendation = {
    buildRecommendedFeed,
    hashString,
  };
})();
