import { categories, incomeCategories } from "./data.js";

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
  const source = /支付宝|alipay|花呗|余额宝/i.test(raw)
    ? "支付宝"
    : /微信|wechat|weixin|零钱|零钱通/i.test(raw)
      ? "微信"
      : "其他";
  const merchant = extractMerchant(compact, lines);
  const type = detectRecordType(raw);
  const category = suggestCategory(merchant + " " + raw, type);
  const confidence = scoreConfidence({ amount, merchant, date, time, source });

  return {
    id: `pending-${Date.now()}`,
    type,
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

export function suggestCategory(text, type = "expense") {
  const haystack = String(text || "").toLowerCase();
  const source = type === "income" ? incomeCategories : categories;
  const matched = source.find((category) =>
    category.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  );
  return matched?.id || (type === "income" ? "income-other" : "other");
}

function detectRecordType(text) {
  if (/收款成功|已收款|收到转账|转入|入账|到账|工资|薪资|薪水|奖金|退款|退回|返现|理财收益|利息/i.test(text)) {
    return "income";
  }
  return "expense";
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
  const relativeDate = extractRelativeDate(text, now);

  for (const regex of dateRegexes) {
    const match = text.match(regex);
    if (!match) continue;
    if (match[1].length === 4) {
      if (!isValidMonthDay(match[2], match[3])) continue;
      return {
        date: `${match[1]}-${pad(match[2])}-${pad(match[3])}`,
        time: match[4] || defaultTime
      };
    }
    if (!isValidMonthDay(match[1], match[2])) continue;
    return {
      date: `${now.getFullYear()}-${pad(match[1])}-${pad(match[2])}`,
      time: match[3] || defaultTime
    };
  }

  const time = extractTime(text) || defaultTime;
  return { date: relativeDate || defaultDate, time };
}

function extractRelativeDate(text, now) {
  const date = new Date(now);
  if (/前天/.test(text)) {
    date.setDate(date.getDate() - 2);
    return formatDate(date);
  }
  if (/昨天/.test(text)) {
    date.setDate(date.getDate() - 1);
    return formatDate(date);
  }
  if (/今天/.test(text)) {
    return formatDate(date);
  }
  return "";
}

function isValidMonthDay(month, day) {
  const parsedMonth = Number.parseInt(month, 10);
  const parsedDay = Number.parseInt(day, 10);
  return parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= 31;
}

function extractTime(text) {
  const meridiemMatch = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*([0-9]{1,2})[:：点]([0-5][0-9])?/);
  if (meridiemMatch) {
    const period = meridiemMatch[1] || "";
    let hour = Number.parseInt(meridiemMatch[2], 10);
    const minute = meridiemMatch[3] || "00";
    if (/下午|晚上/.test(period) && hour < 12) hour += 12;
    if (/凌晨|早上|上午/.test(period) && hour === 12) hour = 0;
    return `${pad(hour)}:${minute}`;
  }

  const timeMatch = text.match(/([01]?[0-9]|2[0-3]):[0-5][0-9]/);
  return timeMatch?.[0] || "";
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
    if (/付款成功|支付成功|交易成功|微信|支付宝|￥|¥|金额|订单|单号|时间|账单|账单详情|银行卡|余额|零钱|使用.*支付|上午|下午|晚上|昨天|今天|前天/.test(line)) return false;
    return line.length >= 2 && line.length <= 18;
  });

  return usefulLine ? cleanMerchant(usefulLine) : "未识别商户";
}

function cleanMerchant(value) {
  return String(value || "")
    .replace(/(付款|支付|成功|消费|收款|账单|截图|OCR|微信支付|支付宝|商户名称|商户|交易对象)/g, "")
    .replace(/(使用|零钱支付|账单详情)/g, "")
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
