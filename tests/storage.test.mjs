import test from "node:test";
import assert from "node:assert/strict";
import { hasStoredState, loadState, parseBackupPayload, saveState } from "../src/storage.js";

function installStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  return values;
}

function stateWith(entries = [], coverImage = "") {
  return {
    expenses: entries,
    pending: [],
    settings: {
      budget: 3200,
      themeId: "sage",
      coverPresetId: "morning",
      coverImage,
      darkMode: false
    }
  };
}

test("normalizes the historical Chinese income type without turning it into expense", () => {
  installStorage({
    "expense-garden-state-v1": JSON.stringify(stateWith([
      { id: "legacy", type: "收入", amount: 100, merchant: "工资", category: "salary" }
    ]))
  });
  const loaded = loadState();
  assert.equal(loaded.expenses[0].type, "income");
  assert.equal(loaded.expenses[0].category, "salary");
});

test("stores a large cover once while keeping it available after reload", () => {
  const values = installStorage();
  const cover = "data:image/jpeg;base64," + "x".repeat(2000);
  saveState(stateWith([], cover));
  const primary = values.get("expense-garden-state-v1");
  assert.equal(primary.includes(cover), false);
  assert.equal(values.get("expense-garden-state-v1.cover"), cover);
  assert.equal(loadState().settings.coverImage, cover);
});

test("does not treat corrupt local data as a valid ledger", () => {
  installStorage({ "expense-garden-state-v1": "{broken" });
  assert.equal(hasStoredState(), false);
});

test("validates and normalizes the native backup payload", () => {
  installStorage();
  const restored = parseBackupPayload(JSON.stringify(stateWith([
    { id: "one", amount: 12, merchant: "测试" }
  ])));
  assert.equal(restored.expenses[0].type, "expense");
  assert.equal(restored.expenses[0].category, "other");
  assert.equal(parseBackupPayload("not json"), null);
});
