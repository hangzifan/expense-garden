package com.xiaozhangben.app;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.io.IOException;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

public class XzbPaymentNotificationService extends NotificationListenerService {
    private static final String STATE_PREFS = "xzb_notification_listener_state";
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:[\\u00a5\\uffe5]\\s*[0-9]+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?\\s*\\u5143|[0-9]+\\.[0-9]{1,2})",
        Pattern.CASE_INSENSITIVE
    );
    private static final String[] PAYMENT_KEYWORDS = new String[] {
        "\u4ed8\u6b3e", "\u652f\u4ed8", "\u6d88\u8d39", "\u6263\u6b3e", "\u4ea4\u6613",
        "\u6536\u6b3e", "\u5230\u8d26", "\u5165\u8d26", "\u8f6c\u8d26", "\u9000\u6b3e",
        "\u5b9e\u4ed8", "\u4ed8\u7ed9", "\u6536\u5230"
    };
    private static volatile boolean listenerConnected = false;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        listenerConnected = true;
        getStatePreferences(this).edit()
            .putLong("lastConnectedAt", System.currentTimeMillis())
            .putString("lastReason", "connected")
            .apply();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        listenerConnected = false;
        getStatePreferences(this).edit()
            .putLong("lastDisconnectedAt", System.currentTimeMillis())
            .putString("lastReason", "disconnected")
            .apply();
        requestRebind(new ComponentName(this, XzbNotificationListenerService.class));
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !isTargetPackage(sbn.getPackageName())) {
            return;
        }

        String rawText = buildRawText(sbn);
        markSeen(sbn.getPackageName(), rawText);
        if (rawText.isEmpty()) {
            markRejected("empty_text");
            return;
        }
        if (!looksLikePayment(rawText)) {
            markRejected("not_payment");
            return;
        }

        try {
            JSONObject item = new JSONObject();
            item.put("id", buildId(sbn, rawText));
            item.put("packageName", sbn.getPackageName());
            item.put("appName", getAppName(sbn.getPackageName()));
            item.put("postTime", sbn.getPostTime());
            item.put("rawText", rawText);
            XzbNotificationStore.enqueue(getApplicationContext(), item);
            markAccepted();
        } catch (JSONException | IOException ignored) {
            markRejected("store_failed");
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
            append(builder, extras.getCharSequence(Notification.EXTRA_INFO_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));

            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                for (CharSequence line : lines) {
                    append(builder, line);
                }
            }

            Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (messages != null) {
                for (Parcelable message : messages) {
                    if (message instanceof Bundle) {
                        Bundle messageBundle = (Bundle) message;
                        append(builder, messageBundle.getCharSequence("sender"));
                        append(builder, messageBundle.getCharSequence("text"));
                    }
                }
            }

            CharSequence[] history = extras.getCharSequenceArray(Notification.EXTRA_REMOTE_INPUT_HISTORY);
            if (history != null) {
                for (CharSequence line : history) {
                    append(builder, line);
                }
            }
        }
        return builder.toString().trim();
    }

    private void append(StringBuilder builder, CharSequence value) {
        if (value == null) return;
        String text = value.toString().trim();
        if (text.isEmpty() || builder.indexOf(text) >= 0) return;
        if (builder.length() > 0) builder.append('\n');
        builder.append(text);
    }

    private boolean looksLikePayment(String rawText) {
        String text = rawText == null ? "" : rawText.toLowerCase(Locale.ROOT);
        boolean hasPaymentKeyword = false;
        for (String keyword : PAYMENT_KEYWORDS) {
            if (text.contains(keyword)) {
                hasPaymentKeyword = true;
                break;
            }
        }
        boolean hasAmount = AMOUNT_PATTERN.matcher(text).find()
            || text.matches("(?s).*(rmb|cny)\\s*[0-9]+(?:\\.[0-9]{1,2})?.*");
        return hasPaymentKeyword && hasAmount;
    }

    private String getAppName(String packageName) {
        if ("com.tencent.mm".equals(packageName)) return "\u5fae\u4fe1";
        if ("com.eg.android.AlipayGphone".equals(packageName)) return "\u652f\u4ed8\u5b9d";
        return packageName;
    }

    private String buildId(StatusBarNotification sbn, String rawText) {
        int hash = rawText == null ? 0 : rawText.hashCode();
        return sbn.getPackageName() + ":" + sbn.getId() + ":" + sbn.getPostTime() + ":" + hash;
    }

    static boolean isListenerConnected() {
        return listenerConnected;
    }

    static JSONObject getCaptureStatus(Context context) {
        SharedPreferences preferences = getStatePreferences(context);
        JSONObject status = new JSONObject();
        try {
            status.put("connected", listenerConnected);
            status.put("lastConnectedAt", preferences.getLong("lastConnectedAt", 0L));
            status.put("lastDisconnectedAt", preferences.getLong("lastDisconnectedAt", 0L));
            status.put("lastSeenAt", preferences.getLong("lastSeenAt", 0L));
            status.put("lastAcceptedAt", preferences.getLong("lastAcceptedAt", 0L));
            status.put("lastPackage", preferences.getString("lastPackage", ""));
            status.put("lastReason", preferences.getString("lastReason", "never_seen"));
        } catch (JSONException ignored) {
            // Fixed keys and primitive values above are JSON-safe.
        }
        return status;
    }

    private void markSeen(String packageName, String rawText) {
        getStatePreferences(this).edit()
            .putLong("lastSeenAt", System.currentTimeMillis())
            .putString("lastPackage", packageName == null ? "" : packageName)
            .putInt("lastTextLength", rawText == null ? 0 : rawText.length())
            .putString("lastReason", "seen")
            .apply();
    }

    private void markAccepted() {
        getStatePreferences(this).edit()
            .putLong("lastAcceptedAt", System.currentTimeMillis())
            .putString("lastReason", "stored")
            .apply();
    }

    private void markRejected(String reason) {
        getStatePreferences(this).edit().putString("lastReason", reason).apply();
    }

    private static SharedPreferences getStatePreferences(Context context) {
        return context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
    }
}
