import { Palette, ReceiptText, ScanLine, Sparkles } from "lucide-react";

const pageMuseCopy = {
  add: {
    icon: ReceiptText,
    title: "把今天写进账页",
    description: "执笔形态陪你把金额与分类记清",
    art: "/assets/neko-u-entry-clerk-v1.webp"
  },
  scan: {
    icon: ScanLine,
    title: "截图交给猫娘整理",
    description: "侦探形态识别后仍会进入待确认",
    art: "/assets/neko-u-scan-detective-v1.webp"
  }
};

export function NekoPageMuse({ variant }) {
  const content = pageMuseCopy[variant];
  const Icon = content.icon;

  return (
    <section className={`neko-page-muse ${variant}`} aria-label={content.title}>
      <img className="neko-page-muse-u" src={content.art} alt="" draggable="false" aria-hidden="true" />
      <div className="neko-page-muse-copy">
        <span aria-hidden="true"><Icon /></span>
        <div>
          <strong>{content.title}</strong>
          <p>{content.description}</p>
        </div>
      </div>
      <Sparkles className="neko-page-muse-sparkle" aria-hidden="true" />
    </section>
  );
}

export function NekoAmountAssistant() {
  return (
    <span className="neko-amount-assistant" aria-hidden="true">
      <img src="/assets/neko-u-entry-clerk-cutout-v2.png" alt="" draggable="false" />
    </span>
  );
}

export function NekoReportArtwork() {
  return (
    <div className="neko-report-artwork" aria-hidden="true">
      <img className="u-form" src="/assets/neko-u-report-analyst-v1.webp" alt="" draggable="false" />
    </div>
  );
}

export function NekoThemeAssistant() {
  return (
    <div className="neko-theme-assistant">
      <span className="neko-theme-assistant-art" aria-hidden="true">
        <img src="/assets/neko-u-theme-curator-v1.webp" alt="" draggable="false" />
      </span>
      <div>
        <span><Palette aria-hidden="true" />账本装扮</span>
        <strong>装扮形态负责封面、服装与主题配色</strong>
      </div>
    </div>
  );
}
