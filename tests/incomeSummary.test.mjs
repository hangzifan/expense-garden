import test from "node:test";
import assert from "node:assert/strict";
import { buildIncomeSummary, compareIncome } from "../src/incomeSummary.js";

const incomeCategories = [
  { id: "salary", name: "工资", color: "#4f9d75" },
  { id: "bonus", name: "奖金", color: "#d6a94f" },
  { id: "income-other", name: "其他", color: "#7b837d" }
];

test("builds income totals, category shares, and source ranking", () => {
  const summary = buildIncomeSummary([
    { type: "income", merchant: "公司工资", category: "salary", amount: 8000 },
    { type: "income", merchant: "公司工资", category: "bonus", amount: 2000 },
    { type: "income", merchant: "项目稿费", category: "income-other", amount: 1000 },
    { type: "expense", merchant: "午餐", category: "food", amount: 30 }
  ], incomeCategories);

  assert.equal(summary.total, 11000);
  assert.equal(summary.count, 3);
  assert.equal(summary.average, 11000 / 3);
  assert.equal(summary.max.amount, 8000);
  assert.equal(summary.categoryTotals[0].id, "salary");
  assert.equal(summary.categoryTotals[0].percent, 73);
  assert.deepEqual(summary.sourceRanking.map((item) => item.name), ["公司工资", "项目稿费"]);
  assert.equal(summary.sourceRanking[0].count, 2);
  assert.equal(summary.sourceRanking[0].total, 10000);
});

test("returns an empty but complete summary when no income exists", () => {
  const summary = buildIncomeSummary([
    { type: "expense", merchant: "午餐", category: "food", amount: 30 }
  ], incomeCategories);
  assert.equal(summary.total, 0);
  assert.equal(summary.count, 0);
  assert.equal(summary.average, 0);
  assert.equal(summary.max, undefined);
  assert.deepEqual(summary.categoryTotals, []);
  assert.deepEqual(summary.sourceRanking, []);
});

test("compares current income with the previous month", () => {
  assert.deepEqual(compareIncome(12000, 10000), {
    current: 12000,
    previous: 10000,
    delta: 2000,
    rate: 20
  });
  assert.equal(compareIncome(3000, 0).rate, null);
});
