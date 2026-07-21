import test from "node:test";
import assert from "node:assert/strict";
import { parseExpenseText } from "../src/parser.js";
import { predictMerchantCandidates, refineWithMerchantMemory } from "../src/merchantMemory.js";

const history = [
  { type: "expense", merchant: "茶百道", category: "food", method: "微信", date: "2026-07-10", time: "12:00" },
  { type: "expense", merchant: "茶百道", category: "food", method: "微信", date: "2026-07-11", time: "12:00" },
  { type: "expense", merchant: "盒马鲜生", category: "shopping", method: "支付宝", date: "2026-07-12", time: "18:00" },
  { type: "expense", merchant: "小王", category: "other", method: "微信", date: "2026-07-13", time: "18:00" },
  { type: "income", merchant: "工资", category: "salary", method: "银行卡", date: "2026-07-14", time: "09:00" }
];

test("corrects a one-character OCR error using confirmed merchant history", () => {
  const raw = "微信支付\n付款成功 ¥28.80\n收款方：茶百遒";
  const result = refineWithMerchantMemory(parseExpenseText(raw), raw, history);
  assert.equal(result.merchant, "茶百道");
  assert.equal(result.category, "food");
  assert.equal(result.merchantMemory.matchType, "fuzzy");
});

test("recovers a known merchant when another line was parsed as merchant", () => {
  const raw = "支付宝\n盒马鲜生\n支付成功 ¥86.50";
  const parsed = { ...parseExpenseText(raw), merchant: "支付服务" };
  const result = refineWithMerchantMemory(parsed, raw, history);
  assert.equal(result.merchant, "盒马鲜生");
  assert.equal(result.category, "shopping");
});

test("does not fuzzy-overwrite short merchant names", () => {
  const raw = "微信支付\n付款成功 ¥20.00\n收款方：小李";
  const result = refineWithMerchantMemory(parseExpenseText(raw), raw, history);
  assert.equal(result.merchant, "小李");
  assert.equal(result.merchantMemory, undefined);
});

test("keeps income and expense merchant memories isolated", () => {
  const raw = "到账 ¥8000.00\n工资";
  const result = refineWithMerchantMemory(parseExpenseText(raw), raw, history);
  assert.equal(result.type, "income");
  assert.equal(result.merchant, "工资");
  assert.equal(result.category, "salary");
});

test("uses platform method from the notification instead of historical fallback", () => {
  const raw = "支付宝\n付款成功 ¥28.80\n收款方：茶百道";
  const result = refineWithMerchantMemory(parseExpenseText(raw), raw, history);
  assert.equal(result.merchant, "茶百道");
  assert.equal(result.method, "支付宝");
});

test("learns an exact OCR alias after the user corrected and confirmed it", () => {
  const correctedHistory = [{
    type: "expense",
    merchant: "霸王茶姬",
    recognizedMerchant: "霸玉茶姬",
    category: "food",
    method: "微信",
    date: "2026-07-16",
    time: "12:00"
  }];
  const raw = "微信支付\n付款成功 ¥19.00\n收款方：霸玉茶姬";
  const result = refineWithMerchantMemory(parseExpenseText(raw), raw, correctedHistory);
  assert.equal(result.merchant, "霸王茶姬");
  assert.equal(result.merchantMemory.matchType, "learned_alias");
});

test("auto-fills a repeated exact amount only when history is strong and unambiguous", () => {
  const repeatedHistory = [
    { type: "expense", merchant: "茶百道", category: "food", method: "微信", amount: 28.8, date: "2026-07-10", time: "12:00" },
    { type: "expense", merchant: "茶百道", category: "food", method: "微信", amount: 28.8, date: "2026-07-11", time: "12:10" },
    { type: "expense", merchant: "茶百道", category: "food", method: "微信", amount: 28.8, date: "2026-07-12", time: "12:20" },
    { type: "expense", merchant: "盒马鲜生", category: "shopping", method: "支付宝", amount: 86.5, date: "2026-07-12", time: "18:00" }
  ];
  const parsed = {
    type: "expense",
    amount: 28.8,
    merchant: "未识别商户",
    category: "other",
    method: "微信",
    date: "2026-07-17",
    time: "12:15"
  };
  const result = refineWithMerchantMemory(parsed, "微信支付\n付款成功 ¥28.80", repeatedHistory);
  assert.equal(result.merchant, "茶百道");
  assert.equal(result.category, "food");
  assert.equal(result.merchantMemory.matchType, "temporal_prediction");
  assert.equal(result.merchantSuggestions[0].name, "茶百道");
});

test("ranks candidates by amount, payment method, and time features", () => {
  const candidates = predictMerchantCandidates(
    {
      type: "expense",
      amount: 20,
      method: "微信",
      date: "2026-07-17",
      time: "12:20"
    },
    [
      { type: "expense", merchant: "午餐店", category: "food", method: "微信", amount: 20, date: "2026-07-10", time: "12:00" },
      { type: "expense", merchant: "午餐店", category: "food", method: "微信", amount: 20, date: "2026-07-11", time: "12:10" },
      { type: "expense", merchant: "便利店", category: "shopping", method: "支付宝", amount: 20, date: "2026-07-10", time: "18:00" },
      { type: "expense", merchant: "便利店", category: "shopping", method: "支付宝", amount: 20, date: "2026-07-11", time: "18:10" }
    ]
  );
  assert.equal(candidates[0].name, "午餐店");
  assert.ok(candidates[0].score > candidates[1].score);
});

test("keeps ambiguous history as suggestions instead of overwriting the merchant", () => {
  const historyWithTie = [
    { type: "expense", merchant: "甲店", category: "food", method: "微信", amount: 20, date: "2026-07-10", time: "12:00" },
    { type: "expense", merchant: "甲店", category: "food", method: "微信", amount: 20, date: "2026-07-11", time: "12:00" },
    { type: "expense", merchant: "乙店", category: "food", method: "微信", amount: 20, date: "2026-07-10", time: "12:00" },
    { type: "expense", merchant: "乙店", category: "food", method: "微信", amount: 20, date: "2026-07-11", time: "12:00" }
  ];
  const result = refineWithMerchantMemory(
    {
      type: "expense",
      amount: 20,
      merchant: "未识别商户",
      category: "other",
      method: "微信",
      date: "2026-07-17",
      time: "12:00"
    },
    "微信支付\n付款成功 ¥20.00",
    historyWithTie
  );
  assert.equal(result.merchant, "未识别商户");
  assert.equal(result.merchantMemory.matchType, "suggestion");
  assert.equal(result.merchantSuggestions.length, 2);
});

test("never predicts an expense merchant for income records", () => {
  const result = refineWithMerchantMemory(
    {
      type: "income",
      amount: 20,
      merchant: "未识别商户",
      category: "income-other",
      method: "微信",
      date: "2026-07-17",
      time: "12:00"
    },
    "到账 ¥20.00",
    history
  );
  assert.equal(predictMerchantCandidates(result, history).length, 0);
  assert.equal(result.merchant, "未识别商户");
  assert.equal(result.merchantSuggestions, undefined);
});

test("uses a custom income category when parsing an income record", () => {
  const customIncomeCategories = [
    { id: "salary", name: "工资", keywords: ["工资"] },
    { id: "freelance", name: "稿费", keywords: ["稿费", "项目结算"] },
    { id: "income-other", name: "其他", keywords: [] }
  ];
  const result = parseExpenseText(
    "到账 ¥1200.00\n项目稿费",
    undefined,
    customIncomeCategories
  );
  assert.equal(result.type, "income");
  assert.equal(result.category, "freelance");
});
