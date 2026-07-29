import { createId } from "../ids.js";

export function normalizePendingEntry(entry, index = 0) {
  if (!entry) return null;
  const type = entry.type === "income" ? "income" : "expense";
  return {
    ...entry,
    id: entry.id || createId(`pending-${index}`),
    type,
    amount: Number(entry.amount || 0),
    merchant: entry.merchant || "未识别商户",
    category: entry.category || (type === "income" ? "income-other" : "other"),
    method: entry.method || "其他",
    date: entry.date || localDate(),
    time: entry.time || localTime(),
    note: entry.note || ""
  };
}

export function mergePendingEntries(current, incoming) {
  const seenIds = new Set(current.map((item) => item.id));
  const seenFingerprints = new Set(current.map(pendingFingerprint));
  const nextIncoming = [];

  for (const entry of incoming) {
    const normalizedEntry = seenIds.has(entry.id) ? { ...entry, id: createId("pending") } : entry;
    seenIds.add(normalizedEntry.id);
    const fingerprint = pendingFingerprint(entry);
    const duplicateHint = seenFingerprints.has(fingerprint);
    seenFingerprints.add(fingerprint);
    nextIncoming.push({
      ...normalizedEntry,
      duplicateHint,
      note: duplicateHint && !normalizedEntry.note ? "可能重复，请核对" : normalizedEntry.note
    });
  }

  return [...nextIncoming, ...current];
}

export function pendingFingerprint(entry) {
  const amount = Number(entry?.amount || 0).toFixed(2);
  return [
    entry?.type || "expense",
    amount,
    String(entry?.merchant || "").trim(),
    entry?.date || "",
    entry?.time || "",
    entry?.method || "",
    entry?.source || ""
  ].join("|");
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function localTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

