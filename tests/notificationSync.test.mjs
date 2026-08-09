import test from "node:test";
import assert from "node:assert/strict";
import {
  isNotificationSyncVisible,
  syncNotificationBatch
} from "../src/hooks/useNotificationSync.js";

function createPlugin(items = []) {
  const calls = [];
  return {
    calls,
    plugin: {
      async isEnabled() {
        calls.push("isEnabled");
        return { enabled: true, connected: true };
      },
      async reconnect() {
        calls.push("reconnect");
      },
      async drainNotifications() {
        calls.push("drainNotifications");
        return { items };
      }
    }
  };
}

test("does not inspect or drain notifications while the document is hidden", async () => {
  const { calls, plugin } = createPlugin([{ amount: 12 }]);
  const entries = await syncNotificationBatch({
    notifyPlugin: plugin,
    isVisible: () => false,
    normalizeItems: (items) => items
  });

  assert.deepEqual(entries, []);
  assert.deepEqual(calls, []);
});

test("does not drain if the app becomes hidden while checking notification access", async () => {
  let visible = true;
  const calls = [];
  const plugin = {
    async isEnabled() {
      calls.push("isEnabled");
      visible = false;
      return { enabled: true, connected: true };
    },
    async drainNotifications() {
      calls.push("drainNotifications");
      return { items: [] };
    }
  };

  await syncNotificationBatch({
    notifyPlugin: plugin,
    isVisible: () => visible,
    normalizeItems: (items) => items
  });

  assert.deepEqual(calls, ["isEnabled"]);
});

test("visible synchronization drains once, filters self-tests, and keeps callback options", async () => {
  const { calls, plugin } = createPlugin([
    { id: "real", amount: 18 },
    { id: "self-test", amount: 0.01, test: true }
  ]);
  const received = [];
  const entries = await syncNotificationBatch({
    notifyPlugin: plugin,
    isVisible: () => true,
    getCategories: () => ["food"],
    getMerchantHistory: () => ["商户A"],
    normalizeItems: (items, categories, history) => items.map((item) => ({
      ...item,
      category: categories[0],
      merchant: history[0]
    })),
    onEntries: (...args) => received.push(args)
  });

  assert.deepEqual(calls, ["isEnabled", "drainNotifications"]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "real");
  assert.equal(entries[0].category, "food");
  assert.deepEqual(received, [[entries, { navigate: false }]]);
});

test("visibility helper honors both document.hidden and visibilityState", () => {
  assert.equal(isNotificationSyncVisible({ hidden: true, visibilityState: "visible" }), false);
  assert.equal(isNotificationSyncVisible({ hidden: false, visibilityState: "hidden" }), false);
  assert.equal(isNotificationSyncVisible({ hidden: false, visibilityState: "visible" }), true);
});
