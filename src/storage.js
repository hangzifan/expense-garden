import { coverPresets, themes } from "./data.js";

const STORE_KEY = "expense-garden-state-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch {
    // Ignore damaged local state and fall back to a fresh book.
  }

  return createDefaultState();
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
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
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
