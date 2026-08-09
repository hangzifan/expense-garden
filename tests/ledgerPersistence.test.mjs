import test from "node:test";
import assert from "node:assert/strict";
import {
  isRestorableNativeBackup,
  shouldFlushNativeBackup
} from "../src/hooks/useLedgerPersistence.js";
import { parseBackupPayload } from "../src/storage.js";

test("accepts an Android backup that contains settings but no ledger entries", () => {
  const restored = parseBackupPayload(JSON.stringify({
    expenses: [],
    pending: [],
    settings: {
      budget: 6800,
      themeId: "ink",
      darkMode: true,
      customExpenseCategories: [{ id: "pet", name: "宠物", icon: "paw" }]
    }
  }));

  assert.equal(isRestorableNativeBackup(restored), true);
  assert.equal(restored.expenses.length, 0);
  assert.equal(restored.pending.length, 0);
  assert.equal(restored.settings.budget, 6800);
  assert.equal(restored.settings.darkMode, true);
});

test("rejects missing or malformed native backup state", () => {
  assert.equal(isRestorableNativeBackup(null), false);
  assert.equal(isRestorableNativeBackup({ expenses: [], pending: [] }), false);
  assert.equal(isRestorableNativeBackup({ expenses: {}, pending: [], settings: {} }), false);
});

test("flushes native backup on page hide or when the document becomes hidden", () => {
  assert.equal(shouldFlushNativeBackup("pagehide", { hidden: false }), true);
  assert.equal(shouldFlushNativeBackup("visibilitychange", { hidden: true }), true);
  assert.equal(shouldFlushNativeBackup("visibilitychange", { visibilityState: "hidden" }), true);
  assert.equal(shouldFlushNativeBackup("visibilitychange", { hidden: false, visibilityState: "visible" }), false);
});
