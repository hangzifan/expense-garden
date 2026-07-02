import { categories } from "./data.js";

const amountRegexes = [
  /(?:￥|¥)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  /(?:￥|¥|RMB|人民币|金额|付款|支付|消费|支出)\s*[:：]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  /(?:实付|实付款|已付款|付款金额|支付金额|交易金额)\s*[:：]?\s*(?:￥|¥)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:元|CNY)/i
];

const dateRegexes = [
  /([0-9]{4})[-/.年]([0-9]{1,2})[-/.月]([0-9]{1,2})日?\s*([0-9]{1,2}:[0-9]{2})?/,
  /([0-9]{1,2})[-/.月]([0-9]{1,2})日?\s*([0-9]{1,2}:[0-9]{2})?/
];

export function parseExpenseText(rawText) {
  const raw = String(rawText || "").trim();
  const compact = raw.replace(/\s+/g, " ");
  const lines = raw
    .split(/\r?\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amount = extractAmount(compact);
  const { date, time } = extractDateTime(compact);
  const source = /支付宝|alipay/i.test(raw)
    ? "支付宝"
    : /微信|wechat|weixin/i.test(raw)
      ? "微信"
      : "其他";
  const merchant = extractMerchant(compact, lines);
  const category = suggestCategory(merchant + " " + raw);
  const confidence = scoreConfidence({ amount, merchant, date, time, source });

  return {
    id: `pending-${Date.now()}`,
    amount,
    merchant,
    category,
    method: source === "其他" ? "其他" : source,
    source: /截图|账单|OCR|图片/i.test(raw) ? "截图识别" : "通知识别",
    date,
    time,
    confidence,
    rawText: raw
  };
}

export function suggestCategory(text) {
  const haystack = String(text || "").toLowerCase();
  const matched = categories.find((category) =>
    category.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  );
  return matched?.id || "other";
}

function extractAmount(text) {
  for (const regex of amountRegexes) {
    const match = text.match(regex);
    if (match) return Number.parseFloat(match[1]);
  }

  const candidates = [...text.matchAll(/[0-9]+(?:\.[0-9]{1,2})?/g)]
    .map((match) => Number.parseFloat(match[0]))
    .filter((number) => number > 0 && number < 100000 && number !== 2026 && number !== 2025);
  return candidates.length ? candidates.sort((a, b) => b - a)[0] : 0;
}

function extractDateTime(text) {
  const now = new Date();
  const defaultDate = formatDate(now);
  const defaultTime = now.toTimeString().slice(0, 5);

  for (const regex of dateRegexes) {
    const match = text.match(regex);
    if (!match) continue;
    if (match[1].length === 4) {
      return {
        date: `${match[1]}-${pad(match[2])}-${pad(match[3])}`,
        time: match[4] || defaultTime
      };
    }
    return {
      date: `${now.getFullYear()}-${pad(match[1])}-${pad(match[2])}`,
      time: match[3] || defaultTime
    };
  }

  const timeMatch = text.match(/([01]?[0-9]|2[0-3]):[0-5][0-9]/);
  return { date: defaultDate, time: timeMatch?.[0] || defaultTime };
}

function extractMerchant(text, lines) {
  const patterns = [
    /(?:收款方|商户名称|商户|商家|交易对象|对方账户|对方|付款给|支付给|转账给)\s*[:：]?\s*([^￥¥\d，,。\n]+)/,
    /向\s*([^￥¥\d，,。\n]+?)\s*(?:付款|支付|转账)/,
    /(?:微信支付|支付宝)\s*[-—]?\s*([^￥¥\d，,。\n]+?)\s*(?:付款|支付|消费|交易)?(?:成功|￥|¥|$)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanMerchant(match[1]);
  }

  const usefulLine = lines.find((line) => {
    if (/付款成功|支付成功|交易成功|微信|支付宝|￥|¥|金额|订单|单号|时间|账单|银行卡|余额/.test(line)) return false;
    return line.length >= 2 && line.length <= 18;
  });

  return usefulLine ? cleanMerchant(usefulLine) : "未识别商户";
}

function cleanMerchant(value) {
  return String(value || "")
    .replace(/(付款|支付|成功|消费|收款|账单|截图|OCR|微信支付|支付宝|商户名称|商户|交易对象)/g, "")
    .replace(/[：:，,。]/g, "")
    .trim()
    .slice(0, 18) || "未识别商户";
}

function scoreConfidence(candidate) {
  let score = 42;
  if (candidate.amount > 0) score += 24;
  if (candidate.merchant && candidate.merchant !== "未识别商户") score += 18;
  if (candidate.date) score += 8;
  if (candidate.time) score += 5;
  if (candidate.source !== "其他") score += 3;
  return Math.min(score, 98);
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
