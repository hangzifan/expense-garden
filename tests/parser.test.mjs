import test from "node:test";
import assert from "node:assert/strict";
import { parseExpenseText, suggestCategory } from "../src/parser.js";
import { categories } from "../src/data.js";

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test("parses an alipay screenshot with labeled merchant and datetime", () => {
  const parsed = parseExpenseText("支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32");
  assert.equal(parsed.amount, 128);
  assert.equal(parsed.merchant, "盒马鲜生");
  assert.equal(parsed.method, "支付宝");
  assert.equal(parsed.type, "expense");
  assert.equal(parsed.category, "shopping");
  assert.equal(parsed.date, "2026-07-01");
  assert.equal(parsed.time, "19:32");
});

test("parses a wechat payment notification with 收款方 label", () => {
  const parsed = parseExpenseText("微信支付 付款成功 ¥36.50 收款方：美团外卖 2026-07-01 12:24");
  assert.equal(parsed.amount, 36.5);
  assert.equal(parsed.merchant, "美团外卖");
  assert.equal(parsed.method, "微信");
  assert.equal(parsed.category, "food");
  assert.equal(parsed.date, "2026-07-01");
  assert.equal(parsed.time, "12:24");
});

test("detects income from arrival wording", () => {
  const parsed = parseExpenseText("微信支付 收款到账 ¥200.00 付款方：张三");
  assert.equal(parsed.type, "income");
  assert.equal(parsed.amount, 200);
});

test("resolves 昨天/下午 relative datetime", () => {
  const parsed = parseExpenseText("微信支付 支付成功 ¥50.00 昨天 下午5:26");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(parsed.amount, 50);
  assert.equal(parsed.date, formatDate(yesterday));
  assert.equal(parsed.time, "17:26");
  assert.equal(parsed.method, "微信");
});

test("does not mistake a year for the amount", () => {
  const parsed = parseExpenseText("支付宝 2026-07-27 支付成功 15.00元");
  assert.equal(parsed.amount, 15);
});

test("custom category keywords outrank built-in keywords", () => {
  const custom = [...categories, { id: "pet", name: "宠物", icon: "tag", color: "#000", keywords: ["猫粮"], custom: true }];
  assert.equal(suggestCategory("盒马购买猫粮", "expense", custom), "pet");
});
