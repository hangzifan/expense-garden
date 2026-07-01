# Android 原生桥接设计

小账本第一版的前端已经把通知识别和截图识别统一为同一条链路：

1. 原生层拿到通知文本或 OCR 文本。
2. 调用 WebView 中的 `window.__xiaozhangbenReceiveText(text, source)`。
3. 前端解析金额、商户、时间、来源和建议分类。
4. 用户在「待确认」里点击「确认入账」。

## 通知识别

Android APK 需要实现 `NotificationListenerService`：

- 只读取微信支付、支付宝相关通知。
- 不保存账号、密码、验证码和聊天内容。
- 从通知 `title` / `text` / `subText` 提取纯文本。
- 文本通过 Capacitor 插件或 WebView bridge 传给前端。
- 前端只创建待确认账单，不自动入账。

建议桥接格式：

```json
{
  "source": "通知识别",
  "provider": "微信",
  "text": "微信支付 付款成功 ￥36.50 收款方：美团外卖 2026-07-01 12:24"
}
```

## 截图 OCR

Android APK 推荐接入 Google ML Kit Text Recognition，流程如下：

- 用户在应用内选择支付成功截图或账单截图。
- 原生层对图片做本机 OCR。
- OCR 文本传给前端解析器。
- 前端显示识别结果，由用户确认分类后入账。

建议桥接格式：

```json
{
  "source": "截图识别",
  "provider": "支付宝",
  "text": "支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32"
}
```

## 前端接入点

后续封装 APK 时，在 `src/App.jsx` 中注册一个全局方法即可：

```js
window.__xiaozhangbenReceiveText = (text, source) => {
  const candidate = parseExpenseText(text);
  addPending({ ...candidate, source });
};
```

当前 PWA 版本已经提供相同的手动入口，用于测试通知文本和截图 OCR 文本的解析效果。
