import { coverPresets, themes } from "./data.js";

const STORE_KEY = "expense-garden-state-v1";
const STORE_BACKUP_KEY = `${STORE_KEY}.backup`;
const STORE_PREVIOUS_KEY = `${STORE_KEY}.previous`;
const STORE_CORRUPT_PREFIX = `${STORE_KEY}.corrupt`;

export function loadState() {
  const primary = readStoredState(STORE_KEY);
  if (primary.ok) return primary.state;
  if (primary.raw) preserveCorruptState(primary.raw);

  const backup = readStoredState(STORE_BACKUP_KEY);
  if (backup.ok) return backup.state;

  const previous = readStoredState(STORE_PREVIOUS_KEY);
  if (previous.ok) return previous.state;

  return createDefaultState();
}

function readStoredState(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return { ok: false, raw: "" };

  try {
    return { ok: true, state: normalizeState(JSON.parse(raw)), raw };
  } catch {
    return { ok: false, raw };
  }
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
      darkMode: false
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
      ...(state?.settings || {})
    }
  };
}

function normalizeEntry(entry) {
  const type = entry?.type === "income" ? "income" : "expense";
  return {
    ...entry,
    type,
    category: entry?.category || (type === "income" ? "income-other" : "other")
  };
}

export function saveState(state) {
  const serialized = JSON.stringify(state);
  const current = localStorage.getItem(STORE_KEY);

  try {
    if (current) localStorage.setItem(STORE_PREVIOUS_KEY, current);
  } catch {
    removeStoredItem(STORE_PREVIOUS_KEY);
  }

  try {
    localStorage.setItem(STORE_BACKUP_KEY, serialized);
  } catch {
    removeStoredItem(STORE_PREVIOUS_KEY);
    try {
      localStorage.setItem(STORE_BACKUP_KEY, serialized);
    } catch {
      removeStoredItem(STORE_BACKUP_KEY);
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
