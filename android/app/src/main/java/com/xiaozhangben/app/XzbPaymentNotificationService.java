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
    private static final long DUPLICATE_WINDOW_MS = 45_000L;
    private static final String AMOUNT_TOKEN = "(?:[\\u00a5\\uffe5]\\s*)?[0-9]{1,6}(?:\\.[0-9]{1,2})?\\s*(?:\\u5143)?";
    private static final String TRANSACTION_TOKEN = "(?:\\u4ed8\\u6b3e|\\u652f\\u4ed8(?!\\u5b9d)|\\u6d88\\u8d39|\\u6263\\u6b3e|\\u652f\\u51fa|\\u5b9e\\u4ed8|\\u6536\\u6b3e|\\u5230\\u8d26|\\u5165\\u8d26|\\u9000\\u6b3e|\\u8f6c\\u8d26)";
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:[\\u00a5\\uffe5]\\s*[0-9]{1,6}(?:\\.[0-9]{1,2})?|[0-9]{1,6}(?:\\.[0-9]{1,2})?\\s*\\u5143|[0-9]{1,6}\\.[0-9]{1,2})",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern TRANSACTION_AMOUNT_NEAR_PATTERN = Pattern.compile(
        "(?s)(?:" + TRANSACTION_TOKEN + ".{0,28}" + AMOUNT_TOKEN + "|" + AMOUNT_TOKEN + ".{0,28}" + TRANSACTION_TOKEN + ")",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern STRONG_TRANSACTION_PATTERN = Pattern.compile(
        "(?:\\u4ed8\\u6b3e|\\u652f\\u4ed8|\\u6d88\\u8d39|\\u6263\\u6b3e|\\u4ea4\\u6613).{0,4}(?:\\u6210\\u529f|\\u5b8c\\u6210|\\u5df2\\u5b8c\\u6210)|(?:\\u5df2\\u4ed8\\u6b3e|\\u5df2\\u652f\\u4ed8|\\u5df2\\u6263\\u6b3e|\\u5b9e\\u4ed8|\\u652f\\u51fa)|(?:\\u6536\\u6b3e|\\u5230\\u8d26|\\u5165\\u8d26|\\u9000\\u6b3e|\\u8f6c\\u8d26).{0,6}(?:\\u6210\\u529f|\\u5230\\u8d26|\\u5165\\u8d26|\\u5df2\\u6536\\u6b3e)|(?:\\u6536\\u5230.{0,12}\\u8f6c\\u8d26)",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern TRANSACTION_CONTEXT_PATTERN = Pattern.compile(
        TRANSACTION_TOKEN + "|\\u4ea4\\u6613\\u63d0\\u9192|\\u8d26\\u5355\\u63d0\\u9192|\\u4e00\\u7b14",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern MARKETING_PATTERN = Pattern.compile(
        "\\u4f18\\u60e0|\\u9886\\u5238|\\u6d3b\\u52a8|\\u9650\\u65f6|\\u6298\\u6263|\\u4f4e\\u81f3|\\u62a2\\u8d2d|\\u70ed\\u5356|\\u65b0\\u54c1|\\u798f\\u5229|\\u63a8\\u5e7f|\\u5e7f\\u544a|\\u9080\\u4f60|\\u7acb\\u5373|\\u70b9\\u51fb|\\u5f00\\u901a|\\u4f1a\\u5458|\\u62bd\\u5956|\\u9886\\u53d6|\\u6ee1[0-9].{0,8}\\u51cf|\\u6700\\u9ad8.{0,8}\\u53ef\\u5f97",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern WECHAT_PAYMENT_TITLE_PATTERN = Pattern.compile(
        "\\u5fae\\u4fe1\\u652f\\u4ed8|\\u6536\\u6b3e\\u52a9\\u624b|\\u5fae\\u4fe1\\u6536\\u6b3e",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern WECHAT_PAYMENT_SENDER_LINE_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:\\u5fae\\u4fe1\\u652f\\u4ed8|\\u6536\\u6b3e\\u52a9\\u624b|\\u5fae\\u4fe1\\u6536\\u6b3e)(?:\\s.*)?$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern RECEIPT_DETAIL_PATTERN = Pattern.compile(
        "\\u5b9e\\u4ed8|\\u4ed8\\u6b3e\\u91d1\\u989d|\\u652f\\u4ed8\\u91d1\\u989d|\\u6536\\u6b3e\\u65b9|\\u5546\\u6237|\\u4ea4\\u6613\\u65f6\\u95f4|\\u8ba2\\u5355|\\u5df2\\u652f\\u51fa|\\u5df2\\u6263\\u6b3e|\\u6536\\u6b3e\\u5230\\u8d26|\\u9000\\u6b3e\\u5230\\u8d26",
        Pattern.CASE_INSENSITIVE
    );
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
        String rejectionReason = getRejectionReason(sbn.getPackageName(), getNotificationTitle(sbn), rawText);
        if (rejectionReason != null) {
            markRejected(rejectionReason);
            return;
        }
        String fingerprint = buildFingerprint(sbn.getPackageName(), rawText);
        if (isRecentDuplicate(fingerprint)) {
            markRejected("duplicate");
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
            markAccepted(fingerprint);
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
        if (notification != null) {
            append(builder, notification.tickerText);
        }

        if (extras != null) {
            append(builder, extras.getCharSequence(Notification.EXTRA_TITLE));
            append(builder, extras.getCharSequence("android.title.big"));
            append(builder, extras.getCharSequence(Notification.EXTRA_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_INFO_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));
            append(builder, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
            append(builder, extras.getCharSequence("android.conversationTitle"));

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

    static String classifyForTest(String packageName, String title, String rawText) {
        return getRejectionReason(packageName, title, rawText);
    }

    static boolean isStoredNotificationAccepted(String packageName, String rawText) {
        return getRejectionReason(packageName, rawText, rawText) == null;
    }

    private static String getRejectionReason(String packageName, String title, String rawText) {
        String text = rawText == null ? "" : rawText.toLowerCase(Locale.ROOT);
        boolean hasContext = TRANSACTION_CONTEXT_PATTERN.matcher(text).find();
        boolean amountNearTransaction = TRANSACTION_AMOUNT_NEAR_PATTERN.matcher(text).find();
        boolean hasAmount = AMOUNT_PATTERN.matcher(text).find()
            || text.matches("(?s).*(rmb|cny)\\s*[0-9]{1,6}(?:\\.[0-9]{1,2})?.*")
            || amountNearTransaction;
        boolean strongTransaction = STRONG_TRANSACTION_PATTERN.matcher(text).find();
        boolean marketing = MARKETING_PATTERN.matcher(text).find();
        boolean hasReceiptDetails = RECEIPT_DETAIL_PATTERN.matcher(text).find();
        boolean trustedTitle = isTrustedPaymentTitle(packageName, title)
            || ("com.tencent.mm".equals(packageName) && WECHAT_PAYMENT_SENDER_LINE_PATTERN.matcher(text).find());

        if (!hasContext) return "not_payment";
        if (!hasAmount) return "missing_amount";
        if (marketing && !hasReceiptDetails) return "ad_filtered";
        if ("com.tencent.mm".equals(packageName)) {
            if (trustedTitle && amountNearTransaction) return null;
            if (strongTransaction && amountNearTransaction && hasReceiptDetails) return null;
            return "weak_signal";
        }
        if (strongTransaction && amountNearTransaction) return null;
        if (trustedTitle && amountNearTransaction) return null;
        if ("com.eg.android.AlipayGphone".equals(packageName) && amountNearTransaction && !marketing) return null;
        return "weak_signal";
    }

    private static boolean isTrustedPaymentTitle(String packageName, String title) {
        String value = title == null ? "" : title.trim();
        if ("com.tencent.mm".equals(packageName)) {
            return WECHAT_PAYMENT_TITLE_PATTERN.matcher(value).find();
        }
        if ("com.eg.android.AlipayGphone".equals(packageName)) {
            return value.contains("\u652f\u4ed8\u5b9d")
                || value.contains("\u670d\u52a1\u63d0\u9192")
                || value.contains("\u652f\u4ed8\u52a9\u624b")
                || value.contains("\u8d26\u5355");
        }
        return false;
    }

    private String getNotificationTitle(StatusBarNotification sbn) {
        Notification notification = sbn == null ? null : sbn.getNotification();
        Bundle extras = notification == null ? null : notification.extras;
        CharSequence title = extras == null ? null : extras.getCharSequence(Notification.EXTRA_TITLE);
        return title == null ? "" : title.toString().trim();
    }

    private String buildFingerprint(String packageName, String rawText) {
        String normalized = rawText == null
            ? ""
            : rawText.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        return (packageName == null ? "" : packageName) + ":" + normalized.hashCode();
    }

    private boolean isRecentDuplicate(String fingerprint) {
        SharedPreferences preferences = getStatePreferences(this);
        String previous = preferences.getString("lastAcceptedFingerprint", "");
        long acceptedAt = preferences.getLong("lastAcceptedAt", 0L);
        return fingerprint.equals(previous) && System.currentTimeMillis() - acceptedAt < DUPLICATE_WINDOW_MS;
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

    private void markAccepted(String fingerprint) {
        getStatePreferences(this).edit()
            .putLong("lastAcceptedAt", System.currentTimeMillis())
            .putString("lastAcceptedFingerprint", fingerprint)
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
