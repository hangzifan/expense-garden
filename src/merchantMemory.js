const UNKNOWN_MERCHANT = "未识别商户";

export function refineWithMerchantMemory(parsed, rawText, records = []) {
  if (!parsed) return parsed;
  const recognizedMerchant = parsed.recognizedMerchant || parsed.merchant;
  const source = { ...parsed, recognizedMerchant };
  if (!Array.isArray(records) || records.length === 0) return source;

  const memory = buildMerchantMemory(records, source.type);
  if (!memory.length) return source;

  const candidateKey = normalizeMerchant(source.merchant);
  const rawKey = normalizeMerchant(rawText);
  const candidateKnown = source.merchant && source.merchant !== UNKNOWN_MERCHANT;
  const matches = memory
    .map((entry) => scoreMerchantMatch(entry, candidateKey, rawKey, candidateKnown))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.entry.count - a.entry.count || b.entry.lastUsedAt - a.entry.lastUsedAt);
  const best = matches[0];
  if (best) {
    const originalMerchant = source.merchant;
    const category = best.entry.category || source.category;
    const method = source.method === "其他" && best.entry.method ? best.entry.method : source.method;
    const confidenceFloor = ["raw_exact", "exact", "learned_alias"].includes(best.matchType) ? 97 : 91;

    return {
      ...source,
      merchant: best.entry.name,
      category,
      method,
      confidence: Math.max(Number(source.confidence || 0), confidenceFloor),
      merchantMemory: {
        matched: true,
        matchType: best.matchType,
        score: Math.round(best.score * 100),
        samples: best.entry.count,
        originalMerchant,
        categoryLearned: Boolean(category && category !== source.category)
      }
    };
  }

  if (candidateKnown || Number(source.amount) <= 0) return source;
  const predictions = predictMerchantCandidates(source, records);
  if (!predictions.length) return source;
  const [prediction, second] = predictions;
  const canAutoFill = prediction.highConfidence
    && (!second || prediction.confidence - second.confidence >= 12);
  return {
    ...source,
    ...(canAutoFill ? {
      merchant: prediction.name,
      category: prediction.category || source.category,
      confidence: Math.max(Number(source.confidence || 0), prediction.confidence)
    } : {}),
    merchantSuggestions: predictions,
    merchantMemory: {
      matched: canAutoFill,
      matchType: canAutoFill ? "temporal_prediction" : "suggestion",
      score: prediction.score,
      samples: prediction.samples,
      originalMerchant: source.merchant,
      categoryLearned: canAutoFill && Boolean(prediction.category && prediction.category !== source.category)
    }
  };
}

export function buildMerchantMemory(records, type = "expense") {
  const groups = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const recordType = record?.type === "income" ? "income" : "expense";
    const name = String(record?.merchant || "").trim();
    const key = normalizeMerchant(name);
    if (recordType !== type || !isUsableMerchant(name, key)) return;

    const group = groups.get(key) || {
      key,
      names: new Map(),
      aliases: new Set(),
      categories: new Map(),
      methods: new Map(),
      amounts: new Map(),
      hours: new Map(),
      weekdays: new Map(),
      count: 0,
      lastUsedAt: 0
    };
    group.count += 1;
    group.lastUsedAt = Math.max(group.lastUsedAt, recordTimestamp(record));
    increment(group.names, name);
    const alias = normalizeMerchant(record.recognizedMerchant || record.merchantMemory?.originalMerchant);
    if (alias && alias !== key && alias.length >= 2) group.aliases.add(alias);
    increment(group.categories, String(record.category || ""));
    increment(group.methods, String(record.method || ""));
    const amount = Number(record.amount);
    if (Number.isFinite(amount) && amount > 0) increment(group.amounts, amount.toFixed(2));
    const timestamp = recordTimestamp(record);
    if (timestamp) {
      const date = new Date(timestamp);
      increment(group.hours, String(date.getHours()));
      increment(group.weekdays, String(date.getDay()));
    }
    groups.set(key, group);
  });

  return Array.from(groups.values()).map((group) => ({
    key: group.key,
    name: mostFrequent(group.names),
    category: mostFrequent(group.categories),
    method: mostFrequent(group.methods),
    methods: mapCounts(group.methods),
    amounts: mapCounts(group.amounts),
    hours: mapCounts(group.hours),
    weekdays: mapCounts(group.weekdays),
    aliases: Array.from(group.aliases),
    count: group.count,
    lastUsedAt: group.lastUsedAt
  }));
}

export function buildNativeMerchantProfiles(records) {
  return buildMerchantMemory(records, "expense")
    .sort((left, right) => right.count - left.count || right.lastUsedAt - left.lastUsedAt)
    .slice(0, 120)
    .map((entry) => ({
      name: entry.name,
      category: entry.category,
      method: entry.method,
      count: entry.count,
      lastUsedAt: entry.lastUsedAt,
      methods: entry.methods,
      amounts: entry.amounts,
      hours: entry.hours,
      weekdays: entry.weekdays
    }));
}

export function predictMerchantCandidates(parsed, records = []) {
  if (!parsed || parsed.type === "income" || Number(parsed.amount) <= 0) return [];
  const memory = buildMerchantMemory(records, "expense");
  if (!memory.length) return [];
  const amount = Number(parsed.amount);
  const method = String(parsed.method || "其他");
  const timestamp = recordTimestamp(parsed);
  const date = timestamp ? new Date(timestamp) : null;
  const hour = date?.getHours();
  const weekday = date?.getDay();
  const scored = memory.map((entry) => {
    const exact = entry.amounts.find((item) => Number(item.value) === Number(amount.toFixed(2)));
    const near = entry.amounts
      .map((item) => ({ ...item, distance: Math.abs(Number(item.value) - amount) }))
      .sort((left, right) => left.distance - right.distance)[0];
    const methodCount = entry.methods.find((item) => item.value === method)?.count || 0;
    const hourCount = hour == null ? 0 : entry.hours.find((item) => Number(item.value) === hour)?.count || 0;
    const weekdayCount = weekday == null ? 0 : entry.weekdays.find((item) => Number(item.value) === weekday)?.count || 0;
    const exactCount = exact?.count || 0;
    const nearRatio = near ? Math.abs(Number(near.value) - amount) / Math.max(amount, 1) : 1;
    const amountScore = exactCount ? 44 + Math.min(exactCount, 4) * 7 : nearRatio <= 0.03 ? 24 : 0;
    const score = amountScore
      + (methodCount ? 15 + Math.min(methodCount, 3) * 2 : 0)
      + (hourCount ? 8 + Math.min(hourCount, 3) * 2 : 0)
      + (weekdayCount ? 5 : 0)
      + Math.min(entry.count, 6) * 2;
    return {
      name: entry.name,
      category: entry.category,
      method: entry.method,
      score,
      confidence: Math.min(97, Math.round(45 + score * 0.5)),
      samples: entry.count,
      exactAmountCount: exactCount,
      highConfidence: exactCount >= 2 && score >= 78
    };
  }).filter((item) => item.score >= 38).sort((left, right) =>
    right.score - left.score || right.samples - left.samples
  );
  return scored.slice(0, 3);
}

function scoreMerchantMatch(entry, candidateKey, rawKey, candidateKnown) {
  if (candidateKey && candidateKey === entry.key) {
    return { entry, score: 1, matchType: "exact" };
  }
  if (entry.key.length >= 3 && rawKey.includes(entry.key)) {
    return { entry, score: 0.99, matchType: "raw_exact" };
  }
  const learnedAlias = entry.aliases.find((alias) => alias === candidateKey || (alias.length >= 3 && rawKey.includes(alias)));
  if (learnedAlias) {
    return { entry, score: 0.995, matchType: "learned_alias" };
  }
  if (!candidateKnown || !candidateKey) return null;

  const shorterLength = Math.min(candidateKey.length, entry.key.length);
  if (shorterLength >= 4 && (candidateKey.includes(entry.key) || entry.key.includes(candidateKey))) {
    return { entry, score: 0.93, matchType: "contained" };
  }

  const similarity = stringSimilarity(candidateKey, entry.key);
  const threshold = shorterLength <= 2 ? 1 : shorterLength === 3 ? 2 / 3 : 0.72;
  if (similarity < threshold) return null;
  return { entry, score: similarity, matchType: "fuzzy" };
}

function normalizeMerchant(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/未识别商户/g, "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .trim();
}

function stringSimilarity(left, right) {
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  return 1 - levenshteinDistance(left, right) / longest;
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function isUsableMerchant(name, key) {
  return Boolean(name)
    && name !== UNKNOWN_MERCHANT
    && key.length >= 2
    && !/^(其他|未知|无|微信|支付宝|银行卡)$/.test(name);
}

function increment(map, value) {
  if (!value) return;
  map.set(value, (map.get(value) || 0) + 1);
}

function mostFrequent(map) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function mapCounts(map) {
  return Array.from(map.entries()).map(([value, count]) => ({ value, count }));
}

function recordTimestamp(record) {
  const value = new Date(`${record?.date || "1970-01-01"}T${record?.time || "00:00"}`).getTime();
  return Number.isNaN(value) ? 0 : value;
}
