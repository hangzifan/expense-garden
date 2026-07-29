import { useContext } from "react";
import { methods } from "../data.js";
import { fallbackCategories } from "../domain/categories.js";
import { ExpenseCategoriesContext, IncomeCategoriesContext } from "../categoryContext.js";
import { CategoryGrid, Field, SegmentedControl, TypeToggle } from "../components/FormControls.jsx";
import { CheckIcon } from "../icons.jsx";
import { AppHeader, Screen } from "../ui.jsx";

export function AddScreen({ draft, setDraft, editingId, onSave, onCancel }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategories = useContext(IncomeCategoriesContext);

  return (
    <Screen className="add-screen">
      <AppHeader
        eyebrow={editingId ? "编辑记录" : "每日收支"}
        title={editingId ? "调整这一笔" : "记一笔"}
      />

      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}>
        <Field label="类型">
          <TypeToggle
            value={draft.type}
            onChange={(type) => setDraft({
              ...draft,
              type,
              category: type === "income"
                ? incomeCategories[0]?.id || fallbackCategories.income.id
                : expenseCategories[0]?.id || fallbackCategories.expense.id
            })}
          />
        </Field>

        <label className="amount-input">
          <span>金额</span>
          <input
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
          />
        </label>

        <Field label="商户">
          <input
            value={draft.merchant}
            onChange={(event) => setDraft({ ...draft, merchant: event.target.value })}
            placeholder={draft.type === "income" ? "例如：工资、退款" : "例如：咖啡店"}
          />
        </Field>

        <Field label="分类">
          <CategoryGrid type={draft.type} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
        </Field>

        <div className="two-columns">
          <Field label="日期">
            <input value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} type="date" />
          </Field>
          <Field label="时间">
            <input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} type="time" />
          </Field>
        </div>

        <Field label="支付方式">
          <SegmentedControl value={draft.method} options={methods} onChange={(method) => setDraft({ ...draft, method })} />
        </Field>

        <Field label="备注">
          <textarea
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            placeholder="可选"
          />
        </Field>

        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
          <button className="primary-button" type="submit">
            <CheckIcon />
            {editingId ? "保存修改" : "保存"}
          </button>
        </div>
      </form>
    </Screen>
  );
}

