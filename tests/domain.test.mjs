import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackCategories,
  getCategory,
  mergeExpenseCategories,
  mergeIncomeCategories
} from "../src/domain/categories.js";
import { mergePendingEntries, normalizePendingEntry } from "../src/domain/pending.js";

test("category lookup always returns a safe fallback", () => {
  assert.deepEqual(getCategory("missing", "expense", [], []), fallbackCategories.expense);
  assert.deepEqual(getCategory("missing", "income", [], []), fallbackCategories.income);
});

test("category models preserve custom order and keep the fallback category", () => {
  const expenses = mergeExpenseCategories([
    { id: "pet", name: "宠物", icon: "paw", color: "#123456", keywords: ["猫粮"] }
  ], ["pet", "food"]);
  const incomes = mergeIncomeCategories([], ["income-other"]);
  assert.equal(expenses[0].id, "pet");
  assert.equal(expenses[1].id, "food");
  assert.equal(expenses.at(-1).id, "other");
  assert.equal(incomes[0].id, "income-other");
});

test("pending merge marks a matching record instead of silently dropping it", () => {
  const existing = [normalizePendingEntry({
    id: "old",
    amount: 20,
    merchant: "测试商户",
    date: "2026-07-30",
    time: "12:00",
    method: "微信",
    source: "截图识别"
  })];
  const incoming = [normalizePendingEntry({
    id: "new",
    amount: 20,
    merchant: "测试商户",
    date: "2026-07-30",
    time: "12:00",
    method: "微信",
    source: "截图识别"
  })];
  const merged = mergePendingEntries(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].duplicateHint, true);
  assert.equal(merged[0].note, "可能重复，请核对");
});

