# Android 原生桥接设计

小账本 Android 版使用 Capacitor 插件把系统通知和 ML Kit OCR 接到前端账本。原生层只做采集和识别，前端仍负责解析、分类、待确认和入账。

## 通知识别

Android APK 实现 `XzbNotificationListenerService`：

- 只监听微信与支付宝通知。
- 只保留付款、收款、退款、到账等疑似账单通知。
- 不读取账号密码，不读取聊天记录，不自动入账。
- 每条命中的通知写成一个独立 JSON 文件，先写 `.tmp`，再原子重命名为 `.json`。

前端通过 `XzbNotify.drainNotifications()` 拉取队列：

```json
{
  "items": [
    {
      "id": "com.tencent.mm:100:1783000000000:123456",
      "packageName": "com.tencent.mm",
      "appName": "微信",
      "postTime": 1783000000000,
      "rawText": "微信支付 付款成功 ￥36.50 收款方：美团外卖 2026-07-01 12:24"
    }
  ]
}
```

拉取后，插件只删除已经枚举到的 JSON 文件。拉取期间新进来的通知会写入新文件，不会被清空操作覆盖。

## 截图 OCR

截图 OCR 使用 `XzbOcr` 插件：

- 单图裁剪：前端生成裁剪图后调用 `recognizeImage({ dataUrl })`。
- 批量识别：前端调用 `pickImagesAndRecognize()`，原生层逐张读取 URI 并使用 ML Kit 识别，只返回文本结果。
- 原生层会在 OCR 前缩放图片并做轻度灰度/对比增强，避免前端主线程处理大图像素。

批量识别返回格式：

```json
{
  "results": [
    {
      "uri": "content://media/...",
      "text": "支付宝 支付成功 金额：128.00 商户：盒马鲜生 2026-07-01 19:32"
    }
  ]
}
```

## 前端处理

前端统一调用 `parseExpenseText(text)` 解析金额、商户、日期、支付方式和收入/支出类型。

识别结果先进入「待确认」，用户可以修改金额、商户、分类、日期和时间后再确认入账。
