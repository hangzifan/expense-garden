import { useContext } from "react";
import { CategoryIcon } from "../categoryIcons.jsx";
import { ExpenseCategoriesContext, IncomeCategoriesContext } from "../categoryContext.js";

const recordTypeLabels = { expense: "支出", income: "收入" };

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "selected" : ""}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function TypeToggle({ value, onChange }) {
  return (
    <div className="type-toggle">
      {Object.entries(recordTypeLabels).map(([type, label]) => (
        <button
          key={type}
          type="button"
          className={value === type ? "selected" : ""}
          onClick={() => onChange(type)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function CategoryGrid({ value, onChange, compact = false, type = "expense" }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategories = useContext(IncomeCategoriesContext);
  const categorySource = type === "income" ? incomeCategories : expenseCategories;
  return (
    <div className={compact ? "category-grid compact" : "category-grid"}>
      {categorySource.map((category) => (
        <button
          key={category.id}
          type="button"
          className={value === category.id ? "selected" : ""}
          onClick={() => onChange(category.id)}
        >
          <span className="category-icon" style={{ color: category.color }}>
            <CategoryIcon name={category.icon} size={18} />
          </span>
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  );
}

