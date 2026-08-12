import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Fish,
  PawPrint,
  PiggyBank,
  Plus,
  ReceiptText,
  ScanLine,
  Sparkles,
  Tags,
  WalletCards
} from "lucide-react";

const PAW_STEPS = 5;

function NekoStat({ icon: Icon, label, value, tone, children, valueClass = "" }) {
  return (
    <div className={`chibi-stat ${tone}`}>
      <span className="chibi-sticker-icon" aria-hidden="true"><Icon /></span>
      <small>{label}</small>
      <strong className={valueClass}>{value}</strong>
      {children}
    </div>
  );
}

export function NekoHomeHero({ summary, coverStyle }) {
  const safeRate = Math.min(Math.max(summary.usedRate || 0, 0), 100);
  const activePaws = Math.ceil(safeRate / (100 / PAW_STEPS));

  return (
    <section className="chibi-ledger" role="region" aria-label="月度账本概览">
      <div className="chibi-cover-texture" style={coverStyle} aria-hidden="true" />
      <div className="chibi-ledger-main">
        <div className="chibi-total-block">
          <span className="chibi-period"><CalendarDays aria-hidden="true" />{summary.periodLabel}</span>
          <span className="chibi-total-label">{summary.totalLabel}</span>
          <strong className={summary.amountLengthClass}>{summary.formattedTotal}</strong>
          <span className="chibi-daily-line">{summary.dailyLabel} {summary.dailyValue}</span>
        </div>

        <Sparkles className="chibi-sparkle one" aria-hidden="true" />
        <PawPrint className="chibi-sparkle two" aria-hidden="true" />
      </div>

      <div className="chibi-stat-grid">
        <NekoStat icon={PiggyBank} label="预算" value={summary.budget} tone="violet">
          <div
            className="chibi-paw-progress"
            role="progressbar"
            aria-label="本月预算使用比例"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(safeRate)}
          >
            <span aria-hidden="true">
              {Array.from({ length: PAW_STEPS }, (_, index) => (
                <PawPrint className={index < activePaws ? "active" : ""} key={index} />
              ))}
            </span>
            <b>{Math.round(summary.usedRate)}%</b>
          </div>
        </NekoStat>
        <NekoStat icon={Fish} label="收入" value={summary.income} tone="mint" />
        <NekoStat
          icon={WalletCards}
          label="结余"
          value={summary.balance}
          tone={summary.balanceNegative ? "coral" : "gold"}
          valueClass={summary.balanceNegative ? "negative" : "positive"}
        />
      </div>
    </section>
  );
}

export function NekoQuickActions({ onAdd, onScan }) {
  return (
    <div className="chibi-action-grid">
      <button className="chibi-action primary" type="button" onClick={onAdd}>
        <span className="chibi-action-copy">
          <span className="chibi-action-kicker"><Plus aria-hidden="true" />执笔形态</span>
          <strong>记一笔</strong>
          <small>支出与收入</small>
        </span>
        <img
          className="chibi-action-character"
          src="/assets/neko-u-entry-clerk-v1.webp"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <PawPrint className="chibi-action-paw" aria-hidden="true" />
      </button>
      <button className="chibi-action scan" type="button" onClick={onScan}>
        <span className="chibi-action-copy">
          <span className="chibi-action-kicker"><ScanLine aria-hidden="true" />侦探形态</span>
          <strong>识别账单</strong>
          <small>截图与通知</small>
        </span>
        <img
          className="chibi-action-character"
          src="/assets/neko-u-scan-detective-v1.webp"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <ReceiptText className="chibi-action-paw" aria-hidden="true" />
      </button>
    </div>
  );
}

export function NekoShortcutRail({ onTab }) {
  const shortcuts = [
    { icon: Tags, label: "分类", tone: "rose", tab: "profile" },
    { icon: PiggyBank, label: "预算", tone: "gold", tab: "profile" },
    { icon: ChartNoAxesCombined, label: "月报", tone: "mint", tab: "report" },
    { icon: PawPrint, label: "装扮", tone: "violet", tab: "profile" }
  ];

  return (
    <nav className="chibi-shortcut-rail" aria-label="常用功能">
      {shortcuts.map(({ icon: Icon, label, tone, tab }) => (
        <button type="button" key={label} onClick={() => onTab(tab)}>
          <span className={`chibi-shortcut-icon ${tone}`} aria-hidden="true"><Icon /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function NekoSectionHeading({ type, title, aside }) {
  const Icon = type === "pending" ? Bell : ReceiptText;
  return (
    <div className={`chibi-section-heading ${type}`}>
      <span className="chibi-section-icon" aria-hidden="true"><Icon /></span>
      <h2>{title}</h2>
      <span>{aside}</span>
    </div>
  );
}

export function NekoEmptyState() {
  return (
    <div className="chibi-empty-state">
      <span className="chibi-empty-cat" aria-hidden="true">
        <img src="/assets/neko-u-empty-rest-v1.webp" alt="" draggable="false" />
      </span>
      <div>
        <strong>账目都整理好啦</strong>
        <p>没有待确认账单</p>
      </div>
      <PawPrint className="chibi-empty-paw" aria-hidden="true" />
    </div>
  );
}
