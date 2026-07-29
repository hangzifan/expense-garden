import { categories } from "../data.js";
import { createId } from "../ids.js";
import { refineWithMerchantMemory } from "../merchantMemory.js";
import { parseExpenseText } from "../parser.js";

export function normalizeNotificationItems(items, expenseCategories = categories, merchantHistory = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const rawText = String(item?.rawText || "").trim();
      if (!rawText && !Number(item?.amount)) return null;
      const base = parseExpenseText(rawText, expenseCategories);
      const explicitMerchant = String(item?.merchant || "").trim();
      const parsed = refineWithMerchantMemory(
        {
          ...base,
          ...(Number(item?.amount) > 0 ? { amount: Number(item.amount) } : {}),
          ...(explicitMerchant && explicitMerchant !== "未识别商户" ? { merchant: explicitMerchant } : {}),
          ...(item?.category ? { category: item.category } : {})
        },
        rawText,
        merchantHistory
      );
      const method = item?.packageName === "com.eg.android.AlipayGphone"
        ? "支付宝"
        : item?.packageName === "com.tencent.mm"
          ? "微信"
          : parsed.method;
      const suggestions = Array.isArray(item?.merchantSuggestions)
        ? item.merchantSuggestions
        : parsed.merchantSuggestions || [];
      const merchantMissing = !parsed.merchant || parsed.merchant === "未识别商户";

      return {
        ...parsed,
        id: item?.id ? `notice-${item.id}` : createId(`notice-${index}`),
        notificationId: item?.id || "",
        method,
        source: item?.source || "通知识别",
        rawText,
        merchantMissing,
        merchantSuggestions: suggestions,
        quickConfirmed: Boolean(item?.quickConfirmed),
        merchantPrediction: Boolean(item?.merchantPrediction),
        note: merchantMissing
          ? "通知未包含明确商户，请从候选中选择或手动填写"
          : item?.merchantPrediction
            ? "商户由历史消费习惯推测，请确认"
            : ""
      };
    })
    .filter(Boolean);
}

