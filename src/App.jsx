import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { categories, coverPresets, incomeCategories, methods, themes } from "./data.js";
import { loadState, readFileAsDataUrl, saveState } from "./storage.js";
import { parseExpenseText } from "./parser.js";
import { createId } from "./ids.js";
import {
  ChartIcon,
  CategoryIcon,
  CheckIcon,
  EditIcon,
  GripIcon,
  PlusIcon,
  ScanIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  WalletIcon
} from "./icons.jsx";

const ExpenseCategoriesContext = React.createContext(categories);

const navItems = [
  { id: "home", label: "首页", icon: WalletIcon },
  { id: "add", label: "记一笔", icon: PlusIcon },
  { id: "scan", label: "识别", icon: ScanIcon },
  { id: "report", label: "月报", icon: ChartIcon },
  { id: "profile", label: "我的", icon: UserIcon }
];

const XzbOcr = registerPlugin("XzbOcr");
const XzbNotify = registerPlugin("XzbNotify");
const recordTypeLabels = { expense: "支出", income: "收入" };
const defaultOcrCrop = { x: 4, y: 4, width: 92, height: 92 };
const categoryIconOptions = [
  { id: "tag", name: "标签" },
  { id: "home", name: "居家" },
  { id: "water", name: "用水" },
  { id: "travel", name: "出行" },
  { id: "gift", name: "礼物" },
  { id: "fun", name: "娱乐" },
  { id: "health", name: "健康" },
  { id: "study", name: "学习" }
];
const categoryColors = ["#6f927d", "#4d9fc5", "#ee775d", "#d6a94f", "#d86d84", "#4f77b8", "#9a7ac2", "#7b837d"];

const emptyDraft = () => ({
  type: "expense",
  amount: "",
  merchant: "",
  category: "food",
  method: "微信",
  date: today(),
  time: currentTime(),
  note: ""
});

function normalizeNotificationItems(items, expenseCategories = categories) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const rawText = String(item?.rawText || "").trim();
      if (!rawText) return null;
      const parsed = parseExpenseText(rawText, expenseCategories);
      const method = item?.packageName === "com.eg.android.AlipayGphone"
        ? "支付宝"
        : item?.packageName === "com.tencent.mm"
          ? "微信"
          : parsed.method;

      return {
        ...parsed,
        id: item?.id ? `notice-${item.id}` : createId(`notice-${index}`),
        method,
        source: "通知识别",
        rawText,
        note: "来自系统通知"
      };
    })
    .filter(Boolean);
}

function normalizePendingEntry(entry, index = 0) {
  if (!entry) return null;
  const type = entry.type === "income" ? "income" : "expense";
  return {
    ...entry,
    id: entry.id || createId(`pending-${index}`),
    type,
    amount: Number(entry.amount || 0),
    merchant: entry.merchant || "未识别商户",
    category: entry.category || (type === "income" ? "income-other" : "other"),
    method: entry.method || "其他",
    date: entry.date || today(),
    time: entry.time || currentTime(),
    note: entry.note || ""
  };
}

function mergePendingEntries(current, incoming) {
  const seenIds = new Set(current.map((item) => item.id));
  const seenFingerprints = new Set(current.map(pendingFingerprint));
  const nextIncoming = [];

  for (const entry of incoming) {
    const normalizedEntry = seenIds.has(entry.id) ? { ...entry, id: createId("pending") } : entry;
    seenIds.add(normalizedEntry.id);
    const fingerprint = pendingFingerprint(entry);
    const duplicateHint = seenFingerprints.has(fingerprint);
    seenFingerprints.add(fingerprint);
    nextIncoming.push({
      ...normalizedEntry,
      duplicateHint,
      note: duplicateHint && !normalizedEntry.note ? "可能重复，请核对" : normalizedEntry.note
    });
  }

  return [...nextIncoming, ...current];
}

function pendingFingerprint(entry) {
  const amount = Number(entry?.amount || 0).toFixed(2);
  return [
    entry?.type || "expense",
    amount,
    String(entry?.merchant || "").trim(),
    entry?.date || "",
    entry?.time || "",
    entry?.method || "",
    entry?.source || ""
  ].join("|");
}

function App() {
  const initial = useMemo(loadState, []);
  const [expenses, setExpenses] = useState(initial.expenses);
  const [pending, setPending] = useState(initial.pending);
  const [settings, setSettings] = useState(initial.settings);
  const [activeTab, setActiveTab] = useState("home");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePendingTarget, setDeletePendingTarget] = useState(null);
  const canUseNativeNotify = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  const theme = themes.find((item) => item.id === settings.themeId) || themes[0];
  const expenseCategories = useMemo(
    () => mergeExpenseCategories(
      settings.customExpenseCategories,
      settings.categoryOrder,
      settings.categoryKeywordOverrides
    ),
    [settings.customExpenseCategories, settings.categoryOrder, settings.categoryKeywordOverrides]
  );
  const appState = useMemo(() => ({ expenses, pending, settings }), [expenses, pending, settings]);
  const currentMonth = today().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const monthlyExpenses = useMemo(
    () => sortRecordsByDateTime(expenses.filter((expense) => expense.date?.startsWith(selectedMonth))),
    [expenses, selectedMonth]
  );
  const stats = useMemo(
    () => getMonthStats(monthlyExpenses, settings.budget, selectedMonth, expenseCategories),
    [monthlyExpenses, settings.budget, selectedMonth, expenseCategories]
  );

  useEffect(() => {
    saveState(appState);
  }, [appState]);

  useEffect(() => {
    document.documentElement.style.setProperty("--primary", theme.primary);
    document.documentElement.style.setProperty("--accent", theme.accent);
    document.body.dataset.theme = settings.darkMode ? "dark" : "light";
  }, [theme, settings.darkMode]);

  useEffect(() => {
    if (!canUseNativeNotify) return undefined;

    let stopped = false;
    const syncNotifications = async () => {
      try {
        const enabled = await XzbNotify.isEnabled();
        if (stopped || !enabled?.enabled) return;
        const result = await XzbNotify.drainNotifications();
        const entries = normalizeNotificationItems(result?.items || [], expenseCategories);
        if (entries.length) addPendingBatch(entries, { navigate: false });
      } catch {
        // Notification access is optional; failed sync should never block bookkeeping.
      }
    };

    syncNotifications();
    const timer = window.setInterval(syncNotifications, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canUseNativeNotify, expenseCategories]);

  function saveExpense(entry) {
    const type = entry.type === "income" ? "income" : "expense";
    const normalized = {
      ...entry,
      type,
      category: entry.category || (type === "income" ? "income-other" : "other"),
      amount: Number(entry.amount),
      id: editingId || createId("expense"),
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
    const type = entry.type === "income" ? "income" : "expense";
    const expense = {
      ...entry,
      type,
      category: entry.category || (type === "income" ? "income-other" : "other"),
      id: createId("expense"),
      amount: Number(entry.amount),
      note: entry.note || "",
      source: entry.source || "识别"
    };
    setExpenses((items) => [expense, ...items]);
    setPending((items) => items.filter((item) => item.id !== entry.id));
  }

  function editExpense(expense) {
    const type = expense.type === "income" ? "income" : "expense";
    setDraft({
      type,
      amount: String(expense.amount),
      merchant: expense.merchant,
      category: expense.category || (type === "income" ? "income-other" : "other"),
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

  function confirmDeletePending() {
    if (!deletePendingTarget) return;
    setPending((items) => items.filter((item) => item.id !== deletePendingTarget.id));
    setDeletePendingTarget(null);
  }

  function addPending(entry, options = {}) {
    addPendingBatch([entry], options);
  }

  function addPendingBatch(entries, options = {}) {
    const normalized = entries.map((entry, index) => normalizePendingEntry(entry, index)).filter(Boolean);
    if (!normalized.length) return;
    setPending((items) => mergePendingEntries(items, normalized));
    if (options.navigate !== false) setActiveTab("home");
  }

  return (
    <ExpenseCategoriesContext.Provider value={expenseCategories}>
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
            onDeletePending={setDeletePendingTarget}
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
        {activeTab === "scan" && <ScanScreen onPending={addPending} onPendingBatch={addPendingBatch} />}
        {activeTab === "report" && (
          <ReportScreen
            stats={stats}
            expenses={monthlyExpenses}
            allExpenses={expenses}
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
        {deletePendingTarget && (
          <ConfirmDeleteModal
            item={deletePendingTarget}
            onCancel={() => setDeletePendingTarget(null)}
            onConfirm={confirmDeletePending}
          />
        )}
        <BottomNav activeTab={activeTab} onTab={setActiveTab} />
      </main>
    </div>
    </ExpenseCategoriesContext.Provider>
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
            <div className="cover-summary-row">
              <div className="cover-stat-main">
                <span>{isCurrentMonth ? "本月支出" : "所选月支出"}</span>
                <strong>{money(stats.total)}</strong>
              </div>
              <div className="today-chip">
                <span>{isCurrentMonth ? "今日" : "日均"}</span>
                <b>{money(isCurrentMonth ? stats.todayTotal : stats.dailyAverage)}</b>
              </div>
            </div>
            <div className="budget-block">
              <div className="budget-row">
                <span>预算 {money(stats.budget)}</span>
                <span>{Math.round(stats.usedRate)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.min(stats.usedRate, 100)}%` }} />
              </div>
              <div className="balance-row">
                <span>收入 {money(stats.incomeTotal)}</span>
                <span className={stats.balance < 0 ? "negative" : "positive"}>
                  结余 {money(stats.balance)}
                </span>
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
        <p>{editingId ? "编辑记录" : "每日收支"}</p>
        <h2>{editingId ? "调整这一笔" : "记一笔"}</h2>
      </header>

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
              category: type === "income" ? "salary" : "food"
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

function ScanScreen({ onPending, onPendingBatch }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const [rawText, setRawText] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [batchCandidates, setBatchCandidates] = useState([]);
  const [preview, setPreview] = useState("");
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState("");
  const [imageBatch, setImageBatch] = useState([]);
  const [ocrCrop, setOcrCrop] = useState(defaultOcrCrop);
  const [status, setStatus] = useState("等待截图");
  const [imageNotice, setImageNotice] = useState("");
  const [isBatchRecognizing, setIsBatchRecognizing] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState("");
  const canUseNativeOcr = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const canUseNativeNotify = canUseNativeOcr;

  useEffect(() => {
    refreshNotificationPermission();
  }, []);

  async function pickImageWithNativeOcr() {
    setCandidate(null);
    setBatchCandidates([]);
    setRawText("");
    setPreview("");
    setSelectedImageDataUrl("");
    setImageBatch([]);
    setOcrCrop(defaultOcrCrop);
    setImageNotice("");

    if (!canUseNativeOcr) {
      setStatus("需要安卓安装包");
      setImageNotice("请在手机安装包里使用系统选图；网页预览可用下方虚线框选择图片。");
      return;
    }

    setStatus("正在打开相册");
    try {
      const result = await XzbOcr.pickImagesAndRecognize();
      const results = Array.isArray(result?.results) ? result.results : [];
      if (!results.length) {
        setStatus("读取失败");
        setImageNotice("没有读到图片内容，请重新选择。");
        return;
      }
      const nextImages = results.map((item, index) => ({
        id: createId(`image-${index}`),
        dataUrl: "",
        uri: item?.uri || "",
        name: `截图 ${index + 1}`,
        status: item?.text ? "已识别" : "无文字",
        text: String(item?.text || "")
      }));
      const candidates = results
        .map((item, index) => {
          const text = String(item?.text || "").trim();
          if (!text) return null;
          return {
            ...parseExpenseText(text, expenseCategories),
            id: createId(`batch-${index}`),
            source: "截图识别",
            note: `截图 ${index + 1}`,
            rawText: text
          };
        })
        .filter(Boolean);

      setImageBatch(nextImages);
      setBatchCandidates(candidates);
      setPreview("");
      setSelectedImageDataUrl("");
      setRawText(candidates[0]?.rawText || "");
      setStatus(candidates.length ? `已生成 ${candidates.length} 条候选` : "未识别到账单");
      setImageNotice(
        candidates.length
          ? "批量识别完成，请检查金额和商户后加入待确认。"
          : "没有生成候选账单，请换更清晰的截图，或用下方单图裁剪识别。"
      );
    } catch (error) {
      setStatus("等待截图");
      setImageNotice(error?.message || "没有选择图片。");
    }
  }

  function applySelectedImages(images) {
    const normalized = images
      .map((image, index) => ({
        id: createId(`image-${index}`),
        dataUrl: String(image?.dataUrl || ""),
        uri: image?.uri || "",
        name: `截图 ${index + 1}`,
        status: "等待识别",
        text: ""
      }))
      .filter((image) => image.dataUrl);

    if (!normalized.length) {
      setStatus("读取失败");
      setImageNotice("没有读到图片内容，请重新选择。");
      return;
    }

    setImageBatch(normalized);
    setPreview(normalized[0].dataUrl);
    setRawText("");
    setCandidate(null);
    setBatchCandidates([]);

    if (normalized.length === 1) {
      setSelectedImageDataUrl(normalized[0].dataUrl);
      setStatus("请裁剪后识别");
      setImageNotice("调整裁剪区域后，点击识别裁剪区域；也可以直接批量识别这一张。");
      return;
    }

    setSelectedImageDataUrl("");
    setStatus(`已选择 ${normalized.length} 张`);
    setImageNotice("可直接批量识别全部截图；单张裁剪请只选择一张图片。");
  }

  async function recognizeImageDataUrl(dataUrl) {
    if (!canUseNativeOcr) {
      setStatus("需要安卓安装包");
      setImageNotice("请在手机安装包里使用截图 OCR；网页预览只能手动粘贴文字识别。");
      return;
    }

    setStatus("正在识别截图");
    setImageNotice("");
    try {
      const text = await readImageText(dataUrl);
      setRawText(text);

      if (!text) {
        setStatus("未识别到文字");
        setImageNotice("这张图没有读到文字，请换一张更清晰的支付成功截图或账单截图。");
        return;
      }

      setStatus("已读取文字");
      recognizeFromText(text, "截图识别");
    } catch (error) {
      setStatus("识别失败");
      setImageNotice(error?.message || "OCR 识别失败，请换一张更清晰的截图。");
    }
  }

  async function readImageText(dataUrl) {
    const result = await XzbOcr.recognizeImage({ dataUrl });
    return String(result?.text || "").trim();
  }

  async function handleImages(fileList) {
    const files = Array.from(fileList || []).slice(0, 12);
    if (!files.length) return;
    if (canUseNativeOcr && files.length > 1) {
      setStatus("请用原生批量入口");
      setImageNotice("手机端多图请点上方“批量选择截图”，避免大图在 WebView 中占用过多内存。");
      return;
    }

    const images = await Promise.all(
      files.map(async (file) => ({
        dataUrl: await readFileAsDataUrl(file),
        uri: "",
        name: file.name
      }))
    );

    setOcrCrop(defaultOcrCrop);
    applySelectedImages(images);

    if (canUseNativeOcr) {
      return;
    }

    if (files.length === 1 && "TextDetector" in window) {
      try {
        const detector = new window.TextDetector();
        const bitmap = await createImageBitmap(files[0]);
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
      setImageNotice("网页备用导入只能预览截图；手机安装包可批量识别多张截图。");
    }
  }

  async function recognizeScreenshot() {
    if (selectedImageDataUrl) {
      const croppedImage = await cropOcrImage(selectedImageDataUrl, ocrCrop);
      await recognizeImageDataUrl(croppedImage);
      return;
    }

    if (rawText.trim()) {
      recognizeFromText(rawText, "截图识别");
      return;
    }

    recognizeFromText(rawText, "截图识别");
  }

  async function recognizeBatchScreenshots() {
    if (!imageBatch.length) {
      setImageNotice("请先选择一张或多张截图。");
      return;
    }
    if (!canUseNativeOcr) {
      setImageNotice("批量 OCR 需要在安卓安装包里使用。");
      return;
    }

    setIsBatchRecognizing(true);
    setBatchCandidates([]);
    setCandidate(null);
    setImageNotice("");

    const results = [];
    for (let index = 0; index < imageBatch.length; index += 1) {
      const image = imageBatch[index];
      setStatus(`正在识别 ${index + 1}/${imageBatch.length}`);
      setImageBatch((items) =>
        items.map((item) => (item.id === image.id ? { ...item, status: "识别中" } : item))
      );

      try {
        const text = await readImageText(image.dataUrl);
        const parsed = text ? parseExpenseText(text, expenseCategories) : null;
        setImageBatch((items) =>
          items.map((item) => (item.id === image.id ? { ...item, status: text ? "已识别" : "无文字", text } : item))
        );
        if (parsed) {
          results.push({
            ...parsed,
            id: createId(`batch-${index}`),
            source: "截图识别",
            note: image.name || "",
            rawText: text
          });
        }
      } catch {
        setImageBatch((items) =>
          items.map((item) => (item.id === image.id ? { ...item, status: "识别失败" } : item))
        );
      }
    }

    setBatchCandidates(results);
    setIsBatchRecognizing(false);
    setStatus(results.length ? `已生成 ${results.length} 条候选` : "未识别到账单");
    setImageNotice(
      results.length
        ? "批量识别完成，请检查金额和商户后加入待确认。"
        : "没有生成候选账单，请换更清晰的截图或改用裁剪识别。"
    );
  }

  function saveBatchCandidates() {
    const validCandidates = batchCandidates.filter((item) => Number(item.amount) > 0);
    if (!validCandidates.length) {
      setImageNotice("没有可加入待确认的账单，请先检查识别结果。");
      return;
    }
    onPendingBatch(validCandidates);
    setBatchCandidates([]);
    setImageBatch([]);
    setSelectedImageDataUrl("");
    setPreview("");
    setRawText("");
    setStatus("等待截图");
    setImageNotice("");
  }

  async function refreshNotificationPermission() {
    if (!canUseNativeNotify) return;
    try {
      const result = await XzbNotify.isEnabled();
      setNotificationEnabled(Boolean(result?.enabled));
    } catch {
      setNotificationEnabled(false);
    }
  }

  async function openNotificationSettings() {
    if (!canUseNativeNotify) {
      setNotificationNotice("通知自动记账需要在安卓安装包里开启通知访问权限。");
      return;
    }
    await XzbNotify.openSettings();
    setNotificationNotice("已打开系统设置。开启小账本通知访问权限后，回到 App 点“同步新通知”。");
  }

  async function syncNotificationBills() {
    if (!canUseNativeNotify) {
      setNotificationNotice("通知自动记账需要在安卓安装包里使用。");
      return;
    }

    try {
      const enabled = await XzbNotify.isEnabled();
      setNotificationEnabled(Boolean(enabled?.enabled));
      if (!enabled?.enabled) {
        setNotificationNotice("请先开启通知访问权限。");
        return;
      }

      const result = await XzbNotify.drainNotifications();
      const entries = normalizeNotificationItems(result?.items || []);
      if (!entries.length) {
        setNotificationNotice("暂时没有新的微信/支付宝付款通知。开启权限后，只能捕获之后出现的新通知。");
        return;
      }

      onPendingBatch(entries, { navigate: false });
      setNotificationNotice(`已同步 ${entries.length} 条通知到账单待确认。`);
    } catch (error) {
      setNotificationNotice(error?.message || "同步通知失败，请确认权限已开启。");
    }
  }

  function recognizeFromText(text, source) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
      setStatus("缺少识别文本");
      setImageNotice("没有可识别的文字，请先粘贴账单文字。");
      setCandidate(null);
      return;
    }

    const parsed = parseExpenseText(normalizedText, expenseCategories);
    const nextCandidate = { ...parsed, source };
    setCandidate(nextCandidate);
    setImageNotice(
      !nextCandidate.amount || nextCandidate.merchant === "未识别商户"
        ? "识别结果不完整，请检查金额和商户后再确认。"
        : "已生成候选账单，请确认后入账。"
    );
    setStatus("已生成候选账单");
  }

  function saveCandidate() {
    if (!candidate) return;
    onPending(candidate);
    setCandidate(null);
    setBatchCandidates([]);
    setRawText("");
    setSelectedImageDataUrl("");
    setImageBatch([]);
    setPreview("");
    setStatus("等待截图");
    setImageNotice("");
  }

  return (
    <Screen>
      <header className="screen-heading">
        <p>导入截图</p>
        <h2>识别后确认</h2>
      </header>

      <section className="notification-sync-card">
        <div>
          <span>通知自动记账</span>
          <strong>{notificationEnabled ? "已开启" : "待开启"}</strong>
          <p>开启安卓通知访问权限后，微信/支付宝的新付款通知会自动进入待确认。</p>
        </div>
        <div className="notification-actions">
          <button className="secondary-button" type="button" onClick={openNotificationSettings}>
            开启权限
          </button>
          <button className="primary-button" type="button" onClick={syncNotificationBills}>
            同步新通知
          </button>
        </div>
        {notificationNotice && <p className="scan-feedback">{notificationNotice}</p>}
      </section>

      <div className="import-panel">
        <button className="primary-button full" type="button" onClick={pickImageWithNativeOcr}>
          <ScanIcon />
          批量选择截图
        </button>
        <label className="upload-box">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              handleImages(event.target.files);
              event.target.value = "";
            }}
          />
          {preview ? <img src={preview} alt="支付截图预览" /> : <UploadIcon />}
          <span>{status}</span>
        </label>
        {selectedImageDataUrl && (
          <ScreenshotCropPanel crop={ocrCrop} image={selectedImageDataUrl} onCropChange={setOcrCrop} />
        )}
        {imageBatch.length > 0 && (
          <BatchImageQueue images={imageBatch} />
        )}
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="粘贴截图中的账单文字，例如：支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32"
        />
        <div className="sample-row">
          <button type="button" onClick={() => setRawText("支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32")}>截图样例</button>
        </div>
        <button className="primary-button full" type="button" onClick={recognizeScreenshot}>
          <ScanIcon />
          {selectedImageDataUrl ? "识别裁剪区域" : "开始识别"}
        </button>
        {imageBatch.length > 0 && imageBatch.some((image) => image.dataUrl) && (
          <button className="secondary-button full" type="button" onClick={recognizeBatchScreenshots} disabled={isBatchRecognizing}>
            {isBatchRecognizing ? "批量识别中..." : `批量识别 ${imageBatch.length} 张`}
          </button>
        )}
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

      {batchCandidates.length > 0 && (
        <BatchCandidateEditor
          candidates={batchCandidates}
          setCandidates={setBatchCandidates}
          onSave={saveBatchCandidates}
          onCancel={() => setBatchCandidates([])}
        />
      )}

    </Screen>
  );
}

function BatchImageQueue({ images }) {
  return (
    <div className="batch-image-list">
      {images.map((image, index) => (
        <div className="batch-image-item" key={image.id}>
          <span>{image.name || `截图 ${index + 1}`}</span>
          <b>{image.status}</b>
        </div>
      ))}
    </div>
  );
}

function BatchCandidateEditor({ candidates, setCandidates, onSave, onCancel }) {
  function updateCandidate(id, patch) {
    setCandidates((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  return (
    <section className="candidate-card batch-candidate-card">
      <div className="candidate-head">
        <div>
          <span>批量识别结果</span>
          <strong>{candidates.length} 条</strong>
        </div>
      </div>

      <div className="batch-candidate-list">
        {candidates.map((item, index) => {
          const categorySource = item.type === "income" ? incomeCategories : categories;
          return (
            <article className="batch-candidate-item" key={item.id}>
              <div className="batch-candidate-title">
                <span>账单 {index + 1}</span>
                <b>{item.confidence}%</b>
              </div>
              <div className="batch-fields">
                <label>
                  <span>类型</span>
                  <select
                    value={item.type || "expense"}
                    onChange={(event) => {
                      const type = event.target.value;
                      updateCandidate(item.id, {
                        type,
                        category: type === "income" ? "salary" : "food"
                      });
                    }}
                  >
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                  </select>
                </label>
                <label>
                  <span>金额</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount}
                    onChange={(event) => updateCandidate(item.id, { amount: event.target.value })}
                  />
                </label>
                <label>
                  <span>商户</span>
                  <input value={item.merchant} onChange={(event) => updateCandidate(item.id, { merchant: event.target.value })} />
                </label>
                <label>
                  <span>分类</span>
                  <select value={item.category} onChange={(event) => updateCandidate(item.id, { category: event.target.value })}>
                    {categorySource.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>日期</span>
                  <input type="date" value={item.date} onChange={(event) => updateCandidate(item.id, { date: event.target.value })} />
                </label>
                <label>
                  <span>时间</span>
                  <input type="time" value={item.time} onChange={(event) => updateCandidate(item.id, { time: event.target.value })} />
                </label>
              </div>
            </article>
          );
        })}
      </div>

      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
        <button className="primary-button" type="button" onClick={onSave}>
          <CheckIcon />
          加入待确认
        </button>
      </div>
    </section>
  );
}

function CandidateEditor({ candidate, setCandidate, onSave, onCancel }) {
  return (
    <section className="candidate-card">
      <div className="candidate-head">
        <div>
          <span>{candidate.source}</span>
          <strong>{signedMoney(candidate.amount, candidate.type)}</strong>
        </div>
        <b>{candidate.confidence}%</b>
      </div>
      <Field label="类型">
        <TypeToggle
          value={candidate.type || "expense"}
          onChange={(type) => setCandidate({
            ...candidate,
            type,
            category: type === "income" ? "salary" : "food"
          })}
        />
      </Field>
      <Field label="金额">
        <input
          type="number"
          min="0"
          step="0.01"
          value={candidate.amount}
          onChange={(event) => setCandidate({ ...candidate, amount: event.target.value })}
        />
      </Field>
      <Field label="商户">
        <input value={candidate.merchant} onChange={(event) => setCandidate({ ...candidate, merchant: event.target.value })} />
      </Field>
      <Field label="分类">
        <CategoryGrid type={candidate.type} value={candidate.category} onChange={(category) => setCandidate({ ...candidate, category })} />
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

function ScreenshotCropPanel({ crop, image, onCropChange }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const cropRef = useRef(normalizeOcrCrop(crop));
  const [imageRatio, setImageRatio] = useState(9 / 16);
  const safeCrop = normalizeOcrCrop(crop);

  useEffect(() => {
    cropRef.current = safeCrop;
  }, [safeCrop.x, safeCrop.y, safeCrop.width, safeCrop.height]);

  function startDrag(event, mode) {
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    stage.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop: cropRef.current
    };
  }

  function moveCrop(event) {
    const stage = stageRef.current;
    const drag = dragRef.current;
    if (!stage || !drag || event.pointerId !== drag.pointerId) return;

    const bounds = stage.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * 100;
    const next = resizeOcrCrop(drag.crop, drag.mode, deltaX, deltaY);
    cropRef.current = next;
    onCropChange(next);
  }

  function endDrag(event) {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
  }

  return (
    <section className="ocr-crop-panel">
      <div
        ref={stageRef}
        className="ocr-crop-stage"
        style={{ aspectRatio: imageRatio, maxWidth: imageRatio < 0.72 ? "230px" : "340px" }}
        onPointerMove={moveCrop}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          alt=""
          src={image}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setImageRatio(naturalWidth / naturalHeight);
          }}
        />
        <div
          className="ocr-crop-selection"
          style={{
            left: `${safeCrop.x}%`,
            top: `${safeCrop.y}%`,
            width: `${safeCrop.width}%`,
            height: `${safeCrop.height}%`
          }}
          onPointerDown={(event) => startDrag(event, "move")}
        >
          {["nw", "ne", "sw", "se"].map((corner) => (
            <button
              key={corner}
              className={`ocr-crop-handle ${corner}`}
              type="button"
              aria-label={`调整裁剪区域${corner}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                startDrag(event, corner);
              }}
            />
          ))}
        </div>
      </div>
      <button className="secondary-button small crop-reset" type="button" onClick={() => onCropChange(defaultOcrCrop)}>重置裁剪</button>
    </section>
  );
}

function ReportScreen({ stats, expenses, allExpenses, budget, selectedMonth, currentMonth, onMonthChange, onEdit, onDelete }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousExpenses = useMemo(
    () => sortRecordsByDateTime(allExpenses.filter((item) => item.date?.startsWith(previousMonth))),
    [allExpenses, previousMonth]
  );
  const previousStats = useMemo(
    () => getMonthStats(previousExpenses, budget, previousMonth, expenseCategories),
    [previousExpenses, budget, previousMonth, expenseCategories]
  );
  const comparison = getMonthComparison(stats.total, previousStats.total);
  const merchantRanking = useMemo(() => getMerchantRanking(expenses, stats.total), [expenses, stats.total]);
  const budgetStatus = getBudgetStatus(stats, budget, selectedMonth, currentMonth);

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
          <span>本月收入</span>
          <strong>{money(stats.incomeTotal)}</strong>
        </div>
        <div>
          <span>本月结余</span>
          <strong>{money(stats.balance)}</strong>
        </div>
      </section>

      <section className="chart-panel">
        <SectionTitle title="环比上月" aside={formatMonthLabel(previousMonth)} />
        <div className="comparison-grid">
          <div>
            <span>上月支出</span>
            <strong>{money(previousStats.total)}</strong>
          </div>
          <div>
            <span>金额变化</span>
            <strong className={comparison.delta > 0 ? "negative" : comparison.delta < 0 ? "positive" : ""}>{comparison.amountLabel}</strong>
          </div>
          <div>
            <span>环比变化</span>
            <strong className={comparison.delta > 0 ? "negative" : comparison.delta < 0 ? "positive" : ""}>
              {comparison.rateLabel}
            </strong>
          </div>
        </div>
      </section>

      <section className={`budget-alert ${budgetStatus.tone}`}>
        <div>
          <span>预算状态</span>
          <strong>{budgetStatus.title}</strong>
          <p>{budgetStatus.detail}</p>
        </div>
        <b>{Math.round(stats.usedRate)}%</b>
        <div className="budget-alert-track">
          <i style={{ width: `${Math.min(stats.usedRate, 100)}%` }} />
        </div>
        <div className="budget-alert-meta">
          <span>预算 {money(budget)}</span>
          <span>{budgetStatus.meta}</span>
        </div>
      </section>

      <section className="chart-panel">
        <SectionTitle title="消费趋势" aside="本月 / 上月" />
        <div className="trend-legend">
          <span><i className="current" />本月</span>
          <span><i className="previous" />上月</span>
        </div>
        <TrendChart days={stats.days} previousDays={previousStats.days} />
      </section>

      <section className="chart-panel">
        <SectionTitle title="商户排行" aside={`前 ${Math.min(merchantRanking.length, 5)} 名`} />
        {merchantRanking.length === 0 ? (
          <EmptyLine text="本月还没有商户消费记录" />
        ) : (
          <div className="merchant-ranking">
            {merchantRanking.slice(0, 5).map((merchant, index) => (
              <div className="merchant-rank-item" key={merchant.name}>
                <b className="merchant-rank-number">{index + 1}</b>
                <div>
                  <strong>{merchant.name}</strong>
                  <span>{merchant.count} 笔 · 平均 {money(merchant.average)}</span>
                  <div><i style={{ width: `${merchant.percent}%` }} /></div>
                </div>
                <b>{money(merchant.total)}</b>
              </div>
            ))}
          </div>
        )}
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

      <SectionTitle title="收支洞察" aside={`${expenses.length} 笔`} />
      <div className="insight-list">
        <Insight text={stats.topCategory ? `${stats.topCategory.name} 是本月最高支出分类` : "本月还没有支出记录"} />
        <Insight text={stats.maxExpense ? `最大单笔是 ${stats.maxExpense.merchant}` : "开始记第一笔后生成洞察"} />
        <Insight text={stats.incomeTotal ? `本月收入 ${money(stats.incomeTotal)}，结余 ${money(stats.balance)}` : "收入记录会显示在结余里"} />
      </div>

      <SectionTitle title="月度账单" aside={`${expenses.length} 笔`} />
      <ExpenseList items={expenses} onEdit={onEdit} onDelete={onDelete} />
    </Screen>
  );
}

function ProfileScreen({ settings, setSettings, setExpenses, setPending }) {
  const [coverDraft, setCoverDraft] = useState(null);
  const [coverCrop, setCoverCrop] = useState({ x: 50, y: 50, zoom: 1 });
  const [categoryEditor, setCategoryEditor] = useState(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState("");
  const categoryDragRef = useRef("");
  const customCategories = settings.customExpenseCategories || [];
  const expenseCategories = useContext(ExpenseCategoriesContext);

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

  function openCategoryEditor(category) {
    setCategoryEditor({
      id: category?.id || "",
      name: category?.name || "",
      icon: category?.icon || "tag",
      color: category?.color || "#6f927d",
      keywordsText: (category?.keywords || []).join("、"),
      custom: Boolean(category?.custom),
      isNew: !category
    });
  }

  function saveCategoryEditor() {
    if (!categoryEditor) return;
    const name = categoryEditor.name.trim().slice(0, 12);
    if (!name) return;
    const keywords = parseCategoryKeywords(categoryEditor.keywordsText);
    const duplicate = expenseCategories.some((category) => category.name === name && category.id !== categoryEditor.id);
    if (duplicate) return;

    if (categoryEditor.isNew) {
      const nextCategory = {
        id: createId("category"),
        name,
        icon: categoryEditor.icon,
        color: categoryEditor.color,
        keywords,
        custom: true
      };
      setSettings((current) => ({
        ...current,
        customExpenseCategories: [...(current.customExpenseCategories || []), nextCategory],
        categoryOrder: [...expenseCategories.map((category) => category.id), nextCategory.id]
      }));
    } else if (categoryEditor.custom) {
      setSettings((current) => ({
        ...current,
        customExpenseCategories: (current.customExpenseCategories || []).map((category) =>
          category.id === categoryEditor.id
            ? { ...category, name, icon: categoryEditor.icon, color: categoryEditor.color, keywords, custom: true }
            : category
        )
      }));
    } else {
      setSettings((current) => ({
        ...current,
        categoryKeywordOverrides: {
          ...(current.categoryKeywordOverrides || {}),
          [categoryEditor.id]: keywords
        }
      }));
    }
    setCategoryEditor(null);
  }

  function removeCustomCategory(category) {
    if (!window.confirm(`删除“${category.name}”分类吗？已有账单会归入“其他”。`)) return;
    setSettings((current) => ({
      ...current,
      customExpenseCategories: (current.customExpenseCategories || []).filter((item) => item.id !== category.id),
      categoryOrder: (current.categoryOrder || []).filter((id) => id !== category.id)
    }));
    setExpenses((items) => items.map((item) => item.category === category.id ? { ...item, category: "other" } : item));
    setPending((items) => items.map((item) => item.category === category.id ? { ...item, category: "other" } : item));
    if (categoryEditor?.id === category.id) setCategoryEditor(null);
  }

  function moveCategory(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const order = expenseCategories.map((category) => category.id);
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, sourceId);
    setSettings((current) => ({ ...current, categoryOrder: order }));
  }

  function startCategoryPointerDrag(event, categoryId) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    categoryDragRef.current = categoryId;
    setDraggingCategoryId(categoryId);
  }

  function moveCategoryPointerDrag(event) {
    const sourceId = categoryDragRef.current;
    if (!sourceId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-category-id]");
    const targetId = target?.dataset?.categoryId;
    if (targetId && targetId !== sourceId) moveCategory(sourceId, targetId);
  }

  function endCategoryPointerDrag() {
    categoryDragRef.current = "";
    setDraggingCategoryId("");
  }

  function startCategoryHtmlDrag(event, categoryId) {
    categoryDragRef.current = categoryId;
    setDraggingCategoryId(categoryId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", categoryId);
  }

  function dragCategoryOver(event, targetId) {
    event.preventDefault();
    moveCategory(categoryDragRef.current, targetId);
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

        <SectionTitle title="消费分类" aside="拖动排序" />
        <section className="settings-panel category-manager">
          <div
            className="category-sort-list"
            onPointerMove={moveCategoryPointerDrag}
            onPointerUp={endCategoryPointerDrag}
            onPointerCancel={endCategoryPointerDrag}
          >
            {expenseCategories.map((category) => (
              <div
                className={draggingCategoryId === category.id ? "category-sort-row dragging" : "category-sort-row"}
                data-category-id={category.id}
                draggable
                key={category.id}
                onDragStart={(event) => startCategoryHtmlDrag(event, category.id)}
                onDragOver={(event) => dragCategoryOver(event, category.id)}
                onDragEnd={endCategoryPointerDrag}
              >
                <button
                  className="category-grip"
                  type="button"
                  aria-label={`拖动${category.name}`}
                  onPointerDown={(event) => startCategoryPointerDrag(event, category.id)}
                >
                  <GripIcon />
                </button>
                <span className="category-list-icon" style={{ color: category.color }}>
                  <CategoryIcon name={category.icon} size={19} />
                </span>
                <div>
                  <b>{category.name}</b>
                  <span>{category.keywords.length ? category.keywords.join("、") : "未设置关键词"}</span>
                </div>
                <button className="row-icon" type="button" aria-label={`编辑${category.name}`} onClick={() => openCategoryEditor(category)}>
                  <EditIcon />
                </button>
                {category.custom && (
                  <button className="row-icon" type="button" aria-label={`删除${category.name}`} onClick={() => removeCustomCategory(category)}>
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button className="secondary-button full" type="button" onClick={() => openCategoryEditor(null)}>
            <PlusIcon /> 添加分类
          </button>

          {categoryEditor && (
            <div className="category-editor">
              <div className="category-editor-heading">
                <div>
                  <span>{categoryEditor.isNew ? "新分类" : categoryEditor.custom ? "编辑自定义分类" : "内置分类"}</span>
                  <h3>{categoryEditor.isNew ? "设计分类" : categoryEditor.name}</h3>
                </div>
                <button className="ghost-button" type="button" aria-label="关闭分类编辑" onClick={() => setCategoryEditor(null)}>×</button>
              </div>

              <Field label="分类名称">
                <input
                  value={categoryEditor.name}
                  maxLength="12"
                  disabled={!categoryEditor.custom && !categoryEditor.isNew}
                  placeholder="例如：宠物"
                  onChange={(event) => setCategoryEditor({ ...categoryEditor, name: event.target.value })}
                />
              </Field>

              {(categoryEditor.custom || categoryEditor.isNew) && (
                <div className="category-designer">
                  <div>
                    <span>图标</span>
                    <div className="icon-picker">
                      {categoryIconOptions.map((icon) => (
                        <button
                          key={icon.id}
                          type="button"
                          className={categoryEditor.icon === icon.id ? "selected" : ""}
                          title={icon.name}
                          aria-label={icon.name}
                          onClick={() => setCategoryEditor({ ...categoryEditor, icon: icon.id })}
                        >
                          <CategoryIcon name={icon.id} size={19} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span>颜色</span>
                    <div className="color-picker">
                      {categoryColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={categoryEditor.color === color ? "selected" : ""}
                          aria-label="选择分类颜色"
                          style={{ background: color }}
                          onClick={() => setCategoryEditor({ ...categoryEditor, color })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Field label="自动归类关键词">
                <textarea
                  value={categoryEditor.keywordsText}
                  placeholder="例如：瑞幸、星巴克、美团外卖"
                  onChange={(event) => setCategoryEditor({ ...categoryEditor, keywordsText: event.target.value })}
                />
              </Field>

              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={() => setCategoryEditor(null)}>取消</button>
                <button className="primary-button" type="button" disabled={!categoryEditor.name.trim()} onClick={saveCategoryEditor}>
                  <CheckIcon /> 保存
                </button>
              </div>
            </div>
          )}
        </section>

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
          <span>{recordTypeLabels[local.type || "expense"]} · {local.source} · {local.date} {local.time}</span>
          {local.duplicateHint && <em className="duplicate-hint">检测到相似账单，请核对后确认</em>}
        </div>
        <b className={local.type === "income" ? "income-amount" : ""}>{signedMoney(local.amount, local.type)}</b>
      </div>
      <CategoryGrid compact type={local.type} value={local.category} onChange={(category) => setLocal({ ...local, category })} />
      <div className="pending-actions">
        <button type="button" className="ghost-button" onClick={() => onDelete(item)}>
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
  const expenseCategories = useContext(ExpenseCategoriesContext);
  if (!items.length) return <EmptyLine text="还没有记录" />;

  return (
    <div className="expense-list">
      {items.map((item) => {
        const category = getCategory(item.category, item.type, expenseCategories);
        return (
          <article className={item.type === "income" ? "expense-row income-row" : "expense-row"} key={item.id}>
            <span className="expense-category-icon" style={{ color: category.color }}>
              <CategoryIcon name={category.icon} size={20} />
            </span>
            <div>
              <strong>{item.merchant}</strong>
              <span>{recordTypeLabels[item.type || "expense"]} · {category.name} · {item.method} · {item.date}</span>
              {item.note && <em className="expense-note">{item.note}</em>}
            </div>
            <b>{signedMoney(item.amount, item.type)}</b>
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
          <p>{item.merchant} · {signedMoney(item.amount, item.type)}</p>
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

function TypeToggle({ value, onChange }) {
  return (
    <div className="type-toggle">
      {["expense", "income"].map((type) => (
        <button
          key={type}
          type="button"
          className={value === type ? "selected" : ""}
          onClick={() => onChange(type)}
        >
          {recordTypeLabels[type]}
        </button>
      ))}
    </div>
  );
}

function CategoryGrid({ value, onChange, compact = false, type = "expense" }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
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

function TrendChart({ days, previousDays = [] }) {
  const visibleLength = Math.max(days.length, previousDays.length, 1);
  const max = Math.max(...days.map((day) => day.total), ...previousDays.map((day) => day.total), 1);
  const buildPoints = (source) => source
    .map((day, index) => {
      const x = 14 + (index / Math.max(visibleLength - 1, 1)) * 252;
      const y = 104 - (day.total / max) * 78;
      return `${x},${y}`;
    })
    .join(" ");
  const points = buildPoints(days);
  const previousPoints = buildPoints(previousDays);

  return (
    <svg className="trend-chart" viewBox="0 0 280 128" role="img" aria-label="本月与上月消费趋势">
      <path d="M14 106H266" />
      <path d="M14 28H266" className="grid-line" />
      {previousPoints && <polyline points={previousPoints} className="previous-line" />}
      {points && <polyline points={points} className="current-line" />}
      {days.map((day, index) => {
        const x = 14 + (index / Math.max(visibleLength - 1, 1)) * 252;
        const y = 104 - (day.total / max) * 78;
        return <circle key={day.date} cx={x} cy={y} r="2.8" />;
      })}
      <text x="14" y="122">1日</text>
      <text x="255" y="122" textAnchor="end">{visibleLength}日</text>
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

function getMonthStats(expenses, budget, month = today().slice(0, 7), expenseCategories = categories) {
  // Older records did not have a type; they are historical expense records.
  const expenseItems = expenses.filter((item) => !item.type || item.type === "expense");
  const incomeItems = expenses.filter((item) => item.type === "income");
  const total = expenseItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const incomeTotal = incomeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const currentMonth = today().slice(0, 7);
  const todayTotal = month === currentMonth
    ? expenseItems.filter((item) => item.date === today()).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    : 0;
  const categoryTotals = expenseCategories
    .map((category) => {
      const categoryTotal = expenseItems
        .filter((item) => item.category === category.id)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return {
        ...category,
        total: categoryTotal,
        percent: total ? Math.round((categoryTotal / total) * 100) : 0
      };
    })
    .filter((item) => item.total > 0);
  const topCategory = categoryTotals.slice().sort((a, b) => b.total - a.total)[0];

  const [year, monthNumber] = month.split("-").map(Number);
  const now = new Date();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const visibleDays = month === currentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  const days = Array.from({ length: visibleDays }, (_, index) => {
    const date = `${year}-${pad(monthNumber)}-${pad(index + 1)}`;
    return {
      date,
      total: expenseItems.filter((item) => item.date === date).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    };
  });

  return {
    total,
    incomeTotal,
    balance: incomeTotal - total,
    budget,
    todayTotal,
    usedRate: budget ? (total / budget) * 100 : 0,
    dailyAverage: days.length ? total / days.length : 0,
    categoryTotals,
    topCategory,
    maxExpense: expenseItems.slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0],
    maxIncome: incomeItems.slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0],
    days
  };
}

function getMonthComparison(currentTotal, previousTotal) {
  const current = Number(currentTotal || 0);
  const previous = Number(previousTotal || 0);
  const delta = current - previous;
  let rateLabel = "与上月持平";
  if (previous > 0) {
    const rate = (delta / previous) * 100;
    rateLabel = rate > 0 ? `增加 ${Math.round(rate)}%` : rate < 0 ? `减少 ${Math.abs(Math.round(rate))}%` : "与上月持平";
  } else if (current > 0) {
    rateLabel = "上月无支出";
  }
  const amountLabel = delta > 0
    ? `多支出 ${money(delta)}`
    : delta < 0
      ? `少支出 ${money(Math.abs(delta))}`
      : "与上月持平";
  return { delta, amountLabel, rateLabel };
}

function getMerchantRanking(records, monthTotal) {
  const grouped = new Map();
  records
    .filter((item) => item.type !== "income")
    .forEach((item) => {
      const name = String(item.merchant || "未填写商户").trim() || "未填写商户";
      const amount = Number(item.amount || 0);
      const current = grouped.get(name) || { name, total: 0, count: 0 };
      current.total += amount;
      current.count += 1;
      grouped.set(name, current);
    });

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      average: item.count ? item.total / item.count : 0,
      percent: monthTotal ? Math.min(100, (item.total / monthTotal) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}

function getBudgetStatus(stats, budget, selectedMonth, currentMonth) {
  const amount = Number(budget || 0);
  if (amount <= 0) {
    return {
      tone: "neutral",
      title: "尚未设置预算",
      detail: "设置月预算后，这里会显示接近预算和预计超支提醒。",
      meta: "可在“我的”中设置"
    };
  }

  const total = Number(stats.total || 0);
  const remaining = amount - total;
  const isCurrentMonth = selectedMonth === currentMonth;
  const [year, month] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const elapsedDays = isCurrentMonth ? Math.max(1, Math.min(new Date().getDate(), daysInMonth)) : daysInMonth;
  const projected = isCurrentMonth ? (total / elapsedDays) * daysInMonth : total;

  if (total > amount) {
    return {
      tone: "danger",
      title: "本月已经超支",
      detail: `已超过预算 ${money(total - amount)}，建议留意接下来的非必要消费。`,
      meta: `超支 ${money(total - amount)}`
    };
  }
  if (isCurrentMonth && projected > amount) {
    return {
      tone: "warning",
      title: "按当前速度预计会超支",
      detail: `预计月底支出约 ${money(projected)}，高于当前月预算。`,
      meta: `预计 ${money(projected)}`
    };
  }
  if (stats.usedRate >= 80) {
    return {
      tone: "warning",
      title: "预算即将用完",
      detail: `当前已使用 ${Math.round(stats.usedRate)}%，剩余可用 ${money(remaining)}。`,
      meta: `剩余 ${money(remaining)}`
    };
  }
  return {
    tone: "safe",
    title: "预算状态正常",
    detail: isCurrentMonth ? `按当前记录，月底预计支出约 ${money(projected)}。` : "该月支出保持在预算范围内。",
    meta: `剩余 ${money(remaining)}`
  };
}

function sortRecordsByDateTime(records) {
  return records
    .slice()
    .sort((a, b) => getRecordTimeValue(b) - getRecordTimeValue(a));
}

function getRecordTimeValue(record) {
  const date = record?.date || "1970-01-01";
  const time = record?.time || "00:00";
  const value = new Date(`${date}T${time}`).getTime();
  return Number.isNaN(value) ? 0 : value;
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
  enhanceCanvasForOcr(context, outputWidth, outputHeight);

  return canvas.toDataURL("image/jpeg", 0.9);
}

async function cropOcrImage(src, crop) {
  const image = await loadImage(src);
  const selected = normalizeOcrCrop(crop);
  const sourceX = Math.round((image.naturalWidth * selected.x) / 100);
  const sourceY = Math.round((image.naturalHeight * selected.y) / 100);
  const sourceWidth = Math.max(1, Math.round((image.naturalWidth * selected.width) / 100));
  const sourceHeight = Math.max(1, Math.round((image.naturalHeight * selected.height) / 100));
  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function enhanceCanvasForOcr(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = clamp((gray - 128) * 1.18 + 128, 0, 255);
    const value = contrasted > 238 ? 255 : contrasted < 28 ? 0 : contrasted;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeOcrCrop(crop) {
  const minSize = 12;
  const width = clamp(Number(crop?.width ?? 92), minSize, 100);
  const height = clamp(Number(crop?.height ?? 92), minSize, 100);
  return {
    x: clamp(Number(crop?.x ?? 4), 0, 100 - width),
    y: clamp(Number(crop?.y ?? 4), 0, 100 - height),
    width,
    height
  };
}

function resizeOcrCrop(crop, mode, deltaX, deltaY) {
  const current = normalizeOcrCrop(crop);
  const minSize = 12;
  if (mode === "move") {
    return normalizeOcrCrop({
      ...current,
      x: clamp(current.x + deltaX, 0, 100 - current.width),
      y: clamp(current.y + deltaY, 0, 100 - current.height)
    });
  }

  const right = current.x + current.width;
  const bottom = current.y + current.height;
  let x = current.x;
  let y = current.y;
  let width = current.width;
  let height = current.height;

  if (mode.includes("w")) {
    x = clamp(current.x + deltaX, 0, right - minSize);
    width = right - x;
  }
  if (mode.includes("e")) width = clamp(current.width + deltaX, minSize, 100 - current.x);
  if (mode.includes("n")) {
    y = clamp(current.y + deltaY, 0, bottom - minSize);
    height = bottom - y;
  }
  if (mode.includes("s")) height = clamp(current.height + deltaY, minSize, 100 - current.y);

  return normalizeOcrCrop({ x, y, width, height });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  const number = Number(value || 0);
  const absolute = Math.abs(number);
  return `${number < 0 ? "-" : ""}¥${absolute.toLocaleString("zh-CN", {
    minimumFractionDigits: absolute % 1 ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
}

function signedMoney(value, type = "expense") {
  return `${type === "income" ? "+" : "-"}${money(Math.abs(Number(value || 0)))}`;
}

function getCategory(categoryId, type = "expense", expenseCategories = categories) {
  const source = type === "income" ? incomeCategories : expenseCategories;
  return source.find((entry) => entry.id === categoryId) || source.at(-1);
}

function mergeExpenseCategories(customCategories, categoryOrder = [], keywordOverrides = {}) {
  const knownIds = new Set(categories.map((category) => category.id));
  const builtIn = categories.map((category) => ({
    ...category,
    custom: false,
    keywords: Array.isArray(keywordOverrides?.[category.id])
      ? keywordOverrides[category.id].filter(Boolean)
      : category.keywords
  }));
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
  const other = builtIn.find((category) => category.id === "other");
  const all = [...builtIn.filter((category) => category.id !== "other"), ...validCustom, other];
  const byId = new Map(all.map((category) => [category.id, category]));
  const ordered = (Array.isArray(categoryOrder) ? categoryOrder : [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  const orderedIds = new Set(ordered.map((category) => category.id));
  return [...ordered, ...all.filter((category) => !orderedIds.has(category.id))];
}

function parseCategoryKeywords(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/[、，,;；\n]+/)
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 30)
  ));
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
