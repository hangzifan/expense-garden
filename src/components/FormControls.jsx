import { Children, cloneElement, isValidElement, useContext, useId } from "react";
import { CategoryIcon } from "../categoryIcons.jsx";
import { ExpenseCategoriesContext, IncomeCategoriesContext } from "../categoryContext.js";

const recordTypeLabels = { expense: "支出", income: "收入" };

export function Field({ label, children, hint = "", error = "" }) {
  const labelId = useId();
  const descriptionId = useId();
  let labelled = false;
  const labelledChildren = Children.map(children, (child) => {
    const isNativeControl = isValidElement(child)
      && ["input", "textarea", "select"].includes(child.type);
    if (!isNativeControl || labelled) return child;
    labelled = true;
    return cloneElement(child, {
      "aria-labelledby": child.props["aria-label"] || child.props["aria-labelledby"]
        ? child.props["aria-labelledby"]
        : labelId,
      "aria-describedby": child.props["aria-describedby"] || (hint || error ? descriptionId : undefined),
      "aria-invalid": child.props["aria-invalid"] ?? Boolean(error)
    });
  });

  return (
    <div className="field" role="group" aria-labelledby={labelId}>
      <span className="field-label" id={labelId}>{label}</span>
      {labelledChildren}
      {(hint || error) && (
        <small className={error ? "field-message error" : "field-message"} id={descriptionId}>
          {error || hint}
        </small>
      )}
    </div>
  );
}

export function SegmentedControl({ value, options, onChange, ariaLabel = "选项" }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "selected" : ""}
          aria-pressed={value === option}
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
    <div className="type-toggle" role="group" aria-label="收支类型">
      {Object.entries(recordTypeLabels).map(([type, label]) => (
        <button
          key={type}
          type="button"
          className={value === type ? "selected" : ""}
          aria-pressed={value === type}
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
    <div
      className={compact ? "category-grid compact" : "category-grid"}
      role="group"
      aria-label={type === "income" ? "收入分类" : "支出分类"}
    >
      {categorySource.map((category) => (
        <button
          key={category.id}
          type="button"
          className={value === category.id ? "selected" : ""}
          aria-pressed={value === category.id}
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
