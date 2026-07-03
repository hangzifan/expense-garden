package com.xiaozhangben.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.io.IOException;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

public class XzbNotificationListenerService extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !isTargetPackage(sbn.getPackageName())) {
            return;
        }

        String rawText = buildRawText(sbn);
        if (!looksLikePayment(rawText)) {
            return;
        }

        try {
            JSONObject item = new JSONObject();
            item.put("id", buildId(sbn, rawText));
            item.put("packageName", sbn.getPackageName());
            item.put("appName", getAppName(sbn.getPackageName()));
            item.put("postTime", sbn.getPostTime());
            item.put("rawText", rawText);
            storeItem(item);
        } catch (JSONException | IOException ignored) {
            // If one notification is malformed, skip it and keep listening.
        }
    }

    private boolean isTargetPackage(String packageName) {
        return "com.tencent.mm".equals(packageName) || "com.eg.android.AlipayGphone".equals(packageName);
    }

    private String buildRawText(StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        Bundle extras = notification == null ? null : notification.extras;
        StringBuilder builder = new StringBuilder();
        append(builder, getAppName(sbn.getPackageName()));

        if (extras != null) {
            append(builder, extras.getCharSequence(Notification.EXTRA_TITLE));
            append(builder, extras.getCharSequence(Notification.EXTRA_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));

            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                for (CharSequence line : lines) {
                    append(builder, line);
                }
            }
        }

        return builder.toString().trim();
    }

    private void append(StringBuilder builder, CharSequence value) {
        if (value == null) {
            return;
        }
        String text = value.toString().trim();
        if (text.isEmpty() || builder.indexOf(text) >= 0) {
            return;
        }
        if (builder.length() > 0) {
            builder.append('\n');
        }
        builder.append(text);
    }

    private boolean looksLikePayment(String rawText) {
        String text = rawText == null ? "" : rawText.toLowerCase(Locale.ROOT);
        boolean hasPaymentKeyword = text.matches("(?s).*(支付成功|付款成功|交易成功|扣款成功|消费|收款成功|收款到账|退款成功|转账|入账|到账).*");
        boolean hasAmount = text.matches("(?s).*(￥|¥|rmb|cny|[0-9]+\\.[0-9]{1,2}|[0-9]+\\s*元).*");
        return hasPaymentKeyword && hasAmount;
    }

    private String getAppName(String packageName) {
        if ("com.tencent.mm".equals(packageName)) {
            return "微信";
        }
        if ("com.eg.android.AlipayGphone".equals(packageName)) {
            return "支付宝";
        }
        return packageName;
    }

    private String buildId(StatusBarNotification sbn, String rawText) {
        int hash = rawText == null ? 0 : rawText.hashCode();
        return sbn.getPackageName() + ":" + sbn.getId() + ":" + sbn.getPostTime() + ":" + hash;
    }

    private void storeItem(JSONObject item) throws IOException {
        XzbNotificationStore.enqueue(getApplicationContext(), item);
    }
}
