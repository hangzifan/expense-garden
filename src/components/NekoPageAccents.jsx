import { Palette, ReceiptText, ScanLine, Sparkles } from "lucide-react";

const pageMuseCopy = {
  add: {
    icon: ReceiptText,
    title: "把今天写进账页",
    description: "金额先记清，分类和备注慢慢补齐"
  },
  scan: {
    icon: ScanLine,
    title: "截图交给猫娘整理",
    description: "识别后仍会进入待确认，不会直接入账"
  }
};

export function NekoPageMuse({ variant }) {
  const content = pageMuseCopy[variant];
  const Icon = content.icon;

  return (
    <section className={`neko-page-muse ${variant}`} aria-label={content.title}>
      <img
        className="neko-page-muse-adult"
        src="/assets/neko-ledger-hero-v1.png"
        alt=""
        draggable="false"
        aria-hidden="true"
      />
      {variant === "scan" && (
        <img
          className="neko-page-muse-chibi"
          src="/assets/neko-bookkeeper-chibi-v1.png"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
      )}
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
      <img src="/assets/neko-bookkeeper-chibi-v1.png" alt="" draggable="false" />
      <span>金额确认后再保存喵</span>
    </span>
  );
}

export function NekoReportArtwork() {
  return (
    <div className="neko-report-artwork" aria-hidden="true">
      <img className="adult" src="/assets/neko-ledger-hero-v1.png" alt="" draggable="false" />
      <img className="chibi" src="/assets/neko-bookkeeper-chibi-v1.png" alt="" draggable="false" />
    </div>
  );
}

export function NekoThemeAssistant() {
  return (
    <div className="neko-theme-assistant">
      <span className="neko-theme-assistant-art" aria-hidden="true">
        <img src="/assets/neko-bookkeeper-chibi-v1.png" alt="" draggable="false" />
      </span>
      <div>
        <span><Palette aria-hidden="true" />账本装扮</span>
        <strong>原版猫娘负责封面，Q版陪你挑配色</strong>
      </div>
    </div>
  );
}
