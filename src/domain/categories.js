import { categories, incomeCategories } from "../data.js";

export const fallbackCategories = {
  expense: { id: "other", name: "其他", icon: "tag", color: "#7b837d", keywords: [] },
  income: { id: "income-other", name: "其他收入", icon: "wallet", color: "#6f927d", keywords: [] }
};

export function getCategory(categoryId, type = "expense", expenseCategories = categories, incomeCategoryList = incomeCategories) {
  const source = type === "income" ? incomeCategoryList : expenseCategories;
  return source.find((entry) => entry.id === categoryId)
    || source.at(-1)
    || fallbackCategories[type === "income" ? "income" : "expense"];
}

export function mergeExpenseCategories(customCategories, categoryOrder = [], keywordOverrides = {}, categoryOverrides = {}) {
  const knownIds = new Set(categories.map((category) => category.id));
  const builtIn = categories.map((category) => {
    const override = categoryOverrides?.[category.id] || {};
    const overrideKeywords = Array.isArray(override.keywords)
      ? override.keywords
      : keywordOverrides?.[category.id];
    return {
      ...category,
      name: String(override.name || category.name).slice(0, 12),
      icon: override.icon || category.icon,
      color: override.color || category.color,
      custom: false,
      keywords: Array.isArray(overrideKeywords)
        ? overrideKeywords.filter(Boolean)
        : category.keywords
    };
  });
  const validCustom = (Array.isArray(customCategories) ? customCategories : [])
    .filter((category) => category?.id && category?.name && !knownIds.has(category.id))
    .map((category) => ({
      id: String(category.id),
      name: String(category.name).slice(0, 12),
      color: category.color || "#6f927d",
      icon: category.icon || "tag",
      keywords: Array.isArray(category.keywords) ? category.keywords.filter(Boolean) : [],
      custom: true
    }));
  return sortCategories([...builtIn, ...validCustom], categoryOrder, "other");
}

export function mergeIncomeCategories(customCategories, categoryOrder = [], categoryOverrides = {}) {
  const knownIds = new Set(incomeCategories.map((category) => category.id));
  const builtIn = incomeCategories.map((category) => {
    const override = categoryOverrides?.[category.id] || {};
    return {
      ...category,
      name: String(override.name || category.name).slice(0, 12),
      icon: override.icon || category.icon,
      color: override.color || category.color,
      custom: false,
      keywords: Array.isArray(override.keywords) ? override.keywords.filter(Boolean) : category.keywords
    };
  });
  return sortCategories([...builtIn, ...validCustomCategories(customCategories, knownIds)], categoryOrder, "income-other");
}

function validCustomCategories(customCategories, knownIds) {
  return (Array.isArray(customCategories) ? customCategories : [])
    .filter((category) => category?.id && category?.name && !knownIds.has(category.id))
    .map((category) => ({
      id: String(category.id),
      name: String(category.name).slice(0, 12),
      color: category.color || "#6f927d",
      icon: category.icon || "tag",
      keywords: Array.isArray(category.keywords) ? category.keywords.filter(Boolean) : [],
      custom: true
    }));
}

function sortCategories(allCategories, categoryOrder, fallbackId) {
  const fallback = allCategories.find((category) => category.id === fallbackId);
  const all = [...allCategories.filter((category) => category.id !== fallbackId), fallback].filter(Boolean);
  const byId = new Map(all.map((category) => [category.id, category]));
  const ordered = (Array.isArray(categoryOrder) ? categoryOrder : [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  const orderedIds = new Set(ordered.map((category) => category.id));
  return [...ordered, ...all.filter((category) => !orderedIds.has(category.id))];
}

export function parseCategoryKeywords(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/[、，,;；\n]+/)
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 30)
  ));
}

