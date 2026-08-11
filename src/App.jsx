import React, { Activity, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { categories, coverPresets, incomeCategories, methods, themes } from "./data.js";
import { hasStoredState, loadState, readFileAsDataUrl } from "./storage.js";
import { parseExpenseText } from "./parser.js";
import { buildNativeMerchantProfiles, refineWithMerchantMemory } from "./merchantMemory.js";
import { buildIncomeSummary, compareIncome } from "./incomeSummary.js";
import { createId } from "./ids.js";
import { PawPrint } from "lucide-react";
import { CategoryIcon, categoryIconGroups, searchCategoryIcons } from "./categoryIcons.jsx";
import { AppHeader, Screen } from "./ui.jsx";
import { useDebouncedLedgerSave, useNativeLedgerBackup } from "./hooks/useLedgerPersistence.js";
import { useNotificationSync } from "./hooks/useNotificationSync.js";
import { useDialogFocus } from "./hooks/useDialogFocus.js";
import { ExpenseCategoriesContext, IncomeCategoriesContext } from "./categoryContext.js";
import { CategoryGrid, Field, SegmentedControl, TypeToggle } from "./components/FormControls.jsx";
import {
  NekoEmptyState,
  NekoHomeHero,
  NekoQuickActions,
  NekoSectionHeading,
  NekoShortcutRail
} from "./components/NekoHomeWidgets.jsx";
import { AddScreen } from "./screens/AddScreen.jsx";
import {
  fallbackCategories,
  getCategory,
  mergeExpenseCategories,
  mergeIncomeCategories,
  parseCategoryKeywords
} from "./domain/categories.js";
import { mergePendingEntries, normalizePendingEntry } from "./domain/pending.js";
import { normalizeNotificationItems } from "./domain/notifications.js";
import {
  ChartIcon,
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

const navItems = [
  { id: "home", label: "首页", icon: WalletIcon },
  { id: "add", label: "记一笔", icon: PlusIcon },
  { id: "scan", label: "识别", icon: ScanIcon },
  { id: "report", label: "月报", icon: ChartIcon },
  { id: "profile", label: "我的", icon: UserIcon }
];

// Keep native proxies stable across Vite hot updates. Registering the same
// Capacitor plugin repeatedly is harmless in production but noisy in browser QA.
const nativePlugins = globalThis.__expenseGardenNativePlugins || (
  globalThis.__expenseGardenNativePlugins = {
    XzbOcr: registerPlugin("XzbOcr"),
    XzbNotify: registerPlugin("XzbNotify"),
    XzbBackup: registerPlugin("XzbBackup")
  }
);
const { XzbOcr, XzbNotify, XzbBackup } = nativePlugins;
const recordTypeLabels = { expense: "支出", income: "收入" };
const defaultOcrCrop = { x: 4, y: 4, width: 92, height: 92 };
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

function App() {
  const initial = useMemo(loadState, []);
  // Must be captured before the first saveState effect writes default state.
  const startedFresh = useMemo(() => !hasStoredState(), []);
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
      settings.categoryKeywordOverrides,
      settings.categoryOverrides
    ),
    [
      settings.customExpenseCategories,
      settings.categoryOrder,
      settings.categoryKeywordOverrides,
      settings.categoryOverrides
    ]
  );
  const incomeCategoryList = useMemo(
    () => mergeIncomeCategories(
      settings.customIncomeCategories,
      settings.incomeCategoryOrder,
      settings.incomeCategoryOverrides
    ),
    [
      settings.customIncomeCategories,
      settings.incomeCategoryOrder,
      settings.incomeCategoryOverrides
    ]
  );
  const appState = useMemo(() => ({ expenses, pending, settings }), [expenses, pending, settings]);
  const currentMonth = today().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const monthlyExpenses = useMemo(
    () => sortRecordsByDateTime(expenses.filter((expense) => expense.date?.startsWith(selectedMonth))),
    [expenses, selectedMonth]
  );
  const stats = useMemo(
    () => getMonthStats(monthlyExpenses, settings.budget, selectedMonth, expenseCategories, incomeCategoryList),
    [monthlyExpenses, settings.budget, selectedMonth, expenseCategories, incomeCategoryList]
  );
  const nativeBackupReady = useNativeLedgerBackup({
    enabled: canUseNativeNotify,
    startedFresh,
    state: appState,
    backupPlugin: XzbBackup,
    onRestore: (restored) => {
      setExpenses(restored.expenses);
      setPending(restored.pending);
      setSettings(restored.settings);
    }
  });
  useDebouncedLedgerSave(appState, { enabled: nativeBackupReady });

  useEffect(() => {
    document.documentElement.style.setProperty("--brand-base", theme.primary);
    document.documentElement.style.setProperty("--brand-accent", theme.accent);
    document.documentElement.style.setProperty("--action-primary", theme.action || theme.primary);
    // Legacy aliases remain during the CSS migration; both now map to
    // contrast-safe semantic roles instead of one overloaded theme color.
    document.documentElement.style.setProperty("--primary", theme.action || theme.primary);
    document.documentElement.style.setProperty("--accent", theme.accent);
    document.body.dataset.theme = settings.darkMode ? "dark" : "light";
    if (Capacitor.isNativePlatform()) {
      SystemBars.setStyle({
        style: settings.darkMode ? SystemBarsStyle.Dark : SystemBarsStyle.Light
      }).catch(() => {});
    }
  }, [theme, settings.darkMode]);

  useEffect(() => {
    if (!canUseNativeNotify) return undefined;
    XzbNotify.updateMerchantProfiles({ profiles: buildNativeMerchantProfiles(expenses) }).catch(() => {});
    return undefined;
  }, [canUseNativeNotify, expenses]);

  function ingestNotificationEntries(entries, options = {}) {
    const normalized = Array.isArray(entries) ? entries : [];
    const confirmed = normalized.filter((entry) => entry.quickConfirmed && Number(entry.amount) > 0);
    const confirmedIds = new Set(confirmed.map((entry) => entry.notificationId).filter(Boolean));
    if (confirmed.length) {
      setPending((items) => items.filter((item) => !confirmedIds.has(item.notificationId)));
      setExpenses((items) => {
        const existingNotificationIds = new Set(items.map((item) => item.notificationId).filter(Boolean));
        const additions = confirmed
          .filter((entry) => !entry.notificationId || !existingNotificationIds.has(entry.notificationId))
          .map((entry) => ({
            ...entry,
            id: createId("expense"),
            source: "通知快捷确认",
            note: entry.note || "已从通知快捷确认商户"
          }));
        return additions.length ? [...additions, ...items] : items;
      });
    }
    const pendingEntries = normalized.filter((entry) => !entry.quickConfirmed && !confirmedIds.has(entry.notificationId));
    if (pendingEntries.length) addPendingBatch(pendingEntries, options);
    return { confirmedCount: confirmed.length, pendingCount: pendingEntries.length };
  }

  const handleAddPending = useCallback((entry, options = {}) => addPending(entry, options), []);
  const handleAddPendingBatch = useCallback((entries, options = {}) => addPendingBatch(entries, options), []);
  const handleNotificationEntries = useCallback(
    (entries, options = {}) => ingestNotificationEntries(entries, options),
    []
  );

  useNotificationSync({
    enabled: canUseNativeNotify,
    notifyPlugin: XzbNotify,
    categories: expenseCategories,
    merchantHistory: expenses,
    normalizeItems: normalizeNotificationItems,
    onEntries: handleNotificationEntries
  });

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
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const type = entry.type === "income" ? "income" : "expense";
    const expense = {
      ...entry,
      type,
      category: entry.category || (type === "income" ? "income-other" : "other"),
      id: createId("expense"),
      amount,
      note: entry.note || "",
      source: entry.source || "识别"
    };
    setExpenses((items) => [expense, ...items]);
    setPending((items) => items.filter((item) => item.id !== entry.id));
  }

  function editExpense(expense) {
    const type = expense.type === "income" ? "income" : "expense";
    setDraft({
      ...expense,
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
    <IncomeCategoriesContext.Provider value={incomeCategoryList}>
    <div className="app-shell">
      <main className="phone-frame" data-active-tab={activeTab}>
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
        <Activity mode={activeTab === "scan" ? "visible" : "hidden"}>
          <ScanScreen
            hidden={activeTab !== "scan"}
            merchantHistory={expenses}
            onPending={handleAddPending}
            onPendingBatch={handleAddPendingBatch}
            onNotificationEntries={handleNotificationEntries}
          />
        </Activity>
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
    </IncomeCategoriesContext.Provider>
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
  const formattedTotal = money(stats.total);
  const amountLengthClass = formattedTotal.length >= 13 ? "is-xlong" : formattedTotal.length >= 10 ? "is-long" : "";
  const companionLine = pending.length
    ? `${pending.length} 条账单等猫娘陪你确认`
    : stats.balance < 0
      ? "猫娘发现本月支出高于收入，去看看明细"
      : "猫娘已把今天的账目整理好";
  const heroSummary = {
    periodLabel: formatMonthLabel(selectedMonth),
    totalLabel: isCurrentMonth ? "本月支出" : "所选月支出",
    formattedTotal,
    amountLengthClass,
    dailyLabel: isCurrentMonth ? "今日" : "日均",
    dailyValue: money(isCurrentMonth ? stats.todayTotal : stats.dailyAverage),
    budget: money(stats.budget),
    usedRate: stats.usedRate,
    income: money(stats.incomeTotal),
    balance: money(stats.balance),
    balanceNegative: stats.balance < 0
  };

  return (
    <Screen className="home-screen chibi-home">
      <header className="topbar chibi-topbar">
        <div>
          <p className="date-line">{formatReadableDate(today())}</p>
          <div className="chibi-title-line">
            <h1>小账本</h1>
            <span className="chibi-brand-paw" aria-hidden="true"><PawPrint /></span>
          </div>
          <div className="chibi-companion-line" role="status">
            <span className="chibi-companion-avatar" aria-hidden="true">
              <img src="/assets/neko-bookkeeper-chibi-v1.png" alt="" draggable="false" />
            </span>
            <p>{companionLine}</p>
          </div>
        </div>
        <button className="icon-button chibi-profile-button" type="button" aria-label="自定义封面" onClick={() => onTab("profile")}>
          <UserIcon />
          {pending.length > 0 && <span aria-hidden="true" />}
        </button>
      </header>

      <NekoHomeHero summary={heroSummary} coverStyle={coverStyle} />

      <section className="chibi-home-content">
        <NekoQuickActions onAdd={() => onTab("add")} onScan={() => onTab("scan")} />
        <NekoShortcutRail onTab={onTab} />

        <MonthPicker value={selectedMonth} max={currentMonth} onChange={onMonthChange} />

        <NekoSectionHeading type="pending" title="待确认" aside={`${pending.length} 条`} />
        <div className="stack">
          {pending.length === 0 && <NekoEmptyState />}
          {pending.map((item) => (
            <PendingCard key={item.id} item={item} onConfirm={onConfirm} onDelete={onDeletePending} />
          ))}
        </div>

        <NekoSectionHeading type="recent" title="最近记录" aside={formatMonthLabel(selectedMonth)} />
        <ExpenseList items={latest} onEdit={onEdit} onDelete={onDelete} />
      </section>
    </Screen>
  );
}

function ScanScreen({ hidden = false, merchantHistory = [], onPending, onPendingBatch, onNotificationEntries }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
  const [rawText, setRawText] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [batchCandidates, setBatchCandidates] = useState([]);
  const [preview, setPreview] = useState("");
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState("");
  const [imageBatch, setImageBatch] = useState([]);
  const [activeBatchImageId, setActiveBatchImageId] = useState("");
  const [ocrCrop, setOcrCrop] = useState(defaultOcrCrop);
  const [status, setStatus] = useState("等待截图");
  const [imageNotice, setImageNotice] = useState("");
  const [isBatchRecognizing, setIsBatchRecognizing] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState({
    enabled: false,
    connected: false,
    recovering: false,
    rebindRequestCount: 0,
    quickConfirmEnabled: false,
    profileCount: 0,
    lastSeenAt: 0,
    lastAcceptedAt: 0,
    lastReason: "never_seen",
    queueCount: 0
  });
  const [notificationNotice, setNotificationNotice] = useState("");
  const [isNotificationTesting, setIsNotificationTesting] = useState(false);
  const notificationRefreshInFlightRef = useRef(false);
  const canUseNativeOcr = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const canUseNativeNotify = canUseNativeOcr;
  const activeBatchImage = imageBatch.find((image) => image.id === activeBatchImageId) || imageBatch[0] || null;

  function parseWithHistory(text) {
    return refineWithMerchantMemory(
      parseExpenseText(text, expenseCategories, incomeCategoryList),
      text,
      merchantHistory
    );
  }

  useEffect(() => {
    // The scan screen stays mounted for state retention; only poll while visible.
    if (hidden) return undefined;
    refreshNotificationPermission();
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") refreshNotificationPermission();
    };
    const refreshOnFocus = () => refreshNotificationPermission({ silent: true });
    const healthTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshNotificationPermission({ silent: true });
    }, 60_000);
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(healthTimer);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [canUseNativeNotify, hidden]);

  async function pickImageWithNativeOcr() {
    setCandidate(null);
    setBatchCandidates([]);
    setRawText("");
    setPreview("");
    setSelectedImageDataUrl("");
    setImageBatch([]);
    setActiveBatchImageId("");
    setOcrCrop(defaultOcrCrop);
    setImageNotice("");

    if (!canUseNativeOcr) {
      setStatus("需要安卓安装包");
      setImageNotice("请在手机安装包里使用系统选图；网页预览可用下方虚线框选择图片。");
      return;
    }

    setStatus("正在打开相册");
    try {
      const result = await XzbOcr.pickImages();
      const images = Array.isArray(result?.images) ? result.images : [];
      if (!images.length) {
        setStatus("读取失败");
        setImageNotice("没有读到图片内容，请重新选择。");
        return;
      }
      applySelectedImages(images);
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
        text: "",
        crop: { ...defaultOcrCrop }
      }))
      .filter((image) => image.dataUrl);

    if (!normalized.length) {
      setStatus("读取失败");
      setImageNotice("没有读到图片内容，请重新选择。");
      return;
    }

    setImageBatch(normalized);
    setPreview(normalized[0].dataUrl);
    setSelectedImageDataUrl(normalized[0].dataUrl);
    setActiveBatchImageId(normalized[0].id);
    setOcrCrop(normalized[0].crop);
    setRawText("");
    setCandidate(null);
    setBatchCandidates([]);

    setStatus(normalized.length === 1 ? "请裁剪后识别" : `已选择 ${normalized.length} 张`);
    setImageNotice(normalized.length === 1
      ? "裁剪区域已保存，识别时会读取框内内容。"
      : "每张截图都可单独裁剪，点选缩略图切换。"
    );
  }

  function selectBatchImage(imageId) {
    const image = imageBatch.find((item) => item.id === imageId);
    if (!image) return;
    setActiveBatchImageId(image.id);
    setPreview(image.dataUrl);
    setSelectedImageDataUrl(image.dataUrl);
    setOcrCrop(normalizeOcrCrop(image.crop || defaultOcrCrop));
  }

  function updateActiveImageCrop(nextCrop) {
    const normalizedCrop = normalizeOcrCrop(nextCrop);
    setOcrCrop(normalizedCrop);
    setImageBatch((items) => items.map((item) => (
      item.id === activeBatchImage?.id ? { ...item, crop: normalizedCrop } : item
    )));
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

  async function readBatchImageText(image) {
    if (image?.uri) {
      const result = await XzbOcr.recognizeUri({
        uri: image.uri,
        crop: normalizeOcrCrop(image.crop || defaultOcrCrop)
      });
      return String(result?.text || "").trim();
    }
    const croppedImage = await cropOcrImage(image.dataUrl, image.crop || defaultOcrCrop);
    return readImageText(croppedImage);
  }

  async function handleImages(fileList) {
    const files = Array.from(fileList || []).slice(0, 12);
    if (!files.length) return;
    if (canUseNativeOcr && files.length > 1) {
      setStatus("请用原生批量入口");
      setImageNotice("手机端多图请点上方“批量选择截图”，避免大图在 WebView 中占用过多内存。");
      return;
    }

    const images = [];
    // Read fallback files sequentially so a desktop/web batch never holds
    // twelve full file-reader buffers at the same time.
    for (const file of files) {
      images.push({
        dataUrl: await readFileAsDataUrl(file),
        uri: "",
        name: file.name
      });
    }

    setOcrCrop(defaultOcrCrop);
    applySelectedImages(images);

    if (canUseNativeOcr) {
      return;
    }

    if (files.length === 1 && "TextDetector" in window) {
      try {
        const detector = new window.TextDetector();
        const bitmap = await createImageBitmap(files[0]);
        try {
          const detections = await detector.detect(bitmap);
          const text = detections.map((item) => item.rawValue).join("\n");
          setRawText(text);
          setStatus(text ? "已读取文字" : "等待文字");
          if (!text) setImageNotice("没有读取到文字，请把账单文字粘贴到文本框后再识别。");
        } finally {
          bitmap.close?.();
        }
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
    if (activeBatchImage) {
      setStatus("正在识别裁剪区域");
      setImageNotice("");
      try {
        const text = await readBatchImageText(activeBatchImage);
        setRawText(text);
        setImageBatch((items) => items.map((item) => (
          item.id === activeBatchImage.id ? { ...item, text, status: text ? "已识别" : "无文字" } : item
        )));
        if (!text) {
          setStatus("未识别到文字");
          setImageNotice("裁剪区域内没有读到文字，请调整范围后重试。");
          return;
        }
        recognizeFromText(text, "截图识别");
      } catch (error) {
        setStatus("识别失败");
        setImageNotice(error?.message || "OCR 识别失败，请调整裁剪区域后重试。");
      }
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
        const text = await readBatchImageText(image);
        const parsed = text ? parseWithHistory(text) : null;
        setImageBatch((items) =>
          items.map((item) => (item.id === image.id ? { ...item, status: text ? "已识别" : "无文字", text } : item))
        );
        if (parsed) {
          results.push({
            ...parsed,
            id: createId(`batch-${index}`),
            source: "截图识别",
            note: "",
            imageName: image.name || `截图 ${index + 1}`,
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
    setActiveBatchImageId("");
    setSelectedImageDataUrl("");
    setPreview("");
    setRawText("");
    setStatus("等待截图");
    setImageNotice("");
  }

  async function refreshNotificationPermission({ silent = false } = {}) {
    if (!canUseNativeNotify || notificationRefreshInFlightRef.current) return;
    notificationRefreshInFlightRef.current = true;
    try {
      let result = await XzbNotify.isEnabled();
      if (result?.enabled && !result?.connected) {
        result = await XzbNotify.reconnect();
        for (const delay of [350, 700, 1_200]) {
          if (result?.connected) break;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
          result = await XzbNotify.isEnabled();
        }
      }
      setNotificationStatus((current) => ({ ...current, ...result }));
      if (silent) return;
      if (result?.enabled && result?.connected) {
        setNotificationNotice("通知监听已连接，新的付款通知会进入待确认。");
      } else if (result?.enabled) {
        setNotificationNotice("系统已授权，监听正在自动恢复。仍未恢复时，请把电池用量设为“不限制”。");
      } else {
        setNotificationNotice("尚未开启通知使用权，自动记账不会运行。");
      }
    } catch {
      setNotificationStatus((current) => ({
        ...current,
        recovering: current.enabled && !current.connected
      }));
      if (!silent) setNotificationNotice("暂时无法读取监听状态，系统会继续在后台重试。");
    } finally {
      notificationRefreshInFlightRef.current = false;
    }
  }

  async function openNotificationAppSettings() {
    if (!canUseNativeNotify) return;
    try {
      await XzbNotify.openAppSettings();
      setNotificationNotice("请在应用设置中允许后台运行，并把电池用量设为“不限制”，返回后会自动重连。");
    } catch (error) {
      setNotificationNotice(error?.message || "无法打开小账本的应用设置。");
    }
  }

  async function openNotificationSettings() {
    if (!canUseNativeNotify) {
      setNotificationNotice("通知自动记账需要在安卓安装包里开启通知访问权限。");
      return;
    }
    try {
      await XzbNotify.requestQuickConfirmPermission().catch(() => {});
      await XzbNotify.openSettings();
      setNotificationNotice("已打开系统设置。开启小账本后直接返回，App 会自动检查监听状态。");
    } catch (error) {
      setNotificationNotice(error?.message || "无法打开通知使用权设置，请在系统设置中搜索“小账本”。");
    }
  }

  async function syncNotificationBills() {
    if (!canUseNativeNotify) {
      setNotificationNotice("通知自动记账需要在安卓安装包里使用。");
      return;
    }

    try {
      let status = await XzbNotify.isEnabled();
      setNotificationStatus((current) => ({ ...current, ...status }));
      if (!status?.enabled) {
        setNotificationNotice("请先开启通知访问权限。");
        return;
      }

      if (!status?.connected) {
        status = await XzbNotify.reconnect();
        setNotificationStatus((current) => ({ ...current, ...status }));
      }

      const result = await XzbNotify.drainNotifications();
      const latestStatus = result?.status || status;
      setNotificationStatus((current) => ({ ...current, ...latestStatus, queueCount: 0 }));
      const entries = normalizeNotificationItems(
        (result?.items || []).filter((item) => !item?.test),
        expenseCategories,
        merchantHistory
      );
      if (!entries.length) {
        setNotificationNotice(getNotificationEmptyMessage(latestStatus));
        return;
      }

      const summary = onNotificationEntries
        ? onNotificationEntries(entries, { navigate: false })
        : (onPendingBatch(entries, { navigate: false }), { confirmedCount: 0, pendingCount: entries.length });
      setNotificationNotice(summary.confirmedCount
        ? `已快捷确认 ${summary.confirmedCount} 条，另有 ${summary.pendingCount} 条待确认。`
        : `已同步 ${summary.pendingCount} 条通知到账单待确认。`);
    } catch (error) {
      setNotificationNotice(error?.message || "同步通知失败，请确认权限已开启。");
    }
  }

  async function testNotificationPipeline() {
    if (!canUseNativeNotify) {
      setNotificationNotice("通知链路自检需要在安卓安装包里运行。");
      return;
    }
    if (!notificationStatus.enabled) {
      setNotificationNotice("请先开启通知使用权，再运行链路自检。");
      return;
    }

    setIsNotificationTesting(true);
    try {
      const result = await XzbNotify.runSelfTest();
      const items = Array.isArray(result?.items) ? result.items : [];
      const testItem = items.find((item) => item?.test);
      const realEntries = normalizeNotificationItems(
        items.filter((item) => !item?.test),
        expenseCategories,
        merchantHistory
      );
      if (realEntries.length) {
        if (onNotificationEntries) onNotificationEntries(realEntries, { navigate: false });
        else onPendingBatch(realEntries, { navigate: false });
      }

      const parsed = testItem ? parseWithHistory(String(testItem.rawText || "")) : null;
      if (testItem && Number(parsed?.amount) === 0.01 && parsed?.merchant !== "未识别商户") {
        setNotificationNotice("链路自检通过：原生插件、通知队列和账单解析均正常，测试数据未入账。");
      } else {
        setNotificationNotice("链路自检未通过，请重新安装当前版本后再试。");
      }
      if (result?.status) setNotificationStatus((current) => ({ ...current, ...result.status, queueCount: 0 }));
    } catch (error) {
      setNotificationNotice(error?.message || "通知链路自检失败，请重开小账本后再试。");
    } finally {
      setIsNotificationTesting(false);
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

    const parsed = parseWithHistory(normalizedText);
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
    setActiveBatchImageId("");
    setPreview("");
    setStatus("等待截图");
    setImageNotice("");
  }

  return (
    <Screen className="scan-screen" hidden={hidden}>
      <AppHeader eyebrow="导入截图" title="识别后确认" />

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
        {imageBatch.length > 0 && (
          <BatchImageQueue images={imageBatch} activeId={activeBatchImage?.id} onSelect={selectBatchImage} />
        )}
        {selectedImageDataUrl && (
          <ScreenshotCropPanel crop={ocrCrop} image={selectedImageDataUrl} onCropChange={updateActiveImageCrop} />
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
        {imageNotice && <p className="scan-feedback" role="status">{imageNotice}</p>}
      </div>

      <section className="notification-sync-card" aria-live="polite">
        <div className="notification-card-heading">
          <div>
            <span>通知自动记账</span>
            <strong>{getNotificationStatusLabel(notificationStatus)}</strong>
          </div>
          <b className={`notification-state-badge ${notificationStatus.connected ? "ready" : notificationStatus.recovering ? "recovering" : ""}`}>
            {notificationStatus.connected ? "运行中" : notificationStatus.recovering ? "恢复中" : "未启用"}
          </b>
        </div>
        <p>{getNotificationStatusDetail(notificationStatus)}</p>
        <div className="notification-checks">
          <NotificationCheck
            active={notificationStatus.enabled}
            title="系统授权"
            detail={notificationStatus.enabled ? "已允许读取支付通知" : "未开启，无法自动记账"}
          />
          <NotificationCheck
            active={notificationStatus.connected}
            title="监听连接"
            detail={notificationStatus.connected
              ? "服务已在系统中运行"
              : notificationStatus.recovering
                ? `正在自动重连${notificationStatus.rebindRequestCount ? ` · 已尝试 ${notificationStatus.rebindRequestCount} 次` : ""}`
                : "服务尚未接入系统"}
          />
          <NotificationCheck
            active={Boolean(notificationStatus.lastSeenAt)}
            title="平台通知"
            detail={notificationStatus.lastSeenAt
              ? `最近收到：${formatNotificationCaptureTime(notificationStatus.lastSeenAt)}`
              : "尚未收到微信或支付宝通知"}
          />
          <NotificationCheck
            active={Boolean(notificationStatus.quickConfirmEnabled)}
            title="快捷确认"
            detail={notificationStatus.quickConfirmEnabled
              ? "缺少商户时可从系统通知选择候选"
              : "未允许显示快捷确认通知"}
          />
        </div>
        <button className="primary-button full" type="button" onClick={openNotificationSettings}>
          {notificationStatus.enabled ? "重新授权通知使用权" : "立即开启通知使用权"}
        </button>
        <div className="notification-actions">
          <button className="secondary-button" type="button" onClick={syncNotificationBills}>
            检查并同步
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!notificationStatus.enabled || isNotificationTesting}
            onClick={testNotificationPipeline}
          >
            {isNotificationTesting ? "自检中…" : "链路自检"}
          </button>
        </div>
        {notificationStatus.enabled && !notificationStatus.connected && (
          <button className="notification-settings-link" type="button" onClick={openNotificationAppSettings}>
            打开后台与电池设置
          </button>
        )}
        {notificationNotice && <p className="scan-feedback" role="status">{notificationNotice}</p>}
      </section>

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

function BatchImageQueue({ images, activeId, onSelect }) {
  return (
    <div className="batch-image-list">
      {images.map((image, index) => (
        <button
          className={image.id === activeId ? "batch-image-item active" : "batch-image-item"}
          key={image.id}
          type="button"
          onClick={() => onSelect(image.id)}
        >
          {image.dataUrl && <img src={image.dataUrl} alt="" />}
          <span>{image.name || `截图 ${index + 1}`}</span>
          <b>{image.status}</b>
        </button>
      ))}
    </div>
  );
}

function getNotificationStatusLabel(status) {
  if (!status?.enabled) return "权限未开启";
  if (status.connected) return "监听正常";
  return status.recovering ? "监听正在自动恢复" : "权限已开，等待连接";
}

function NotificationCheck({ active, title, detail }) {
  return (
    <div className={`notification-check ${active ? "active" : ""}`}>
      <i aria-hidden="true" />
      <div>
        <b>{title}</b>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function getNotificationStatusDetail(status) {
  if (!status?.enabled) {
    return "需要在安卓系统的“通知使用权”中开启小账本。";
  }
  if (!status.connected) {
    if (status.recovering) {
      return "系统授权仍然有效，已启动分阶段自动重连；恢复后状态会自动更新。";
    }
    return "系统已授权，但监听服务未连接；点击“检查并同步”会自动重连。";
  }
  if (status.lastAcceptedAt) {
    return `监听已连接，最近捕获付款通知：${formatNotificationCaptureTime(status.lastAcceptedAt)}。`;
  }
  if (status.lastSeenAt) {
    return `监听已连接，最近收到平台通知：${formatNotificationCaptureTime(status.lastSeenAt)}。`;
  }
  return "监听已连接，等待微信或支付宝产生新的付款通知。";
}

function getNotificationEmptyMessage(status) {
  if (!status?.connected) {
    return status?.recovering
      ? "监听正在自动恢复，账单队列仍可同步。若长时间未恢复，请把小账本的电池设置改为“不限制”。"
      : "通知权限已开启，但监听服务尚未连接。已尝试重连；请把小账本的电池设置改为“不限制”后再试。";
  }
  if (status.lastReason === "not_payment") {
    return "已经收到微信/支付宝通知，但内容不是明确交易通知，因此没有生成账单。";
  }
  if (status.lastReason === "ad_filtered") {
    return "已识别为优惠、活动或广告通知，本次没有生成账单。";
  }
  if (status.lastReason === "missing_amount") {
    return "通知具有交易内容，但系统没有提供可读取的金额，因此无法自动生成账单。";
  }
  if (status.lastReason === "weak_signal") {
    return "通知提到了支付，但发送者或交易状态不够明确，已为你拦截以防误记。";
  }
  if (status.lastReason === "duplicate") {
    return "这条交易通知是短时间内的重复更新，已自动忽略。";
  }
  if (status.lastReason === "empty_text") {
    return "已经收到平台通知，但系统隐藏了通知正文。请在微信/支付宝与锁屏通知设置中允许显示内容。";
  }
  if (status.lastReason === "quick_confirmed") {
    return "已从系统通知确认商户，打开小账本后会自动入账。";
  }
  if (status.lastReason === "store_failed") {
    return "收到付款通知，但保存到待同步队列时失败，请重新打开小账本后再试。";
  }
  if (status.lastReason === "active_scan_denied") {
    return "系统拒绝读取当前通知，请关闭通知使用权后重新开启。";
  }
  return "监听服务正常，暂时没有新的付款通知。授权后两分钟内仍显示在通知栏的最近一条支付通知会自动补抓。";
}

function formatNotificationCaptureTime(value) {
  const date = new Date(Number(value || 0));
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function BatchCandidateEditor({ candidates, setCandidates, onSave, onCancel }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
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
          const categorySource = item.type === "income" ? incomeCategoryList : expenseCategories;
          return (
            <article className="batch-candidate-item" key={item.id}>
              <div className="batch-candidate-title">
                <span>{item.imageName || `账单 ${index + 1}`}</span>
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
                        category: type === "income" ? incomeCategoryList[0]?.id || "income-other" : expenseCategories[0]?.id || "other"
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
                  <input
                    value={item.merchant}
                    onChange={(event) => updateCandidate(item.id, { merchant: event.target.value, merchantMemory: null })}
                  />
                  <MerchantMemoryHint candidate={item} />
          <MerchantSuggestions candidate={item} onSelect={(suggestion) => updateCandidate(item.id, { merchant: suggestion.name, category: suggestion.category || item.category, merchantMemory: { matched: true, matchType: "user_selected_suggestion", samples: suggestion.samples } })} />
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
                  <span>付款方式</span>
                  <select value={item.method || "其他"} onChange={(event) => updateCandidate(item.id, { method: event.target.value })}>
                    {methods.map((method) => <option key={method} value={method}>{method}</option>)}
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
                <label className="batch-note-field">
                  <span>备注</span>
                  <textarea
                    value={item.note || ""}
                    placeholder="可选"
                    onChange={(event) => updateCandidate(item.id, { note: event.target.value })}
                  />
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
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
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
            category: type === "income"
              ? incomeCategoryList[0]?.id || fallbackCategories.income.id
              : expenseCategories[0]?.id || fallbackCategories.expense.id
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
        <input
          value={candidate.merchant}
          onChange={(event) => setCandidate({ ...candidate, merchant: event.target.value, merchantMemory: null })}
        />
        <MerchantMemoryHint candidate={candidate} />
        <MerchantSuggestions candidate={candidate} onSelect={(suggestion) => setCandidate({ ...candidate, merchant: suggestion.name, category: suggestion.category || candidate.category, merchantMemory: { matched: true, matchType: "user_selected_suggestion", samples: suggestion.samples } })} />
      </Field>
      <Field label="分类">
        <CategoryGrid type={candidate.type} value={candidate.category} onChange={(category) => setCandidate({ ...candidate, category })} />
      </Field>
      <Field label="付款方式">
        <SegmentedControl value={candidate.method || "其他"} options={methods} onChange={(method) => setCandidate({ ...candidate, method })} />
      </Field>
      <div className="two-columns">
        <Field label="日期">
          <input value={candidate.date} onChange={(event) => setCandidate({ ...candidate, date: event.target.value })} type="date" />
        </Field>
        <Field label="时间">
          <input value={candidate.time} onChange={(event) => setCandidate({ ...candidate, time: event.target.value })} type="time" />
        </Field>
      </div>
      <Field label="备注">
        <textarea
          value={candidate.note || ""}
          placeholder="可选"
          onChange={(event) => setCandidate({ ...candidate, note: event.target.value })}
        />
      </Field>
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

function MerchantMemoryHint({ candidate }) {
  const memory = candidate?.merchantMemory;
  if (!memory?.matched) return null;
  const changed = memory.originalMerchant
    && memory.originalMerchant !== candidate.merchant
    && memory.originalMerchant !== "未识别商户";
  return (
    <small className="merchant-memory-hint">
      {changed
        ? `已按历史账单校准：${memory.originalMerchant} → ${candidate.merchant}`
        : `已参考 ${memory.samples} 笔历史账单确认商户与分类`}
    </small>
  );
}

function MerchantSuggestions({ candidate, onSelect }) {
  const suggestions = Array.isArray(candidate?.merchantSuggestions) ? candidate.merchantSuggestions : [];
  if (!suggestions.length) return null;
  return (
    <div className="merchant-suggestions">
      <small>{candidate?.merchantPrediction ? "历史习惯推测，请确认" : "通知未提供商户，历史候选"}</small>
      <div>
        {suggestions.map((suggestion) => (
          <button
            key={`${suggestion.name}-${suggestion.category || "other"}`}
            type="button"
            className={candidate.merchant === suggestion.name ? "selected" : ""}
            onClick={() => onSelect(suggestion)}
          >
            <span>{suggestion.name}</span>
            <b>{suggestion.confidence || 0}%</b>
          </button>
        ))}
      </div>
    </div>
  );
}
function ScreenshotCropPanel({ crop, image, onCropChange }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const cropRef = useRef(normalizeOcrCrop(crop));
  const [imageRatio, setImageRatio] = useState(9 / 16);
  const [draftCrop, setDraftCrop] = useState(() => normalizeOcrCrop(crop));
  const safeCrop = normalizeOcrCrop(draftCrop);

  useEffect(() => {
    if (dragRef.current) return;
    const next = normalizeOcrCrop(crop);
    cropRef.current = next;
    setDraftCrop(next);
  }, [image, crop?.x, crop?.y, crop?.width, crop?.height]);

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
    setDraftCrop(next);
  }

  function endDrag(event) {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    onCropChange(cropRef.current);
  }

  function resetCrop() {
    const next = normalizeOcrCrop(defaultOcrCrop);
    cropRef.current = next;
    setDraftCrop(next);
    onCropChange(next);
  }

  return (
    <section className="ocr-crop-panel">
      <div
        ref={stageRef}
        className="ocr-crop-stage"
        style={{ aspectRatio: imageRatio, maxWidth: imageRatio < 0.72 ? "300px" : "100%" }}
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
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((corner) => (
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
      <button className="secondary-button small crop-reset" type="button" onClick={resetCrop}>重置裁剪</button>
    </section>
  );
}

function ReportScreen({ stats, expenses, allExpenses, budget, selectedMonth, currentMonth, onMonthChange, onEdit, onDelete }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
  const [selectedDay, setSelectedDay] = useState(() => getDefaultReportDay(stats.days, selectedMonth, currentMonth));
  const [analysisTab, setAnalysisTab] = useState("merchant");
  const [incomeAnalysisTab, setIncomeAnalysisTab] = useState("source");
  const dailyStripRef = useRef(null);
  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousExpenses = useMemo(
    () => sortRecordsByDateTime(allExpenses.filter((item) => item.date?.startsWith(previousMonth))),
    [allExpenses, previousMonth]
  );
  const previousStats = useMemo(
    () => getMonthStats(previousExpenses, budget, previousMonth, expenseCategories, incomeCategoryList),
    [previousExpenses, budget, previousMonth, expenseCategories, incomeCategoryList]
  );
  const comparison = getMonthComparison(stats.total, previousStats.total);
  const incomeComparison = compareIncome(stats.incomeTotal, previousStats.incomeTotal);
  const incomeComparisonLabels = getIncomeComparisonLabels(incomeComparison);
  const merchantRanking = useMemo(() => getMerchantRanking(expenses, stats.total), [expenses, stats.total]);
  const paymentMethodTotals = useMemo(() => getPaymentMethodTotals(expenses, stats.total), [expenses, stats.total]);
  const budgetStatus = getBudgetStatus(stats, budget, selectedMonth, currentMonth);
  const selectedDayExpenses = useMemo(
    () => expenses.filter((item) => item.type !== "income" && item.date === selectedDay),
    [expenses, selectedDay]
  );
  const selectedDayTotal = selectedDayExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  useEffect(() => {
    setSelectedDay(getDefaultReportDay(stats.days, selectedMonth, currentMonth));
  }, [selectedMonth, currentMonth]);

  useEffect(() => {
    const strip = dailyStripRef.current;
    const selected = strip?.querySelector(".daily-spend-day.active");
    if (!strip || !selected) return;
    strip.scrollTo({
      left: Math.max(0, selected.offsetLeft + selected.clientWidth - strip.clientWidth),
      behavior: "smooth"
    });
  }, [selectedDay]);

  return (
    <Screen className="report-screen">
      <AppHeader
        eyebrow="月度报告"
        title="收支概览"
        className="report-heading"
        action={<CompactMonthPicker value={selectedMonth} max={currentMonth} onChange={onMonthChange} />}
      />

      <section className="report-overview">
        <div className="report-primary-metric">
          <span>本月支出</span>
          <strong>{money(stats.total)}</strong>
          <em className={comparison.delta > 0 ? "negative" : comparison.delta < 0 ? "positive" : ""}>
            较上月 {comparison.amountLabel}
          </em>
        </div>
        <div className="report-secondary-metrics">
          <div>
            <span>收入</span>
            <strong>{money(stats.incomeTotal)}</strong>
          </div>
          <div>
            <span>结余</span>
            <strong className={stats.balance < 0 ? "negative" : "positive"}>{money(stats.balance)}</strong>
          </div>
        </div>
        <div className={`report-budget ${budgetStatus.tone}`}>
          <div>
            <span>{budgetStatus.title}</span>
            <b>{Math.round(stats.usedRate)}%</b>
          </div>
          <div className="report-budget-track"><i style={{ width: `${Math.min(stats.usedRate, 100)}%` }} /></div>
          <p>{budgetStatus.detail}</p>
          <small>预算 {money(budget)} · {budgetStatus.meta}</small>
        </div>
      </section>

      <section className="report-section report-trend-section">
        <SectionTitle title="消费趋势" aside="本月 / 上月" />
        <div className="trend-legend">
          <span><i className="current" />本月</span>
          <span><i className="previous" />上月</span>
        </div>
        <TrendChart
          days={stats.days}
          previousDays={previousStats.days}
          selectedDay={selectedDay}
          onDaySelect={setSelectedDay}
        />
      </section>

      <section className="report-section daily-spend-panel">
        <SectionTitle title="每日消费" aside={formatDailyLabel(selectedDay)} />
        <div className="daily-spend-strip" ref={dailyStripRef}>
          {stats.days.map((day) => (
            <button
              type="button"
              className={day.date === selectedDay ? "daily-spend-day active" : "daily-spend-day"}
              key={day.date}
              onClick={() => setSelectedDay(day.date)}
              aria-pressed={day.date === selectedDay}
            >
              <span>{Number(day.date.slice(-2))}</span>
              <small>{formatWeekdayShort(day.date)}</small>
              <strong>{money(day.total)}</strong>
            </button>
          ))}
        </div>
        <div className="daily-spend-summary">
          <div>
            <span>当天支出</span>
            <strong>{money(selectedDayTotal)}</strong>
          </div>
          <b>{selectedDayExpenses.length} 笔</b>
        </div>
        <DailyExpenseList items={selectedDayExpenses} />
      </section>

      <section className="report-section report-analysis">
        <SectionTitle title="消费分析" aside={`${expenses.filter((item) => item.type !== "income").length} 笔支出`} />
        <div className="report-tabs" role="tablist" aria-label="消费分析类型">
          {[
            ["merchant", "商户"],
            ["method", "付款方式"],
            ["category", "分类"]
          ].map(([id, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={analysisTab === id}
              className={analysisTab === id ? "active" : ""}
              key={id}
              onClick={() => setAnalysisTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {analysisTab === "merchant" && (merchantRanking.length === 0 ? (
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
        ))}

        {analysisTab === "method" && (paymentMethodTotals.length === 0 ? (
          <EmptyLine text="本月还没有付款记录" />
        ) : (
          <div className="payment-method-list">
            {paymentMethodTotals.map((item) => (
              <div className="payment-method-row" key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.count} 笔 · {Math.round(item.percent)}%</span>
                </div>
                <b>{money(item.total)}</b>
                <div className="payment-method-track"><i style={{ width: `${item.percent}%` }} /></div>
              </div>
            ))}
          </div>
        ))}

        {analysisTab === "category" && (stats.categoryTotals.length === 0 ? (
          <EmptyLine text="本月还没有分类消费记录" />
        ) : (
          <div className="category-report">
            <div className="donut" style={{ background: buildConic(stats.categoryTotals) }}>
              <span><b>{stats.categoryTotals.length}</b><small>个分类</small></span>
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
        ))}
      </section>

      <section className="report-section report-analysis income-analysis">
        <SectionTitle title="收入总结" aside={`${stats.incomeCount} 笔收入`} />
        <div className="income-summary-grid">
          <div className="income-summary-primary">
            <span>本月收入</span>
            <strong>{money(stats.incomeTotal)}</strong>
            <em className={incomeComparisonLabels.tone}>{incomeComparisonLabels.rateLabel}</em>
          </div>
          <div>
            <span>平均每笔</span>
            <strong>{money(stats.incomeAverage)}</strong>
          </div>
          <div>
            <span>最大单笔</span>
            <strong>{stats.maxIncome ? money(stats.maxIncome.amount) : "¥0"}</strong>
            <small>{stats.maxIncome?.merchant || "暂无收入"}</small>
          </div>
          <div>
            <span>收入变化</span>
            <strong className={incomeComparisonLabels.tone}>{incomeComparisonLabels.amountLabel}</strong>
          </div>
        </div>

        <div className="report-tabs two-tabs" role="tablist" aria-label="收入总结类型">
          {[["source", "收入来源"], ["category", "收入分类"]].map(([id, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={incomeAnalysisTab === id}
              className={incomeAnalysisTab === id ? "active" : ""}
              key={id}
              onClick={() => setIncomeAnalysisTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {incomeAnalysisTab === "source" && (stats.incomeSourceRanking.length === 0 ? (
          <EmptyLine text="本月还没有收入记录" />
        ) : (
          <div className="merchant-ranking income-ranking">
            {stats.incomeSourceRanking.slice(0, 5).map((source, index) => (
              <div className="merchant-rank-item" key={source.name}>
                <b className="merchant-rank-number">{index + 1}</b>
                <div>
                  <strong>{source.name}</strong>
                  <span>{source.count} 笔 · 平均 {money(source.average)}</span>
                  <div><i style={{ width: `${source.percent}%` }} /></div>
                </div>
                <b>{money(source.total)}</b>
              </div>
            ))}
          </div>
        ))}

        {incomeAnalysisTab === "category" && (stats.incomeCategoryTotals.length === 0 ? (
          <EmptyLine text="本月还没有分类收入记录" />
        ) : (
          <div className="category-report income-category-report">
            <div className="donut" style={{ background: buildConic(stats.incomeCategoryTotals) }}>
              <span><b>{stats.incomeCategoryTotals.length}</b><small>个分类</small></span>
            </div>
            <div className="bar-list">
              {stats.incomeCategoryTotals.map((item) => (
                <div className="bar-row" key={item.id}>
                  <span>{item.name}</span>
                  <div><i style={{ width: `${item.percent}%`, background: item.color }} /></div>
                  <b>{money(item.total)}</b>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="report-section">
        <SectionTitle title="收支洞察" aside={comparison.rateLabel} />
        <div className="report-insights">
        <Insight text={stats.topCategory ? `${stats.topCategory.name} 是本月最高支出分类` : "本月还没有支出记录"} />
        <Insight text={stats.maxExpense ? `最大单笔是 ${stats.maxExpense.merchant}` : "开始记第一笔后生成洞察"} />
        <Insight text={stats.incomeTotal
          ? `${stats.topIncomeCategory?.name || "收入"}贡献最高，本月收入 ${money(stats.incomeTotal)}，结余 ${money(stats.balance)}`
          : "收入记录会显示在结余里"} />
        </div>
      </section>

      <SectionTitle title="月度账单" aside={`${expenses.length} 笔`} />
      <GroupedExpenseList items={expenses} onEdit={onEdit} onDelete={onDelete} />
    </Screen>
  );
}

function ProfileScreen({ settings, setSettings, setExpenses, setPending }) {
  const [coverDraft, setCoverDraft] = useState(null);
  const [coverCrop, setCoverCrop] = useState({ x: 50, y: 50, zoom: 1 });
  const [categoryEditor, setCategoryEditor] = useState(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const [iconSearch, setIconSearch] = useState("");
  const [iconGroup, setIconGroup] = useState("all");
  const [draggingCategoryId, setDraggingCategoryId] = useState("");
  const categoryDragRef = useRef({ id: "", type: "expense" });
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
  const visibleCategoryIcons = useMemo(() => searchCategoryIcons(iconSearch, iconGroup), [iconSearch, iconGroup]);
  const categoryEditorDialogRef = useDialogFocus({
    isOpen: Boolean(categoryEditor),
    onClose: () => setCategoryEditor(null)
  });
  const categoryDeleteDialogRef = useDialogFocus({
    isOpen: Boolean(categoryDeleteTarget),
    onClose: () => setCategoryDeleteTarget(null)
  });

  useEffect(() => {
    if (!categoryEditor) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [Boolean(categoryEditor)]);

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

  function openCategoryEditor(category, type = "expense") {
    setIconSearch("");
    setIconGroup("all");
    setCategoryEditor({
      id: category?.id || "",
      name: category?.name || "",
      icon: category?.icon || "tag",
      color: category?.color || "#6f927d",
      keywordsText: (category?.keywords || []).join("、"),
      custom: Boolean(category?.custom),
      isNew: !category,
      type
    });
  }

  function saveCategoryEditor() {
    if (!categoryEditor) return;
    const name = categoryEditor.name.trim().slice(0, 12);
    if (!name) return;
    const keywords = parseCategoryKeywords(categoryEditor.keywordsText);
    const isIncome = categoryEditor.type === "income";
    const categorySource = isIncome ? incomeCategoryList : expenseCategories;
    const duplicate = categorySource.some((category) => category.name === name && category.id !== categoryEditor.id);
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
        ...(isIncome
          ? {
              customIncomeCategories: [...(current.customIncomeCategories || []), nextCategory],
              incomeCategoryOrder: [...incomeCategoryList.map((category) => category.id), nextCategory.id]
            }
          : {
              customExpenseCategories: [...(current.customExpenseCategories || []), nextCategory],
              categoryOrder: [...expenseCategories.map((category) => category.id), nextCategory.id]
            })
      }));
    } else if (categoryEditor.custom) {
      setSettings((current) => ({
        ...current,
        ...(isIncome
          ? {
              customIncomeCategories: (current.customIncomeCategories || []).map((category) =>
                category.id === categoryEditor.id
                  ? { ...category, name, icon: categoryEditor.icon, color: categoryEditor.color, keywords, custom: true }
                  : category
              )
            }
          : {
              customExpenseCategories: (current.customExpenseCategories || []).map((category) =>
                category.id === categoryEditor.id
                  ? { ...category, name, icon: categoryEditor.icon, color: categoryEditor.color, keywords, custom: true }
                  : category
              )
            })
      }));
    } else {
      setSettings((current) => ({
        ...current,
        ...(isIncome
          ? {
              incomeCategoryOverrides: {
                ...(current.incomeCategoryOverrides || {}),
                [categoryEditor.id]: {
                  name,
                  icon: categoryEditor.icon,
                  color: categoryEditor.color,
                  keywords
                }
              }
            }
          : {
              categoryOverrides: {
                ...(current.categoryOverrides || {}),
                [categoryEditor.id]: {
                  name,
                  icon: categoryEditor.icon,
                  color: categoryEditor.color,
                  keywords
                }
              }
            })
      }));
    }
    setCategoryEditor(null);
  }

  function removeCustomCategory(category, type = "expense") {
    // window.confirm is unreliable in some Android WebViews; use the in-app modal.
    setCategoryDeleteTarget({ category, type });
  }

  function confirmRemoveCustomCategory() {
    if (!categoryDeleteTarget) return;
    const { category, type } = categoryDeleteTarget;
    const isIncome = type === "income";
    setSettings((current) => ({
      ...current,
      ...(isIncome
        ? {
            customIncomeCategories: (current.customIncomeCategories || []).filter((item) => item.id !== category.id),
            incomeCategoryOrder: (current.incomeCategoryOrder || []).filter((id) => id !== category.id)
          }
        : {
            customExpenseCategories: (current.customExpenseCategories || []).filter((item) => item.id !== category.id),
            categoryOrder: (current.categoryOrder || []).filter((id) => id !== category.id)
          })
    }));
    const fallback = isIncome ? "income-other" : "other";
    setExpenses((items) => items.map((item) => item.category === category.id ? { ...item, category: fallback } : item));
    setPending((items) => items.map((item) => item.category === category.id ? { ...item, category: fallback } : item));
    if (categoryEditor?.id === category.id) setCategoryEditor(null);
    setCategoryDeleteTarget(null);
  }

  function moveCategory(sourceId, targetId, type = "expense") {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceCategories = type === "income" ? incomeCategoryList : expenseCategories;
    const order = sourceCategories.map((category) => category.id);
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, sourceId);
    setSettings((current) => ({
      ...current,
      [type === "income" ? "incomeCategoryOrder" : "categoryOrder"]: order
    }));
  }

  function startCategoryPointerDrag(event, categoryId, type = "expense") {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    categoryDragRef.current = { id: categoryId, type };
    setDraggingCategoryId(categoryId);
  }

  function moveCategoryPointerDrag(event) {
    const sourceId = categoryDragRef.current.id;
    if (!sourceId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-category-id]");
    const targetId = target?.dataset?.categoryId;
    if (targetId && targetId !== sourceId) moveCategory(sourceId, targetId, categoryDragRef.current.type);
  }

  function endCategoryPointerDrag() {
    categoryDragRef.current = { id: "", type: "expense" };
    setDraggingCategoryId("");
  }

  function startCategoryHtmlDrag(event, categoryId, type = "expense") {
    categoryDragRef.current = { id: categoryId, type };
    setDraggingCategoryId(categoryId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", categoryId);
  }

  function dragCategoryOver(event, targetId, type = "expense") {
    event.preventDefault();
    moveCategory(categoryDragRef.current.id, targetId, type);
  }

  return (
    <>
      <Screen>
        <AppHeader eyebrow="自定义封面" title="我的账本" />

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
              aria-pressed={settings.coverPresetId === preset.id && !settings.coverImage}
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
                  <button className="row-icon" type="button" aria-label={`删除${category.name}`} onClick={() => removeCustomCategory(category, "expense")}>
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
            <div
              className="category-editor-backdrop"
              ref={categoryEditorDialogRef}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              aria-label={categoryEditor.isNew
                ? `添加${categoryEditor.type === "income" ? "收入" : "消费"}分类`
                : `编辑${categoryEditor.name}`}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setCategoryEditor(null);
              }}
            >
            <section className="category-editor">
              <div className="category-editor-heading">
                <div>
                  <span>{categoryEditor.isNew
                    ? `新${categoryEditor.type === "income" ? "收入" : "消费"}分类`
                    : categoryEditor.custom ? "编辑自定义分类" : "编辑内置分类"}</span>
                  <h3>{categoryEditor.isNew ? "设计分类" : categoryEditor.name}</h3>
                </div>
                <button className="ghost-button" type="button" aria-label="关闭分类编辑" onClick={() => setCategoryEditor(null)}>×</button>
              </div>

              <Field label="分类名称">
                <input
                  value={categoryEditor.name}
                  maxLength="12"
                  placeholder="例如：宠物"
                  onChange={(event) => setCategoryEditor({ ...categoryEditor, name: event.target.value })}
                />
              </Field>

              <div className="category-icon-library">
                <div className="category-icon-library-heading">
                  <span>分类图标</span>
                  <b style={{ color: categoryEditor.color }}>
                    <CategoryIcon name={categoryEditor.icon} size={20} />
                  </b>
                </div>
                <label className="icon-search-box">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    value={iconSearch}
                    placeholder="搜索图标，例如：咖啡、宠物、地铁"
                    onChange={(event) => setIconSearch(event.target.value)}
                  />
                </label>
                <div className="icon-group-tabs" role="tablist" aria-label="图标分组">
                  {categoryIconGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      role="tab"
                      aria-selected={iconGroup === group.id}
                      className={iconGroup === group.id ? "selected" : ""}
                      onClick={() => setIconGroup(group.id)}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
                <div className="icon-picker-grid">
                  {visibleCategoryIcons.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      className={categoryEditor.icon === icon.id ? "selected" : ""}
                      title={icon.name}
                      aria-label={`选择${icon.name}图标`}
                      onClick={() => setCategoryEditor({ ...categoryEditor, icon: icon.id })}
                    >
                      <CategoryIcon name={icon.id} size={20} />
                      <span>{icon.name}</span>
                    </button>
                  ))}
                  {!visibleCategoryIcons.length && <p className="icon-empty">没有匹配的图标</p>}
                </div>
              </div>

              <div className="category-color-section">
                <span>分类颜色</span>
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
            </section>
            </div>
          )}
        </section>

        <SectionTitle title="收入分类" aside="拖动排序" />
        <section className="settings-panel category-manager">
          <div
            className="category-sort-list"
            onPointerMove={moveCategoryPointerDrag}
            onPointerUp={endCategoryPointerDrag}
            onPointerCancel={endCategoryPointerDrag}
          >
            {incomeCategoryList.map((category) => (
              <div
                className={draggingCategoryId === category.id ? "category-sort-row dragging" : "category-sort-row"}
                data-category-id={category.id}
                draggable
                key={category.id}
                onDragStart={(event) => startCategoryHtmlDrag(event, category.id, "income")}
                onDragOver={(event) => dragCategoryOver(event, category.id, "income")}
                onDragEnd={endCategoryPointerDrag}
              >
                <button
                  className="category-grip"
                  type="button"
                  aria-label={`拖动${category.name}`}
                  onPointerDown={(event) => startCategoryPointerDrag(event, category.id, "income")}
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
                <button className="row-icon" type="button" aria-label={`编辑${category.name}`} onClick={() => openCategoryEditor(category, "income")}>
                  <EditIcon />
                </button>
                {category.custom && (
                  <button className="row-icon" type="button" aria-label={`删除${category.name}`} onClick={() => removeCustomCategory(category, "income")}>
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button className="secondary-button full" type="button" onClick={() => openCategoryEditor(null, "income")}>
            <PlusIcon /> 添加收入分类
          </button>
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

      {categoryDeleteTarget && (
        <div
          className="confirm-backdrop"
          ref={categoryDeleteDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="确认删除分类"
          tabIndex={-1}
        >
          <section className="confirm-modal">
            <div>
              <span>删除分类</span>
              <h3>删除“{categoryDeleteTarget.category.name}”吗？</h3>
              <p>已有账单会归入“其他”。</p>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setCategoryDeleteTarget(null)}>取消</button>
              <button className="danger-button" type="button" onClick={confirmRemoveCustomCategory}>删除</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function CoverCropModal({ crop, draft, onApply, onCancel, onCropChange }) {
  const dialogRef = useDialogFocus({ onClose: onCancel });
  const updateCrop = (key, value) => {
    onCropChange({ ...crop, [key]: Number(value) });
  };

  return (
    <div
      className="crop-backdrop"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="封面裁剪"
      tabIndex={-1}
    >
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
      <div className="pending-quick-edit">
        <label>
          <span>金额</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={local.amount}
            onChange={(event) => setLocal({ ...local, amount: event.target.value })}
          />
        </label>
        <label>
          <span>商户</span>
          <input
            value={local.merchant}
            onChange={(event) => setLocal({ ...local, merchant: event.target.value, merchantMemory: null })}
          />
          <MerchantMemoryHint candidate={local} />
          <MerchantSuggestions candidate={local} onSelect={(suggestion) => setLocal({ ...local, merchant: suggestion.name, category: suggestion.category || local.category, merchantMemory: { matched: true, matchType: "user_selected_suggestion", samples: suggestion.samples } })} />
        </label>
      </div>
      <CategoryGrid compact type={local.type} value={local.category} onChange={(category) => setLocal({ ...local, category })} />
      <div className="pending-actions">
        <button type="button" className="ghost-button" aria-label={`删除待确认记录 ${local.merchant}`} onClick={() => onDelete(item)}>
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
  const incomeCategoryList = useContext(IncomeCategoriesContext);
  if (!items.length) return <EmptyLine text="还没有记录" />;

  return (
    <div className="expense-list">
      {items.map((item) => {
        const category = getCategory(item.category, item.type, expenseCategories, incomeCategoryList);
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
            <button type="button" className="row-icon" aria-label={`编辑记录 ${item.merchant}`} onClick={() => onEdit(item)}>
              <EditIcon />
            </button>
            <button type="button" className="row-icon" aria-label={`删除记录 ${item.merchant}`} onClick={() => onDelete(item)}>
              <TrashIcon />
            </button>
          </article>
        );
      })}
    </div>
  );
}

function DailyExpenseList({ items }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
  if (!items.length) return <EmptyLine text="当天没有消费记录" />;

  return (
    <div className="daily-expense-list">
      {items.map((item) => {
        const category = getCategory(item.category, item.type, expenseCategories, incomeCategoryList);
        return (
          <div className="daily-expense-row" key={item.id}>
            <span className="expense-category-icon" style={{ color: category.color }}>
              <CategoryIcon name={category.icon} size={18} />
            </span>
            <div>
              <strong>{item.merchant}</strong>
              <span>{item.time || "--:--"} · {category.name} · {item.method || "其他"}</span>
              {item.note && <em className="expense-note">{item.note}</em>}
            </div>
            <b>-{money(item.amount)}</b>
          </div>
        );
      })}
    </div>
  );
}

function GroupedExpenseList({ items, onEdit, onDelete }) {
  const expenseCategories = useContext(ExpenseCategoriesContext);
  const incomeCategoryList = useContext(IncomeCategoriesContext);
  const groups = useMemo(() => {
    const grouped = new Map();
    items.forEach((item) => {
      const date = item.date || "未填写日期";
      const current = grouped.get(date) || [];
      current.push(item);
      grouped.set(date, current);
    });
    return Array.from(grouped.entries());
  }, [items]);

  if (!groups.length) return <EmptyLine text="还没有记录" />;

  return (
    <div className="grouped-expense-list">
      {groups.map(([date, dayItems]) => {
        const expenseTotal = dayItems
          .filter((item) => item.type !== "income")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        return (
          <section className="bill-day-group" key={date}>
            <header>
              <strong>{formatBillDayLabel(date)}</strong>
              <span>支出 {money(expenseTotal)}</span>
            </header>
            <div>
              {dayItems.map((item) => {
                const category = getCategory(item.category, item.type, expenseCategories, incomeCategoryList);
                return (
                  <article className={item.type === "income" ? "grouped-expense-row income-row" : "grouped-expense-row"} key={item.id}>
                    <span className="expense-category-icon" style={{ color: category.color }}>
                      <CategoryIcon name={category.icon} size={19} />
                    </span>
                    <div>
                      <strong>{item.merchant}</strong>
                      <span>{item.time || "--:--"} · {category.name} · {item.method || "其他"}</span>
                      {item.note && <em className="expense-note">{item.note}</em>}
                    </div>
                    <b>{signedMoney(item.amount, item.type)}</b>
                    <button type="button" className="row-icon" aria-label={`编辑 ${item.merchant}`} onClick={() => onEdit(item)}>
                      <EditIcon />
                    </button>
                    <button type="button" className="row-icon" aria-label={`删除 ${item.merchant}`} onClick={() => onDelete(item)}>
                      <TrashIcon />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
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
            aria-current={activeTab === item.id ? "page" : undefined}
            data-testid={`nav-${item.id}`}
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
  const dialogRef = useDialogFocus({ onClose: onCancel });

  return (
    <div
      className="confirm-backdrop"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="确认删除"
      tabIndex={-1}
    >
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

function SectionTitle({ title, aside, headingLevel = 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="section-title">
      <Heading>{title}</Heading>
      <span>{aside}</span>
    </div>
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

function CompactMonthPicker({ value, max, onChange }) {
  return (
    <div className="compact-month-picker">
      <button type="button" onClick={() => onChange(shiftMonth(value, -1))} aria-label="上个月">‹</button>
      <label>
        <span>{formatMonthLabel(value)}</span>
        <input type="month" value={value} max={max} onChange={(event) => onChange(event.target.value || max)} />
      </label>
      <button type="button" onClick={() => onChange(shiftMonth(value, 1))} disabled={value >= max} aria-label="下个月">›</button>
    </div>
  );
}

function TrendChart({ days, previousDays = [], selectedDay = "", onDaySelect }) {
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
    <svg className="trend-chart" viewBox="0 0 280 128" role="group" aria-label="本月与上月消费趋势，使用左右方向键选择日期">
      <path d="M14 106H266" />
      <path d="M14 28H266" className="grid-line" />
      {previousPoints && <polyline points={previousPoints} className="previous-line" />}
      {points && <polyline points={points} className="current-line" />}
      {days.map((day, index) => {
        const x = 14 + (index / Math.max(visibleLength - 1, 1)) * 252;
        const y = 104 - (day.total / max) * 78;
        const selected = day.date === selectedDay;
        const showPoint = day.total > 0 || selected;
        return (
          <g
            className={selected ? "trend-day selected" : "trend-day"}
            key={day.date}
            role="button"
            tabIndex={selected ? 0 : -1}
            aria-label={`${formatDailyLabel(day.date)}，支出 ${money(day.total)}`}
            aria-pressed={selected}
            onClick={() => onDaySelect?.(day.date)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onDaySelect?.(day.date);
                return;
              }
              const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!direction && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? days.length - 1
                  : clamp(index + direction, 0, days.length - 1);
              onDaySelect?.(days[nextIndex]?.date);
              const controls = event.currentTarget.parentElement?.querySelectorAll(".trend-day");
              window.requestAnimationFrame(() => controls?.[nextIndex]?.focus());
            }}
          >
            <circle className="trend-hit-area" cx={x} cy={y} r="8" />
            {showPoint && <circle className="trend-point" cx={x} cy={y} r={selected ? "4" : "2.8"} />}
          </g>
        );
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

function getMonthStats(
  expenses,
  budget,
  month = today().slice(0, 7),
  expenseCategories = categories,
  incomeCategoryList = incomeCategories
) {
  // Older records did not have a type; they are historical expense records.
  const expenseItems = expenses.filter((item) => !item.type || item.type === "expense");
  const incomeSummary = buildIncomeSummary(expenses, incomeCategoryList);
  const total = expenseItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const incomeTotal = incomeSummary.total;
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
    incomeCount: incomeSummary.count,
    incomeAverage: incomeSummary.average,
    incomeCategoryTotals: incomeSummary.categoryTotals,
    topIncomeCategory: incomeSummary.topCategory,
    incomeSourceRanking: incomeSummary.sourceRanking,
    balance: incomeTotal - total,
    budget,
    todayTotal,
    usedRate: budget ? (total / budget) * 100 : 0,
    dailyAverage: days.length ? total / days.length : 0,
    categoryTotals,
    topCategory,
    maxExpense: expenseItems.slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0],
    maxIncome: incomeSummary.max,
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

function getIncomeComparisonLabels(comparison) {
  if (comparison.previous <= 0) {
    return comparison.current > 0
      ? { amountLabel: "上月无收入", rateLabel: "本月新增收入", tone: "positive" }
      : { amountLabel: "暂无变化", rateLabel: "本月暂无收入", tone: "" };
  }
  if (comparison.delta > 0) {
    return {
      amountLabel: `多收入 ${money(comparison.delta)}`,
      rateLabel: `较上月增加 ${Math.abs(Math.round(comparison.rate || 0))}%`,
      tone: "positive"
    };
  }
  if (comparison.delta < 0) {
    return {
      amountLabel: `少收入 ${money(Math.abs(comparison.delta))}`,
      rateLabel: `较上月减少 ${Math.abs(Math.round(comparison.rate || 0))}%`,
      tone: "negative"
    };
  }
  return { amountLabel: "与上月持平", rateLabel: "收入保持稳定", tone: "" };
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

function getPaymentMethodTotals(records, monthTotal) {
  const grouped = new Map();
  records
    .filter((item) => item.type !== "income")
    .forEach((item) => {
      const name = String(item.method || "其他").trim() || "其他";
      const current = grouped.get(name) || { name, total: 0, count: 0 };
      current.total += Number(item.amount || 0);
      current.count += 1;
      grouped.set(name, current);
    });

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      percent: monthTotal ? Math.min(100, (item.total / monthTotal) * 100) : 0,
      order: methods.indexOf(item.name)
    }))
    .sort((a, b) => b.total - a.total || (a.order < 0 ? methods.length : a.order) - (b.order < 0 ? methods.length : b.order));
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

function formatDailyLabel(value) {
  if (!value) return "请选择日期";
  const [year, month, day] = value.split("-").map(Number);
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const date = new Date(year, month - 1, day);
  return `${month} 月 ${day} 日 ${weekday[date.getDay()]}`;
}

function formatWeekdayShort(value) {
  const [year, month, day] = String(value || today()).split("-").map(Number);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(year, month - 1, day).getDay()];
}

function formatBillDayLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const [, month, day] = value.split("-");
  return `${Number(month)} 月 ${Number(day)} 日 · ${formatWeekdayShort(value)}`;
}

function getDefaultReportDay(days, selectedMonth, currentMonth) {
  if (selectedMonth === currentMonth) return today();
  const spendingDays = (days || []).filter((day) => day.total > 0);
  return spendingDays.at(-1)?.date || days?.at(-1)?.date || `${selectedMonth}-01`;
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
