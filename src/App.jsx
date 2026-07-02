import React, { useEffect, useMemo, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { categories, coverPresets, methods, themes } from "./data.js";
import { downloadJson, loadState, readFileAsDataUrl, readFileAsText, saveState } from "./storage.js";
import { parseExpenseText, suggestCategory } from "./parser.js";
import {
  BellIcon,
  ChartIcon,
  CheckIcon,
  EditIcon,
  PlusIcon,
  ScanIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  WalletIcon
} from "./icons.jsx";

const navItems = [
  { id: "home", label: "首页", icon: WalletIcon },
  { id: "add", label: "记一笔", icon: PlusIcon },
  { id: "scan", label: "识别", icon: ScanIcon },
  { id: "report", label: "月报", icon: ChartIcon },
  { id: "profile", label: "我的", icon: UserIcon }
];

const XzbOcr = registerPlugin("XzbOcr");

const emptyDraft = () => ({
  amount: "",
  merchant: "",
  category: "food",
  method: "微信",
  date: today(),
  time: currentTime(),
  note: ""
});

function App() {
  const initial = useMemo(loadState, []);
  const [expenses, setExpenses] = useState(initial.expenses);
  const [pending, setPending] = useState(initial.pending);
  const [settings, setSettings] = useState(initial.settings);
  const [activeTab, setActiveTab] = useState("home");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const theme = themes.find((item) => item.id === settings.themeId) || themes[0];
  const appState = useMemo(() => ({ expenses, pending, settings }), [expenses, pending, settings]);
  const currentMonth = today().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const monthlyExpenses = useMemo(
    () => expenses.filter((expense) => expense.date?.startsWith(selectedMonth)),
    [expenses, selectedMonth]
  );
  const stats = useMemo(
    () => getMonthStats(monthlyExpenses, settings.budget, selectedMonth),
    [monthlyExpenses, settings.budget, selectedMonth]
  );

  useEffect(() => {
    saveState(appState);
  }, [appState]);

  useEffect(() => {
    document.documentElement.style.setProperty("--primary", theme.primary);
    document.documentElement.style.setProperty("--accent", theme.accent);
    document.body.dataset.theme = settings.darkMode ? "dark" : "light";
  }, [theme, settings.darkMode]);

  function saveExpense(entry) {
    const normalized = {
      ...entry,
      amount: Number(entry.amount),
      id: editingId || `expense-${Date.now()}`,
      source: entry.source || "手动"
    };

    if (!normalized.amount || normalized.amount <= 0) return;

    setExpenses((items) =>
      editingId ? items.map((item) => (item.id === editingId ? normalized : item)) : [normalized, ...items]
    );
    setDraft(emptyDraft());
    setEditingId("");
    setActiveTab("home");
  }

  function confirmPending(entry) {
    const expense = {
      ...entry,
      id: `expense-${Date.now()}`,
      amount: Number(entry.amount),
      note: entry.note || "",
      source: entry.source || "识别"
    };
    setExpenses((items) => [expense, ...items]);
    setPending((items) => items.filter((item) => item.id !== entry.id));
  }

  function editExpense(expense) {
    setDraft({
      amount: String(expense.amount),
      merchant: expense.merchant,
      category: expense.category,
      method: expense.method,
      date: expense.date,
      time: expense.time,
      note: expense.note || "",
      source: expense.source
    });
    setEditingId(expense.id);
    setActiveTab("add");
  }

  function requestDeleteExpense(expense) {
    setDeleteTarget(expense);
  }

  function confirmDeleteExpense() {
    if (!deleteTarget) return;
    setExpenses((items) => items.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function addPending(entry) {
    setPending((items) => [{ ...entry, id: `pending-${Date.now()}` }, ...items]);
    setActiveTab("home");
  }

  return (
    <div className="app-shell">
      <main className="phone-frame">
        {activeTab === "home" && (
          <HomeScreen
            stats={stats}
            expenses={monthlyExpenses}
            pending={pending}
            settings={settings}
            selectedMonth={selectedMonth}
            currentMonth={currentMonth}
            onMonthChange={setSelectedMonth}
            onTab={setActiveTab}
            onConfirm={confirmPending}
            onDeletePending={(id) => setPending((items) => items.filter((item) => item.id !== id))}
            onEdit={editExpense}
            onDelete={requestDeleteExpense}
          />
        )}
        {activeTab === "add" && (
          <AddScreen draft={draft} setDraft={setDraft} editingId={editingId} onSave={saveExpense} onCancel={() => {
            setEditingId("");
            setDraft(emptyDraft());
            setActiveTab("home");
          }} />
        )}
        {activeTab === "scan" && <ScanScreen onPending={addPending} />}
        {activeTab === "report" && (
          <ReportScreen
            stats={stats}
            expenses={monthlyExpenses}
            budget={settings.budget}
            selectedMonth={selectedMonth}
            currentMonth={currentMonth}
            onMonthChange={setSelectedMonth}
            onEdit={editExpense}
            onDelete={requestDeleteExpense}
          />
        )}
        {activeTab === "profile" && (
          <ProfileScreen
            settings={settings}
            setSettings={setSettings}
            state={appState}
            setExpenses={setExpenses}
            setPending={setPending}
          />
        )}
        {deleteTarget && (
          <ConfirmDeleteModal
            item={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmDeleteExpense}
          />
        )}
        <BottomNav activeTab={activeTab} onTab={setActiveTab} />
      </main>
    </div>
  );
}

function HomeScreen({
  stats,
  expenses,
  pending,
  settings,
  selectedMonth,
  currentMonth,
  onMonthChange,
  onTab,
  onConfirm,
  onDeletePending,
  onEdit,
  onDelete
}) {
  const latest = expenses.slice(0, 6);
  const coverStyle = getCoverStyle(settings);
  const isCurrentMonth = selectedMonth === currentMonth;

  return (
    <Screen className="home-screen">
      <section className="home-hero">
        <header className="topbar">
          <div>
            <p className="date-line">{formatReadableDate(today())}</p>
            <h1>小账本</h1>
          </div>
          <button className="icon-button" type="button" aria-label="自定义封面" onClick={() => onTab("profile")}>
            <UserIcon />
          </button>
        </header>

        <div className="cover-panel" style={coverStyle}>
          <div className="cover-image-area" />
          <div className="cover-data-area">
            <div className="cover-stat-main">
              <span>{isCurrentMonth ? "本月支出" : "所选月支出"}</span>
              <strong>{money(stats.total)}</strong>
            </div>
            <div className="today-chip">
              <span>{isCurrentMonth ? "今日" : "日均"}</span>
              <b>{money(isCurrentMonth ? stats.todayTotal : stats.dailyAverage)}</b>
            </div>
            <div className="budget-block">
              <div className="budget-row">
                <span>预算 {money(stats.budget)}</span>
                <span>{Math.round(stats.usedRate)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.min(stats.usedRate, 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden="true" />
      </section>

      <section className="home-below-fold">
        <div className="quick-grid">
          <ActionButton icon={PlusIcon} label="记一笔" onClick={() => onTab("add")} />
          <ActionButton icon={UploadIcon} label="导入截图" onClick={() => onTab("scan")} />
          <ActionButton icon={BellIcon} label="通知识别" onClick={() => onTab("scan")} />
        </div>

        <MonthPicker value={selectedMonth} max={currentMonth} onChange={onMonthChange} />

        <SectionTitle title="待确认" aside={`${pending.length} 条`} />
        <div className="stack">
          {pending.length === 0 && <EmptyLine text="没有待确认账单" />}
          {pending.map((item) => (
            <PendingCard key={item.id} item={item} onConfirm={onConfirm} onDelete={onDeletePending} />
          ))}
        </div>

        <SectionTitle title="最近记录" aside={formatMonthLabel(selectedMonth)} />
        <ExpenseList items={latest} onEdit={onEdit} onDelete={onDelete} />
      </section>
    </Screen>
  );
}

function AddScreen({ draft, setDraft, editingId, onSave, onCancel }) {
  return (
    <Screen>
      <header className="screen-heading">
        <p>{editingId ? "编辑消费" : "每日消费"}</p>
        <h2>{editingId ? "调整这一笔" : "记一笔"}</h2>
      </header>

      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}>
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
            placeholder="例如：咖啡店"
          />
        </Field>

        <Field label="分类">
          <CategoryGrid value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
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

function ScanScreen({ onPending }) {
  const [rawText, setRawText] = useState("");
  const [notificationText, setNotificationText] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("等待截图");
  const [imageNotice, setImageNotice] = useState("");
  const [notificationNotice, setNotificationNotice] = useState("");

  async function pickImageWithNativeOcr() {
    setCandidate(null);
    setRawText("");
    setPreview("");
    setImageNotice("");

    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      setStatus("需要安卓安装包");
      setImageNotice("请在手机安装包里使用系统选图识别；网页预览只能手动粘贴文字识别。");
      return;
    }

    setStatus("正在打开相册");
    try {
      const result = await XzbOcr.pickImageAndRecognize();
      const text = String(result?.text || "").trim();
      setRawText(text);

      if (!text) {
        setStatus("未识别到文字");
        setImageNotice("这张图没有读到文字，请换一张更清晰的支付成功截图或账单截图。");
        return;
      }

      setStatus("已读取文字");
      recognizeFromText(text, "截图识别");
    } catch (error) {
      setStatus("等待截图");
      setImageNotice(error?.message || "没有选择图片。");
    }
  }

  async function handleImage(file) {
    if (!file) return;
    setPreview(await readFileAsDataUrl(file));
    setRawText("");
    setCandidate(null);
    setStatus("正在读取文字");
    setImageNotice("");

    if ("TextDetector" in window) {
      try {
        const detector = new window.TextDetector();
        const bitmap = await createImageBitmap(file);
        const detections = await detector.detect(bitmap);
        const text = detections.map((item) => item.rawValue).join("\n");
        setRawText(text);
        setStatus(text ? "已读取文字" : "等待文字");
        if (!text) setImageNotice("没有读取到文字，请把账单文字粘贴到文本框后再识别。");
      } catch {
        setStatus("等待文字");
        setImageNotice("没有读取到文字，请把账单文字粘贴到文本框后再识别。");
      }
    } else {
      setStatus("已导入，等待文字");
      setImageNotice("网页备用导入只能预览截图；手机安装包请用上方系统选图识别。");
    }
  }

  function recognizeFromText(text, source) {
    const normalizedText = String(text || "").trim();
    const setSourceNotice = source === "截图识别" ? setImageNotice : setNotificationNotice;
    if (!normalizedText) {
      const message = source === "截图识别"
        ? "没有可识别的文字，请先粘贴账单文字。"
        : "请先粘贴微信或支付宝通知文本。";
      if (source === "截图识别") setStatus("缺少识别文本");
      setSourceNotice(message);
      setCandidate(null);
      return;
    }

    const parsed = parseExpenseText(normalizedText);
    const nextCandidate = { ...parsed, source };
    setCandidate(nextCandidate);
    setSourceNotice(
      !nextCandidate.amount || nextCandidate.merchant === "未识别商户"
        ? "识别结果不完整，请检查金额和商户后再确认。"
        : "已生成候选账单，请确认后入账。"
    );
    if (source === "截图识别") setStatus("已生成候选账单");
  }

  function saveCandidate() {
    if (!candidate) return;
    onPending(candidate);
    setCandidate(null);
    setRawText("");
    setNotificationText("");
    setStatus("等待截图");
    setImageNotice("");
    setNotificationNotice("");
  }

  return (
    <Screen>
      <header className="screen-heading">
        <p>导入截图</p>
        <h2>识别后确认</h2>
      </header>

      <div className="import-panel">
        <button className="primary-button full" type="button" onClick={pickImageWithNativeOcr}>
          <ScanIcon />
          选择截图并识别
        </button>
        <label className="upload-box">
          <input type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} />
          {preview ? <img src={preview} alt="支付截图预览" /> : <UploadIcon />}
          <span>{status}</span>
        </label>
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="粘贴截图中的账单文字，例如：支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32"
        />
        <div className="sample-row">
          <button type="button" onClick={() => setRawText("支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32")}>截图样例</button>
        </div>
        <button className="primary-button full" type="button" onClick={() => recognizeFromText(rawText, "截图识别")}>
          <ScanIcon />
          开始识别
        </button>
        {imageNotice && <p className="scan-feedback">{imageNotice}</p>}
      </div>

      {candidate?.source === "截图识别" && (
        <CandidateEditor
          candidate={candidate}
          setCandidate={setCandidate}
          onSave={saveCandidate}
          onCancel={() => setCandidate(null)}
        />
      )}

      <SectionTitle title="通知识别" aside="微信 / 支付宝" />
      <div className="import-panel compact">
        <textarea
          value={notificationText}
          onChange={(event) => setNotificationText(event.target.value)}
          placeholder="微信支付 付款成功 ￥28.80 收款方：茶百道 2026-07-01 15:06"
        />
        <div className="sample-row">
          <button type="button" onClick={() => setNotificationText("微信支付 付款成功 ￥36.50 收款方：美团外卖 2026-07-01 12:24")}>微信样例</button>
          <button type="button" onClick={() => setNotificationText("支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32")}>支付宝样例</button>
        </div>
        <button className="secondary-button full" type="button" onClick={() => recognizeFromText(notificationText, "通知识别")}>
          <BellIcon />
          识别通知
        </button>
        {notificationNotice && <p className="scan-feedback">{notificationNotice}</p>}
      </div>

      {candidate?.source === "通知识别" && (
        <CandidateEditor
          candidate={candidate}
          setCandidate={setCandidate}
          onSave={saveCandidate}
          onCancel={() => setCandidate(null)}
        />
      )}
    </Screen>
  );
}

function CandidateEditor({ candidate, setCandidate, onSave, onCancel }) {
  return (
    <section className="candidate-card">
      <div className="candidate-head">
        <div>
          <span>{candidate.source}</span>
          <strong>{money(candidate.amount)}</strong>
        </div>
        <b>{candidate.confidence}%</b>
      </div>
      <Field label="商户">
        <input value={candidate.merchant} onChange={(event) => setCandidate({ ...candidate, merchant: event.target.value })} />
      </Field>
      <Field label="分类">
        <CategoryGrid value={candidate.category} onChange={(category) => setCandidate({ ...candidate, category })} />
      </Field>
      <div className="two-columns">
        <Field label="日期">
          <input value={candidate.date} onChange={(event) => setCandidate({ ...candidate, date: event.target.value })} type="date" />
        </Field>
        <Field label="时间">
          <input value={candidate.time} onChange={(event) => setCandidate({ ...candidate, time: event.target.value })} type="time" />
        </Field>
      </div>
      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
        <button className="primary-button" type="button" onClick={onSave}>
          <CheckIcon />
          确认入账
        </button>
      </div>
    </section>
  );
}

function ReportScreen({ stats, expenses, budget, selectedMonth, currentMonth, onMonthChange, onEdit, onDelete }) {
  return (
    <Screen>
      <header className="screen-heading report-heading">
        <p>月度报告</p>
        <h2>{formatMonthLabel(selectedMonth)}</h2>
      </header>

      <MonthPicker value={selectedMonth} max={currentMonth} onChange={onMonthChange} />

      <section className="report-summary">
        <div>
          <span>本月支出</span>
          <strong>{money(stats.total)}</strong>
        </div>
        <div>
          <span>日均</span>
          <strong>{money(stats.dailyAverage)}</strong>
        </div>
        <div>
          <span>剩余预算</span>
          <strong>{money(Math.max(budget - stats.total, 0))}</strong>
        </div>
      </section>

      <section className="chart-panel">
        <SectionTitle title="每日趋势" aside={`${stats.days.length} 天`} />
        <TrendChart days={stats.days} />
      </section>

      <section className="chart-panel">
        <SectionTitle title="分类占比" aside={stats.topCategory?.name || "暂无"} />
        <div className="category-report">
          <div className="donut" style={{ background: buildConic(stats.categoryTotals) }}>
            <span>{Math.round(stats.usedRate)}%</span>
          </div>
          <div className="bar-list">
            {stats.categoryTotals.map((item) => (
              <div className="bar-row" key={item.id}>
                <span>{item.name}</span>
                <div><i style={{ width: `${item.percent}%`, background: item.color }} /></div>
                <b>{money(item.total)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionTitle title="消费洞察" aside={`${expenses.length} 笔`} />
      <div className="insight-list">
        <Insight text={stats.topCategory ? `${stats.topCategory.name} 是本月最高分类` : "本月还没有消费记录"} />
        <Insight text={stats.maxExpense ? `最大单笔是 ${stats.maxExpense.merchant}` : "开始记第一笔后生成洞察"} />
        <Insight text={stats.usedRate > 85 ? "预算使用偏快" : "预算节奏稳定"} />
      </div>

      <SectionTitle title="月度账单" aside={`${expenses.length} 笔`} />
      <ExpenseList items={expenses} onEdit={onEdit} onDelete={onDelete} />
    </Screen>
  );
}

function ProfileScreen({ settings, setSettings, state, setExpenses, setPending }) {
  const [coverDraft, setCoverDraft] = useState(null);
  const [coverCrop, setCoverCrop] = useState({ x: 50, y: 50, zoom: 1 });

  async function uploadCover(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setCoverDraft({ src: dataUrl, name: file.name });
    setCoverCrop({ x: 50, y: 50, zoom: 1 });
  }

  async function applyCoverCrop() {
    if (!coverDraft) return;
    const croppedCover = await cropCoverImage(coverDraft.src, coverCrop);
    setSettings({ ...settings, coverImage: croppedCover });
    setCoverDraft(null);
  }

  async function importData(file) {
    if (!file) return;
    const text = await readFileAsText(file);
    const imported = JSON.parse(text);
    if (Array.isArray(imported.expenses)) setExpenses(imported.expenses);
    if (Array.isArray(imported.pending)) setPending(imported.pending);
    if (imported.settings) setSettings({ ...settings, ...imported.settings });
  }

  return (
    <>
      <Screen>
        <header className="screen-heading">
          <p>自定义封面</p>
          <h2>我的账本</h2>
        </header>

        <section className="settings-panel cover-picker">
          <div className="mini-cover" style={getCoverStyle(settings)} />
          <label className="secondary-button">
            <UploadIcon />
            上传并裁剪
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                uploadCover(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </section>

        <SectionTitle title="封面" aside="预设" />
        <div className="preset-grid">
          {coverPresets.map((preset) => (
            <button
              className={settings.coverPresetId === preset.id && !settings.coverImage ? "selected" : ""}
              key={preset.id}
              type="button"
              style={{ background: preset.css }}
              onClick={() => setSettings({ ...settings, coverPresetId: preset.id, coverImage: "" })}
              aria-label={preset.name}
            />
          ))}
        </div>

        <SectionTitle title="主题色" aside="偏好" />
        <div className="theme-row">
          {themes.map((theme) => (
            <button
              className={settings.themeId === theme.id ? "selected" : ""}
              key={theme.id}
              type="button"
              onClick={() => setSettings({ ...settings, themeId: theme.id })}
              aria-label={theme.name}
            >
              <i style={{ background: theme.primary }} />
              <i style={{ background: theme.accent }} />
            </button>
          ))}
        </div>

        <section className="settings-panel">
          <Field label="月预算">
            <input
              type="number"
              value={settings.budget}
              onChange={(event) => setSettings({ ...settings, budget: Number(event.target.value) })}
            />
          </Field>
          <label className="toggle-row">
            <span>深色模式</span>
            <input
              type="checkbox"
              checked={settings.darkMode}
              onChange={(event) => setSettings({ ...settings, darkMode: event.target.checked })}
            />
          </label>
        </section>

        <section className="settings-panel">
          <div className="permission-card">
            <BellIcon />
            <div>
              <strong>通知识别</strong>
              <span>等待安卓授权</span>
            </div>
          </div>
          <div className="data-actions">
            <button className="secondary-button" type="button" onClick={() => downloadJson("xiaozhangben-backup.json", state)}>导出</button>
            <label className="secondary-button">
              导入
              <input type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} />
            </label>
          </div>
        </section>
      </Screen>

      {coverDraft && (
        <CoverCropModal
          crop={coverCrop}
          draft={coverDraft}
          onApply={applyCoverCrop}
          onCancel={() => setCoverDraft(null)}
          onCropChange={setCoverCrop}
        />
      )}
    </>
  );
}

function CoverCropModal({ crop, draft, onApply, onCancel, onCropChange }) {
  const updateCrop = (key, value) => {
    onCropChange({ ...crop, [key]: Number(value) });
  };

  return (
    <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label="封面裁剪">
      <section className="crop-modal">
        <div className="crop-header">
          <div>
            <span>首页样本比例</span>
            <h3>封面裁剪</h3>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel} aria-label="关闭裁剪">
            ×
          </button>
        </div>

        <div className="crop-stage" aria-label={draft.name}>
          <img
            alt=""
            src={draft.src}
            style={{
              objectPosition: `${crop.x}% ${crop.y}%`,
              transform: `scale(${crop.zoom})`
            }}
          />
          <div className="crop-sample-band">
            <span>本月支出</span>
            <strong>¥999</strong>
          </div>
        </div>

        <div className="crop-controls">
          <CropSlider label="横向" max="100" min="0" step="1" value={crop.x} onChange={(value) => updateCrop("x", value)} />
          <CropSlider label="纵向" max="100" min="0" step="1" value={crop.y} onChange={(value) => updateCrop("y", value)} />
          <CropSlider label="缩放" max="2.2" min="1" step="0.01" value={crop.zoom} onChange={(value) => updateCrop("zoom", value)} />
        </div>

        <div className="crop-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
          <button className="primary-button" type="button" onClick={onApply}>使用封面</button>
        </div>
      </section>
    </div>
  );
}

function CropSlider({ label, value, onChange, ...props }) {
  return (
    <label className="crop-control">
      <span>{label}</span>
      <input type="range" value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function PendingCard({ item, onConfirm, onDelete }) {
  const [local, setLocal] = useState(item);

  useEffect(() => setLocal(item), [item]);

  return (
    <article className="pending-card">
      <div className="expense-main">
        <div>
          <strong>{local.merchant}</strong>
          <span>{local.source} · {local.date} {local.time}</span>
        </div>
        <b>{money(local.amount)}</b>
      </div>
      <CategoryGrid compact value={local.category} onChange={(category) => setLocal({ ...local, category })} />
      <div className="pending-actions">
        <button type="button" className="ghost-button" onClick={() => onDelete(item.id)}>
          <TrashIcon />
        </button>
        <button type="button" className="primary-button small" onClick={() => onConfirm(local)}>
          <CheckIcon />
          确认入账
        </button>
      </div>
    </article>
  );
}

function ExpenseList({ items, onEdit, onDelete }) {
  if (!items.length) return <EmptyLine text="还没有记录" />;

  return (
    <div className="expense-list">
      {items.map((item) => {
        const category = categories.find((entry) => entry.id === item.category) || categories.at(-1);
        return (
          <article className="expense-row" key={item.id}>
            <i style={{ background: category.color }} />
            <div>
              <strong>{item.merchant}</strong>
              <span>{category.name} · {item.method} · {item.date}</span>
            </div>
            <b>{money(item.amount)}</b>
            <button type="button" className="row-icon" aria-label="编辑" onClick={() => onEdit(item)}>
              <EditIcon />
            </button>
            <button type="button" className="row-icon" aria-label="删除" onClick={() => onDelete(item)}>
              <TrashIcon />
            </button>
          </article>
        );
      })}
    </div>
  );
}

function BottomNav({ activeTab, onTab }) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            className={activeTab === item.id ? "active" : ""}
            onClick={() => onTab(item.id)}
          >
            <Icon />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ConfirmDeleteModal({ item, onCancel, onConfirm }) {
  return (
    <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-label="确认删除">
      <section className="confirm-modal">
        <div>
          <span>删除记录</span>
          <h3>确定删除这一笔吗？</h3>
          <p>{item.merchant} · {money(item.amount)}</p>
        </div>
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
          <button className="danger-button" type="button" onClick={onConfirm}>删除</button>
        </div>
      </section>
    </div>
  );
}

function Screen({ children, className = "" }) {
  return <div className={`screen ${className}`.trim()}>{children}</div>;
}

function SectionTitle({ title, aside }) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      <span>{aside}</span>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }) {
  return (
    <button type="button" className="action-button" onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

function MonthPicker({ value, max, onChange }) {
  return (
    <div className="month-picker">
      <button type="button" onClick={() => onChange(shiftMonth(value, -1))} aria-label="上个月">
        ‹
      </button>
      <label>
        <span>账单月份</span>
        <input type="month" value={value} max={max} onChange={(event) => onChange(event.target.value || max)} />
      </label>
      <button type="button" onClick={() => onChange(shiftMonth(value, 1))} disabled={value >= max} aria-label="下个月">
        ›
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SegmentedControl({ value, options, onChange }) {
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

function CategoryGrid({ value, onChange, compact = false }) {
  return (
    <div className={compact ? "category-grid compact" : "category-grid"}>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={value === category.id ? "selected" : ""}
          onClick={() => onChange(category.id)}
        >
          <i style={{ background: category.color }} />
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  );
}

function TrendChart({ days }) {
  const max = Math.max(...days.map((day) => day.total), 1);
  const points = days
    .map((day, index) => {
      const x = 14 + (index / Math.max(days.length - 1, 1)) * 252;
      const y = 110 - (day.total / max) * 86;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="trend-chart" viewBox="0 0 280 128" role="img" aria-label="每日消费趋势">
      <path d="M14 112H266" />
      <path d="M14 28H266" className="grid-line" />
      <polyline points={points} />
      {days.map((day, index) => {
        const x = 14 + (index / Math.max(days.length - 1, 1)) * 252;
        const y = 110 - (day.total / max) * 86;
        return <circle key={day.date} cx={x} cy={y} r="3.8" />;
      })}
    </svg>
  );
}

function Insight({ text }) {
  return (
    <div className="insight">
      <span />
      <p>{text}</p>
    </div>
  );
}

function EmptyLine({ text }) {
  return <p className="empty-line">{text}</p>;
}

function getMonthStats(expenses, budget, month = today().slice(0, 7)) {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const currentMonth = today().slice(0, 7);
  const todayTotal = month === currentMonth
    ? expenses.filter((item) => item.date === today()).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    : 0;
  const categoryTotals = categories
    .map((category) => {
      const categoryTotal = expenses
        .filter((item) => item.category === category.id)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return {
        ...category,
        total: categoryTotal,
        percent: total ? Math.round((categoryTotal / total) * 100) : 0
      };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);

  const [year, monthNumber] = month.split("-").map(Number);
  const now = new Date();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const visibleDays = month === currentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  const days = Array.from({ length: visibleDays }, (_, index) => {
    const date = `${year}-${pad(monthNumber)}-${pad(index + 1)}`;
    return {
      date,
      total: expenses.filter((item) => item.date === date).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    };
  });

  return {
    total,
    budget,
    todayTotal,
    usedRate: budget ? (total / budget) * 100 : 0,
    dailyAverage: days.length ? total / days.length : 0,
    categoryTotals,
    topCategory: categoryTotals[0],
    maxExpense: expenses.slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0],
    days
  };
}

function buildConic(items) {
  if (!items.length) return "conic-gradient(var(--line), var(--line))";
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += item.percent;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")}, var(--line) ${cursor}% 100%)`;
}

async function cropCoverImage(src, crop) {
  const image = await loadImage(src);
  const outputWidth = 720;
  const outputHeight = 1472;
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  const scale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight) * crop.zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const overflowX = Math.max(0, drawWidth - outputWidth);
  const overflowY = Math.max(0, drawHeight - outputHeight);
  const dx = -overflowX * (crop.x / 100);
  const dy = -overflowY * (crop.y / 100);

  context.fillStyle = "#eef3ec";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(image, dx, dy, drawWidth, drawHeight);

  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getCoverStyle(settings) {
  if (settings.coverImage) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(20,36,30,.08), rgba(20,36,30,.48)), url(${settings.coverImage})`
    };
  }
  const preset = coverPresets.find((item) => item.id === settings.coverPresetId) || coverPresets[0];
  return { background: preset.css };
}

function formatReadableDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatMonthLabel(value) {
  const [year, month] = String(value || today().slice(0, 7)).split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function shiftMonth(value, offset) {
  const [year, month] = String(value || today().slice(0, 7)).split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export default App;
