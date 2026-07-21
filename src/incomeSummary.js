export function buildIncomeSummary(records = [], incomeCategories = []) {
  const items = (Array.isArray(records) ? records : []).filter((item) => item?.type === "income");
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categoryTotals = (Array.isArray(incomeCategories) ? incomeCategories : [])
    .map((category) => {
      const categoryTotal = items
        .filter((item) => item.category === category.id)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return {
        ...category,
        total: categoryTotal,
        percent: total ? Math.round((categoryTotal / total) * 100) : 0
      };
    })
    .filter((item) => item.total > 0)
    .sort((left, right) => right.total - left.total);

  const sources = new Map();
  items.forEach((item) => {
    const name = String(item.merchant || "未填写来源").trim() || "未填写来源";
    const current = sources.get(name) || { name, total: 0, count: 0 };
    current.total += Number(item.amount || 0);
    current.count += 1;
    sources.set(name, current);
  });
  const sourceRanking = Array.from(sources.values())
    .map((source) => ({
      ...source,
      average: source.count ? source.total / source.count : 0,
      percent: total ? Math.round((source.total / total) * 100) : 0
    }))
    .sort((left, right) => right.total - left.total || right.count - left.count);

  return {
    items,
    total,
    count: items.length,
    average: items.length ? total / items.length : 0,
    max: items.slice().sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0],
    categoryTotals,
    topCategory: categoryTotals[0],
    sourceRanking
  };
}

export function compareIncome(currentTotal, previousTotal) {
  const current = Number(currentTotal || 0);
  const previous = Number(previousTotal || 0);
  const delta = current - previous;
  const rate = previous > 0 ? (delta / previous) * 100 : null;
  return { current, previous, delta, rate };
}
