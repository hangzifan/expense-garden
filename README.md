# 小账本 · Expense Garden

一个本地优先、Android 优先的个人记账应用。项目使用 React 19、Vite 和 Capacitor 构建，提供手动记账、月度分析、截图 OCR、支付通知候选账单、自定义分类与主题、备份恢复等能力。

> 当前开源版本：v1.35。数据默认保存在用户设备本地；应用不要求微信或支付宝账号密码，也不会绑定支付账户。

## APK 下载

最近五个测试安装包已通过 [GitHub Releases](https://github.com/hangzifan/expense-garden/releases) 发布：

| 版本 | 主题 | Android 版本号 | 下载 |
|---|---|---:|---|
| v1.35 | 猫娘 UI 完整预览 | 38 | [Release 与 APK](https://github.com/hangzifan/expense-garden/releases/tag/v1.35.0-preview) |
| v1.34 | 全量猫娘 UI 预览 | 37 | [Release 与 APK](https://github.com/hangzifan/expense-garden/releases/tag/archive%2Fv1.34.0-reconstructed) |
| v1.33 | 混合猫娘 UI 预览 | 36 | [Release 与 APK](https://github.com/hangzifan/expense-garden/releases/tag/archive%2Fv1.33.0-reconstructed) |
| v1.32 | 猫娘首页预览 | 35 | [Release 与 APK](https://github.com/hangzifan/expense-garden/releases/tag/archive%2Fv1.32.0-reconstructed) |
| v1.31 | 企业级 UI 预览 | 34 | [Release 与 APK](https://github.com/hangzifan/expense-garden/releases/tag/archive%2Fv1.31.0-reconstructed) |

以上 APK 均为 **Debug Pre-release**，使用相同包名与调试签名，仅供测试和历史验证。安装前建议先导出备份；从高 versionCode 回退到低版本时不能直接覆盖安装。每个 Release 页面均提供 APK SHA-256、签名证书指纹和对应源码状态说明。

## 功能

- 首页：本月支出、收入、结余、预算进度、待确认账单和最近记录。
- 记一笔：记录支出或收入，支持分类、商户、日期、时间、支付方式和备注。
- 智能识别：批量导入账单截图，本机 OCR 后解析金额、商户、时间与建议分类。
- 通知辅助：Android `NotificationListenerService` 读取支付通知并生成候选账单。
- 月报：每日趋势、分类占比、商户排行、收入分析和消费洞察。
- 个性化：猫娘主题界面、自定义封面、主题色、深色模式和自定义分类。
- 数据安全：本地持久化、导入/导出备份、原生侧自动备份与恢复。

识别结果不会静默入账：普通截图和通知会先进入「待确认」，由用户检查或修改后保存。

## 技术栈

- React 19
- Vite 7
- Capacitor 8 / Android
- Lucide React
- Android ML Kit Text Recognition
- Node.js 原生测试运行器

## 本地开发

要求：Node.js 20+、npm。

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址。生产构建与预览：

```bash
npm run build
npm run preview
```

运行自动测试：

```bash
npm test
```

## Android 开发

要求：Android Studio、Android SDK、JDK 21。

```bash
npm run build
npx cap sync android
```

随后使用 Android Studio 打开 `android/`，或在该目录运行 Gradle 构建。`android/local.properties`、APK、签名文件和构建产物不会提交到仓库。

原生桥接说明见 [docs/ANDROID_NATIVE_BRIDGE.md](docs/ANDROID_NATIVE_BRIDGE.md)。

## 隐私与权限

- 账单和设置默认保存在设备本地。
- 截图 OCR 在 Android 端本机执行。
- 通知读取权限仅用于提取支付通知候选信息。
- 应用不读取支付账号密码，不主动向第三方上传账单。
- 用户可在正式入账前编辑或删除识别结果。

## 版本历史与可复现性

仓库按实际开发时间整理了 v1.0 至 v1.35 的提交与标签。完整时间线、每个版本的来源状态、历史 APK 的 SHA-256 校验值及重建范围，见 [历史版本说明](history/README.md) 和 [版本清单](history/version-manifest.json)。

- `v1.29.0` 是已核对的 Web 源码版本；`v1.35.0-preview` 对应当前预览源码。
- `archive/*-reconstructed` 标签表示依据保留记录重建的历史状态，不宣称与当时 APK 逐字节一致。
- v1.22–v1.26 仅保留从 APK 恢复的编译后 Web 资源，明确标记为 `build-only`。
- 历史 APK 总体积超过 1 GB 且使用调试签名，因此不直接提交到 Git；仓库保留其文件信息与摘要用于核验。

## 开源说明

代码与项目内原创视觉素材采用 [MIT License](LICENSE)。欢迎提交 Issue 与 Pull Request。请勿在 Issue 中上传包含真实交易信息、支付通知或个人隐私的截图。
