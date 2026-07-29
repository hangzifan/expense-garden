import { coverPresets, themes } from "./data.js";

const STORE_KEY = "expense-garden-state-v1";
const STORE_BACKUP_KEY = `${STORE_KEY}.backup`;
const STORE_PREVIOUS_KEY = `${STORE_KEY}.previous`;
const STORE_COVER_KEY = `${STORE_KEY}.cover`;
const STORE_CORRUPT_PREFIX = `${STORE_KEY}.corrupt`;
// Marker persisted in place of the cover data URL so the large image is
// written once to its own key instead of three times with every save.
const COVER_STORED_MARKER = "__stored-cover__";
const BACKUP_INTERVAL_MS = 10 * 60 * 1000;
const MAX_BACKUP_LENGTH = 25 * 1024 * 1024;
const MAX_BACKUP_RECORDS = 100_000;
const MAX_BACKUP_AMOUNT = 1_000_000_000_000;
const MAX_TEXT_LENGTH = 10_000;

let lastBackupAt = 0;
let storedCoverCache;

export function loadState() {
  const primary = readStoredState(STORE_KEY);
  if (primary.ok) return resolveCover(primary.state);
  if (primary.raw) preserveCorruptState(primary.raw);

  const backup = readStoredState(STORE_BACKUP_KEY);
  if (backup.ok) return resolveCover(backup.state);

  const previous = readStoredState(STORE_PREVIOUS_KEY);
  if (previous.ok) return resolveCover(previous.state);

  return createDefaultState();
}

export function hasStoredState() {
  return readStoredState(STORE_KEY).ok
    || readStoredState(STORE_BACKUP_KEY).ok
    || readStoredState(STORE_PREVIOUS_KEY).ok;
}

export function parseBackupPayload(raw) {
  if (typeof raw !== "string" || !raw.length || raw.length > MAX_BACKUP_LENGTH) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidBackupShape(parsed)) return null;
    return resolveCover(normalizeState(parsed));
  } catch {
    return null;
  }
}

function readStoredState(key) {
  const raw = readStoredItem(key);
  if (!raw) return { ok: false, raw: "" };

  try {
    return { ok: true, state: normalizeState(JSON.parse(raw)), raw };
  } catch {
    return { ok: false, raw };
  }
}

function resolveCover(state) {
  if (state.settings.coverImage !== COVER_STORED_MARKER) return state;
  return {
    ...state,
    settings: { ...state.settings, coverImage: getStoredCover() }
  };
}

function isValidBackupShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expenses = value.expenses ?? [];
  const pending = value.pending ?? [];
  if (!Array.isArray(expenses) || !Array.isArray(pending)) return false;
  if (expenses.length + pending.length > MAX_BACKUP_RECORDS) return false;
  return expenses.every((entry) => isValidBackupEntry(entry, false))
    && pending.every((entry) => isValidBackupEntry(entry, true));
}

function isValidBackupEntry(entry, pending) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const amount = Number(entry.amount);
  if (!Number.isFinite(amount) || amount < 0 || (!pending && amount <= 0) || amount > MAX_BACKUP_AMOUNT) return false;
  if (entry.date && !isValidDateText(entry.date)) return false;
  return ["id", "merchant", "category", "method", "date", "time", "note", "source", "rawText"]
    .every((key) => entry[key] == null || (typeof entry[key] === "string" && entry[key].length <= MAX_TEXT_LENGTH));
}

function isValidDateText(value) {
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function preserveCorruptState(raw) {
  try {
    const key = `${STORE_CORRUPT_PREFIX}.${Date.now()}`;
    localStorage.setItem(key, raw);
  } catch {
    // If storage is full or unavailable, keep the app usable.
  }
}

function createDefaultState() {
  return {
    expenses: [],
    pending: [],
    settings: {
      budget: 3200,
      themeId: themes[0].id,
      coverPresetId: coverPresets[0].id,
      coverImage: "",
      darkMode: false,
      customExpenseCategories: [],
      customIncomeCategories: [],
      categoryOrder: [],
      incomeCategoryOrder: [],
      categoryKeywordOverrides: {},
      categoryOverrides: {},
      incomeCategoryOverrides: {}
    }
  };
}

function normalizeState(state) {
  const defaults = createDefaultState();
  return {
    expenses: Array.isArray(state?.expenses) ? state.expenses.map(normalizeEntry) : defaults.expenses,
    pending: Array.isArray(state?.pending) ? state.pending.map(normalizeEntry) : defaults.pending,
    settings: {
      ...defaults.settings,
      ...(state?.settings || {}),
      customExpenseCategories: Array.isArray(state?.settings?.customExpenseCategories)
        ? state.settings.customExpenseCategories
          .filter((category) => category?.id && category?.name)
          .map((category) => ({
            ...category,
            keywords: Array.isArray(category.keywords) ? category.keywords.filter(Boolean) : []
          }))
        : [],
      customIncomeCategories: Array.isArray(state?.settings?.customIncomeCategories)
        ? state.settings.customIncomeCategories
          .filter((category) => category?.id && category?.name)
          .map((category) => ({
            ...category,
            keywords: Array.isArray(category.keywords) ? category.keywords.filter(Boolean) : []
          }))
        : [],
      categoryOrder: Array.isArray(state?.settings?.categoryOrder)
        ? state.settings.categoryOrder.filter(Boolean)
        : [],
      incomeCategoryOrder: Array.isArray(state?.settings?.incomeCategoryOrder)
        ? state.settings.incomeCategoryOrder.filter(Boolean)
        : [],
      categoryKeywordOverrides: state?.settings?.categoryKeywordOverrides && typeof state.settings.categoryKeywordOverrides === "object"
        ? state.settings.categoryKeywordOverrides
        : {},
      categoryOverrides: state?.settings?.categoryOverrides && typeof state.settings.categoryOverrides === "object"
        ? state.settings.categoryOverrides
        : {},
      incomeCategoryOverrides: state?.settings?.incomeCategoryOverrides && typeof state.settings.incomeCategoryOverrides === "object"
        ? state.settings.incomeCategoryOverrides
        : {}
    }
  };
}

function normalizeEntry(entry) {
  // Historical builds stored the Chinese label as the record type.
  const type = entry?.type === "income" || entry?.type === "收入" ? "income" : "expense";
  return {
    ...entry,
    type,
    category: entry?.category || (type === "income" ? "income-other" : "other")
  };
}

export function saveState(state) {
  const coverImage = String(state?.settings?.coverImage || "");
  const hasCover = Boolean(coverImage) && coverImage !== COVER_STORED_MARKER;
  const storedCover = getStoredCover();
  if (hasCover && coverImage !== storedCover) {
    writeStoredItem(STORE_COVER_KEY, coverImage);
    storedCoverCache = coverImage;
  }
  if (!coverImage && storedCover) {
    removeStoredItem(STORE_COVER_KEY);
    storedCoverCache = "";
  }
  const persisted = hasCover
    ? { ...state, settings: { ...state.settings, coverImage: COVER_STORED_MARKER } }
    : state;
  const serialized = JSON.stringify(persisted);

  const now = Date.now();
  if (now - lastBackupAt >= BACKUP_INTERVAL_MS || !readStoredItem(STORE_BACKUP_KEY)) {
    const current = readStoredItem(STORE_KEY);
    try {
      if (current) localStorage.setItem(STORE_PREVIOUS_KEY, current);
    } catch {
      removeStoredItem(STORE_PREVIOUS_KEY);
    }
    try {
      localStorage.setItem(STORE_BACKUP_KEY, serialized);
      lastBackupAt = now;
    } catch {
      removeStoredItem(STORE_PREVIOUS_KEY);
      try {
        localStorage.setItem(STORE_BACKUP_KEY, serialized);
        lastBackupAt = now;
      } catch {
        removeStoredItem(STORE_BACKUP_KEY);
      }
    }
  }

  try {
    localStorage.setItem(STORE_KEY, serialized);
  } catch {
    removeStoredItem(STORE_PREVIOUS_KEY);
    removeStoredItem(STORE_BACKUP_KEY);
    try {
      localStorage.setItem(STORE_KEY, serialized);
    } catch {
      // Avoid crashing the UI if the browser storage quota is exhausted.
    }
  }
}

function getStoredCover() {
  if (storedCoverCache === undefined) storedCoverCache = readStoredItem(STORE_COVER_KEY);
  return storedCoverCache;
}

function readStoredItem(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStoredItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The cover image is decorative; losing it must never block ledger saves.
  }
}

function removeStoredItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in rare WebView states.
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
