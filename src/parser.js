import { categories, incomeCategories } from "./data.js";
import { createId } from "./ids.js";

const MONEY_VALUE = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
const amountRegexes = [
  new RegExp(`(?:￥|¥|RMB|CNY)\\s*${MONEY_VALUE}`, "i"),
  /(?:-|−)\s*([0-9][0-9,]*\.[0-9]{1,2})(?=\s|元|$)/i,
  new RegExp(`(?:金额|付款金额|支付金额|交易金额|订单金额|实付|实付款|已付款|消费|支出|扣款|收款|收入|到账|退款)\\s*[:：]?\\s*(?:￥|¥|RMB|CNY)?\\s*${MONEY_VALUE}`, "i"),
  new RegExp(`${MONEY_VALUE}\\s*(?:元|CNY|RMB)`, "i")
];

const dateRegexes = [
  /([0-9]{4})[-/.年]([0-9]{1,2})[-/.月]([0-9]{1,2})日?\s*(?:周[一二三四五六日天]\s*)?([0-9]{1,2}[:：][0-9]{2})?/,
  /([0-9]{1,2})[-/.月]([0-9]{1,2})日?\s*(?:周[一二三四五六日天]\s*)?([0-9]{1,2}[:：][0-9]{2})?/
];

const platformRules = [
  { method: "支付宝", pattern: /支付宝|alipay|花呗|余额宝|蚂蚁/i },
  { method: "微信", pattern: /微信|wechat|weixin|零钱|零钱通|财付通/i },
  { method: "银行卡", pattern: /银行卡|信用卡|储蓄卡|银行|银联/i }
];

const merchantPatterns = [
  /(?:收款方|收款账户|商户名称|商户全称|商户|商家名称|商家|店铺名称|交易对象|交易对方|对方账户|对方|商品名称|商品说明)\s*[:：]?\s*([^\n￥¥,，。；;]{2,40}?)(?=\s+(?:付款方式|支付方式|交易时间|付款时间|订单号|交易号|商户单号|交易单号|20[0-9]{2}[-/.年]|￥|¥)|$)/i,
  /向\s*([^\n￥¥,，。；;]+?)\s*(?:付款|支付|转账)/i,
  /(?:付款给|支付给|转账给)\s*([^\n￥¥,，。；;]+?)(?=\s+(?:付款|支付|转账|成功|￥|¥)|$)/i,
  /(?:微信支付|支付宝)\s*[-—]?\s*([^\n￥¥,，。；;]+?)\s*(?:付款|支付|消费|交易|收款)(?:成功)?/i
];

const uselessLinePattern = /付款成功|支付成功|交易成功|扣款成功|消费成功|收款成功|退款成功|微信|支付宝|￥|¥|RMB|CNY|金额|订单|单号|时间|账单|详情|银行卡|余额|零钱|使用.*支付|上午|下午|晚上|凌晨|昨天|今天|前天|付款方式|支付方式|商户单号|交易单号|当前状态|完成|成功|待确认/i;
const merchantLabelPattern = /^(?:收款方|收款账户|商户名称|商户全称|商户|商家名称|商家|店铺名称|交易对象|交易对方|对方账户|对方|付款给|支付给|转账给|商品名称|商品说明|商品)\s*[:：]?\s*(.*)$/i;
const merchantNoisePattern = /^(?:账单详情|交易详情|付款详情|订单详情|支付成功|付款成功|交易成功|扣款成功|消费成功|收款成功|退款成功|当前状态|交易状态|已完成|完成|查看详情|全部账单|服务详情|服务通知|服务提醒|账单提醒|交易提醒|消息通知|支付通知|收款通知|商家服务|微信团队|微信支付|支付宝|微信|付款方式.*|支付方式.*|交易时间.*|付款时间.*|创建时间.*|订单号.*|交易号.*|商户单号.*|交易单号.*|使用.*支付|零钱(?:通)?|余额(?:宝)?|银行卡|信用卡|储蓄卡|昨天.*|今天.*|前天.*|上午.*|下午.*|晚上.*|凌晨.*|待确认)$/i;
const merchantStrongHintPattern = /店|商行|超市|便利|咖啡|餐饮|外卖|公司|企业|中心|医院|药房|地铁|公交|航空|酒店|宾馆|影院|科技|网络|水务|自来水|工作室|服务部|旗舰店|专营店/i;

export function parseExpenseText(rawText, expenseCategories = categories) {
  const raw = normalizeOcrText(rawText);
  const compact = raw.replace(/\s+/g, " ").trim();
  const lines = splitUsefulLines(raw);
  const method = detectMethod(raw);
  const type = detectRecordType(raw);
  const amount = extractAmount(raw, compact, lines);
  const { date, time } = extractDateTime(raw);
  const merchant = extractMerchant(compact, lines);
  const category = suggestCategory(`${merchant} ${raw}`, type, expenseCategories);
  const confidence = scoreConfidence({ amount, merchant, date, time, method });

  return {
    id: createId("pending"),
    type,
    amount,
    merchant,
    category,
    method,
    source: /截图|账单|OCR|图片/i.test(raw) ? "截图识别" : "通知识别",
    date,
    time,
    confidence,
    rawText: raw
  };
}

export function suggestCategory(text, type = "expense", expenseCategories = categories) {
  const haystack = String(text || "").toLowerCase();
  const source = type === "income"
    ? incomeCategories
    : [...expenseCategories].sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)));
  const matched = source.find((category) =>
    category.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  );
  return matched?.id || (type === "income" ? "income-other" : "other");
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[﹩＄]/g, "￥")
    .replace(/[￥¥]\s*([0-9])/g, "￥$1")
    .replace(/([0-9]),([0-9]{3})(?=\D|$)/g, "$1$2")
    .replace(/[|｜]/g, " ")
    .replace(/[；;]/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitUsefulLines(raw) {
  return raw
    .split(/\r?\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectMethod(text) {
  return platformRules.find((rule) => rule.pattern.test(text))?.method || "其他";
}

function detectRecordType(text) {
  if (/收款成功|已收款|二维码收款|收到转账|转入|入账|到账|收入|工资|薪资|薪水|奖金|退款到账|退回|返现|理财收益|利息/i.test(text)) {
    return "income";
  }
  return "expense";
}

function extractAmount(raw, compact, lines) {
  for (const regex of amountRegexes) {
    const match = compact.match(regex);
    if (match) return parseMoney(match[1]);
  }

  const scored = [];
  for (const line of lines) {
    const matches = [...line.matchAll(/[0-9][0-9,]*(?:\.[0-9]{1,2})?/g)];
    for (const match of matches) {
      const value = parseMoney(match[0]);
      if (!isLikelyMoney(value, match[0], line)) continue;
      let score = 0;
      if (/[￥¥元]/.test(line)) score += 6;
      if (/金额|实付|付款|支付|交易|消费|扣款|收款|收入|到账|退款/.test(line)) score += 5;
      if (/\.[0-9]{1,2}/.test(match[0])) score += 3;
      if (/订单|单号|编号|流水|时间|余额/.test(line)) score -= 5;
      scored.push({ value, score });
    }
  }

  if (!scored.length) {
    const matches = [...raw.matchAll(/[0-9][0-9,]*(?:\.[0-9]{1,2})?/g)]
      .map((match) => ({ value: parseMoney(match[0]), raw: match[0] }))
      .filter((item) => isLikelyMoney(item.value, item.raw, raw));
    return matches.length ? matches.sort((a, b) => b.value - a.value)[0].value : 0;
  }

  scored.sort((a, b) => b.score - a.score || b.value - a.value);
  return scored[0].value;
}

function parseMoney(value) {
  return Number.parseFloat(String(value || "").replace(/,/g, ""));
}

function isLikelyMoney(value, rawValue, context) {
  if (!Number.isFinite(value) || value <= 0 || value >= 100000) return false;
  if (/^20[0-9]{2}$/.test(rawValue)) return false;
  if (/\b[0-9]{4}[-/.年][0-9]{1,2}/.test(context) && value >= 2000 && value <= 2099) return false;
  if (String(rawValue).replace(/\D/g, "").length >= 8 && !rawValue.includes(".")) return false;
  return true;
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
        time: normalizeTime(match[4]) || extractTime(text) || defaultTime
      };
    }
    if (!isValidMonthDay(match[1], match[2])) continue;
    return {
      date: `${now.getFullYear()}-${pad(match[1])}-${pad(match[2])}`,
      time: normalizeTime(match[3]) || extractTime(text) || defaultTime
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
  if (/今天/.test(text)) return formatDate(date);
  return "";
}

function extractTime(text) {
  const meridiemMatch = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*([0-9]{1,2})[:：点]([0-5][0-9])?/);
  if (meridiemMatch) {
    const period = meridiemMatch[1] || "";
    let hour = Number.parseInt(meridiemMatch[2], 10);
    const minute = meridiemMatch[3] || "00";
    if (/下午|晚上/.test(period) && hour < 12) hour += 12;
    if (/凌晨|早上|上午/.test(period) && hour === 12) hour = 0;
    if (/中午/.test(period) && hour < 11) hour += 12;
    if (hour >= 0 && hour <= 23) return `${pad(hour)}:${minute}`;
  }

  const timeMatch = text.match(/([01]?[0-9]|2[0-3])[:：][0-5][0-9]/);
  return normalizeTime(timeMatch?.[0]);
}

function normalizeTime(value) {
  return value ? value.replace("：", ":") : "";
}

function extractMerchant(compact, lines) {
  const candidates = [];
  const addCandidate = (value, score, index = lines.length) => {
    const merchant = cleanMerchant(value);
    if (!isMerchantCandidate(merchant)) return;
    candidates.push({ merchant, score, index });
  };

  lines.forEach((line, index) => {
    const labelMatch = line.match(merchantLabelPattern);
    if (!labelMatch) return;
    if (labelMatch[1]) addCandidate(labelMatch[1], 140, index);
    for (let offset = 1; offset <= 3 && index + offset < lines.length; offset += 1) {
      const nextLine = lines[index + offset];
      const beforeCount = candidates.length;
      addCandidate(nextLine, 132 - offset * 6, index + offset);
      if (candidates.length > beforeCount) break;
    }
  });

  for (const pattern of merchantPatterns) {
    const match = compact.match(pattern);
    if (match) addCandidate(match[1], 104);
  }

  lines.forEach((line, index) => {
    if (merchantLabelPattern.test(line)) return;
    let score = 38;
    if (merchantStrongHintPattern.test(line)) score += 24;
    if (index <= 5) score += 8 - index;
    if (/公司|企业|店|中心|医院|商行|旗舰店|专营店/.test(line)) score += 10;
    const previousLine = lines[index - 1] || "";
    const nextLine = lines[index + 1] || "";
    if (/[￥¥]\s*[0-9]|金额|实付/.test(previousLine) || /[￥¥]\s*[0-9]|金额|实付/.test(nextLine)) score += 16;
    addCandidate(line, score, index);
  });

  candidates.sort((a, b) => b.score - a.score || a.index - b.index || a.merchant.length - b.merchant.length);
  return candidates[0]?.merchant || "未识别商户";
}

function cleanMerchant(value) {
  const cleaned = String(value || "")
    .replace(/^(?:付款方|付款账户|收款方|收款账户|商户名称|商户全称|商户|商家名称|商家|店铺名称|交易对象|交易对方|对方账户|对方|付款给|支付给|转账给|商品名称|商品说明|商品)\s*[:：]?\s*/i, "")
    .replace(/\s+(?:付款方式|支付方式|交易时间|付款时间|订单号|交易号|商户单号|交易单号)\s*[:：]?.*$/i, "")
    .replace(/\s*(?:付款成功|支付成功|交易成功|收款成功|查看详情|详情|完成)\s*$/i, "")
    .replace(/[0-9]{4}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}日?/g, "")
    .replace(/[0-9]{1,2}[:：][0-9]{2}/g, "")
    .replace(/[￥¥]\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?/g, "")
    .replace(/\s+[-+]?[0-9][0-9,]*\.[0-9]{1,2}\s*$/g, "")
    .replace(/^[：:，,。；;\-—\s]+|[：:，,。；;\-—\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 32) || "未识别商户";
}

function isMerchantCandidate(value) {
  if (!value || value === "未识别商户") return false;
  if (value.length < 2 || value.length > 32) return false;
  if (merchantNoisePattern.test(value)) return false;
  if (!/[A-Za-z\u4e00-\u9fff]/.test(value)) return false;
  if (/^[0-9\s()+\-*/.]+$/.test(value)) return false;
  if (/[￥¥]|\b20[0-9]{2}[-/.年]/.test(value)) return false;
  return true;
}

function scoreConfidence(candidate) {
  let score = 34;
  if (candidate.amount > 0) score += 28;
  if (candidate.merchant && candidate.merchant !== "未识别商户") score += 20;
  if (candidate.date) score += 7;
  if (candidate.time) score += 6;
  if (candidate.method !== "其他") score += 5;
  return Math.min(score, 98);
}

function isValidMonthDay(month, day) {
  const parsedMonth = Number.parseInt(month, 10);
  const parsedDay = Number.parseInt(day, 10);
  return parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= 31;
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
