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

  function groupByCategory(assets) {
    return assets.reduce((map, item) => {
      const key = item.primary_category || 'uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
      return map;
    }, new Map());
  }

  function createNonRepeatingPicker(assets, selectedCategories, rng, seenSampleIds) {
    const allAssets = assets.slice();
    const allSampleIds = new Set(allAssets.map((item) => item.sample_id));
    const allCategories = Array.from(new Set(allAssets.map((item) => item.primary_category || 'uncategorized')));
    const selected = new Set(selectedCategories || []);
    const preferredCategories = allCategories.filter((category) => selected.has(category));
    const otherCategories = allCategories.filter((category) => !selected.has(category));
    const categoryMap = groupByCategory(allAssets);
    const categoryQueues = new Map();
    // Study 3 spans 40 sessions, so previously-seen videos are pre-marked as used and
    // the normal "skip used" path then prefers unseen material automatically.
    // seenOrder is oldest-first, which drives the least-recently-seen release below.
    const seenOrder = (seenSampleIds || []).filter((id) => allSampleIds.has(id));
    const usedInCurrentCycle = new Set(seenOrder);

    function releaseLeastRecentlySeen() {
      // Once unseen material runs out, free the oldest half rather than everything, so a
      // video watched moments ago does not immediately reappear.
      const stillHeld = seenOrder.filter((id) => usedInCurrentCycle.has(id));
      if (!stillHeld.length) return false;
      const releaseCount = Math.max(1, Math.ceil(stillHeld.length / 2));
      stillHeld.slice(0, releaseCount).forEach((id) => usedInCurrentCycle.delete(id));
      categoryQueues.clear();
      return releaseCount > 0;
    }

    function resetCycle() {
      if (seenOrder.length && releaseLeastRecentlySeen()) return;
      usedInCurrentCycle.clear();
      categoryQueues.clear();
    }

    function resetIfCycleComplete() {
      if (usedInCurrentCycle.size >= allSampleIds.size) {
        resetCycle();
      }
    }

    function refillCategory(category) {
      const source = (categoryMap.get(category) || []).filter((item) => !usedInCurrentCycle.has(item.sample_id));
      const next = shuffle(source, rng);
      categoryQueues.set(category, next);
      return next;
    }

    function usableQueue(category) {
      const current = categoryQueues.get(category) || [];
      const filtered = current.filter((item) => !usedInCurrentCycle.has(item.sample_id));
      if (filtered.length !== current.length) categoryQueues.set(category, filtered);
      return filtered.length ? filtered : refillCategory(category);
    }

    function takeFromCategory(category, avoidSampleId) {
      const queue = usableQueue(category);
      if (!queue.length) return null;
      let index = queue.findIndex((item) => item.sample_id !== avoidSampleId);
      if (index < 0 && usedInCurrentCycle.size > 0) return null;
      if (index < 0) index = 0;
      const [item] = queue.splice(index, 1);
      categoryQueues.set(category, queue);
      return item;
    }

    function takeFromCategories(categories, avoidSampleId) {
      const orderedCategories = shuffle(categories.filter((category) => categoryMap.has(category)), rng);
      for (let i = 0; i < orderedCategories.length; i += 1) {
        const item = takeFromCategory(orderedCategories[i], avoidSampleId);
        if (item) return item;
      }
      return null;
    }

    function pick(slot, avoidSampleId) {
      if (!allAssets.length) return null;
      resetIfCycleComplete();

      const primaryCategories = slot === 'preferred'
        ? (preferredCategories.length ? preferredCategories : allCategories)
        : (otherCategories.length ? otherCategories : allCategories);
      const fallbackCategories = allCategories.filter((category) => !primaryCategories.includes(category));

      let item = takeFromCategories(primaryCategories, avoidSampleId)
        || takeFromCategories(fallbackCategories, avoidSampleId);

      if (!item && usedInCurrentCycle.size > 0) {
        resetCycle();
        item = takeFromCategories(primaryCategories, avoidSampleId)
          || takeFromCategories(fallbackCategories, avoidSampleId)
          || takeFromCategories(allCategories, null);
      }

      if (!item) item = takeFromCategories(allCategories, null);
      if (item) usedInCurrentCycle.add(item.sample_id);
      return item;
    }

    return { pick };
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
    const preferredCount = Math.round(length * ratio);
    const slots = buildSlotTypes(length, preferred.length ? preferredCount : 0, rng);
    // seenSampleIds is optional and oldest-first; only study 3 passes it.
    const picker = createNonRepeatingPicker(assets, Array.from(selected), rng, options.seenSampleIds);
    const sequence = [];

    slots.forEach((slot) => {
      const avoidSampleId = sequence[sequence.length - 1]?.sample_id;
      const item = picker.pick(slot, avoidSampleId);
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
