package com.xiaozhangben.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.io.IOException;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class XzbPaymentNotificationService extends NotificationListenerService {
    private static final String STATE_PREFS = "xzb_notification_listener_state";
    private static final String DRAFT_PREFS = "xzb_notification_drafts";
    private static final long DUPLICATE_WINDOW_MS = 45_000L;
    private static final long ACTIVE_NOTIFICATION_LOOKBACK_MS = 120_000L;
    private static final long ASSOCIATION_WINDOW_MS = 15_000L;
    private static final long DRAFT_FINALIZE_DELAY_MS = 8_000L;
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
    private static final Pattern MERCHANT_LABEL_PATTERN = Pattern.compile(
        "(?:\\u6536\\u6b3e\\u65b9|\\u6536\\u6b3e\\u8d26\\u6237|\\u5546\\u6237(?:\\u540d\\u79f0|\\u5168\\u79f0)?|\\u5546\\u5bb6(?:\\u540d\\u79f0)?|\\u5e97\\u94fa(?:\\u540d\\u79f0)?|\\u4ea4\\u6613\\u5bf9\\u8c61|\\u4ed8\\u6b3e\\u7ed9|\\u652f\\u4ed8\\u7ed9|\\u8f6c\\u8d26\\u7ed9)\\s*[:：]?\\s*([^\\n\\r]+)",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern MERCHANT_NOISE_PATTERN = Pattern.compile(
        "^(?:\\u5fae\\u4fe1\\u652f\\u4ed8|\\u652f\\u4ed8\\u5b9d|\\u652f\\u4ed8\\u6210\\u529f|\\u4ed8\\u6b3e\\u6210\\u529f|\\u67e5\\u770b\\u8be6\\u60c5|\\u8d26\\u5355\\u8be6\\u60c5|\\u4ea4\\u6613\\u8be6\\u60c5|\\u901a\\u77e5)$",
        Pattern.CASE_INSENSITIVE
    );
    private static volatile boolean listenerConnected = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Runnable> finalizeTasks = new HashMap<>();

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        listenerConnected = true;
        XzbNotificationConnectionManager.cancelRecovery();
        flushExpiredDrafts(System.currentTimeMillis());
        getStatePreferences(this).edit()
            .putLong("lastConnectedAt", System.currentTimeMillis())
            .putString("lastReason", "connected")
            .apply();
        captureMostRecentActiveNotification();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        listenerConnected = false;
        flushAllDrafts();
        getStatePreferences(this).edit()
            .putLong("lastDisconnectedAt", System.currentTimeMillis())
            .putString("lastReason", "disconnected")
            .apply();
        XzbNotificationConnectionManager.scheduleRecovery(this);
    }

    @Override
    public void onTaskRemoved(android.content.Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (!listenerConnected) XzbNotificationConnectionManager.scheduleRecovery(this);
    }

    @Override
    public void onDestroy() {
        listenerConnected = false;
        flushAllDrafts();
        handler.removeCallbacksAndMessages(null);
        finalizeTasks.clear();
        getStatePreferences(this).edit()
            .putLong("lastServiceDestroyedAt", System.currentTimeMillis())
            .putString("lastReason", "service_destroyed")
            .apply();
        if (XzbNotificationConnectionManager.hasAccess(this)) {
            XzbNotificationConnectionManager.scheduleRecovery(this);
        }
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        processNotification(sbn);
    }

    private void processNotification(StatusBarNotification sbn) {
        if (sbn == null || !isTargetPackage(sbn.getPackageName())) return;
        long now = System.currentTimeMillis();
        flushExpiredDrafts(now);
        String packageName = sbn.getPackageName();
        String rawText = buildRawText(sbn);
        String title = getNotificationTitle(sbn);
        markSeen(packageName, rawText);
        if (rawText.isEmpty()) {
            markRejected("empty_text");
            return;
        }

        double amount = extractAmount(rawText);
        String merchant = extractMerchant(rawText, title);
        JSONObject draft = readDraft(packageName);
        boolean supplement = draft != null && isWithinAssociationWindow(draft, now)
            && !merchant.isEmpty() && isMerchantSupplement(packageName, title, rawText);
        String rejectionReason = getRejectionReason(packageName, title, rawText);
        if (rejectionReason != null && !supplement) {
            markRejected(rejectionReason);
            return;
        }

        String notificationId = buildId(sbn, rawText);
        String fingerprint = buildFingerprint(packageName, rawText);
        if (draft != null && isWithinAssociationWindow(draft, now) && canMerge(draft, sbn, amount)) {
            mergeDraft(draft, sbn, rawText, title, amount, merchant);
        } else {
            if (draft != null) finalizeDraft(draft);
            if (!supplement && isRecentDuplicate(notificationId, fingerprint)) {
                markRejected("duplicate");
                return;
            }
            draft = createDraft(sbn, rawText, title, amount, merchant, notificationId, fingerprint);
        }

        if (merchant.isEmpty()) {
            saveDraft(packageName, draft);
            scheduleFinalize(packageName);
        } else {
            finalizeDraft(draft);
        }
    }

    private JSONObject createDraft(StatusBarNotification sbn, String rawText, String title, double amount, String merchant, String id, String fingerprint) {
        JSONObject draft = new JSONObject();
        try {
            draft.put("id", id);
            draft.put("packageName", sbn.getPackageName());
            draft.put("appName", getAppName(sbn.getPackageName()));
            draft.put("postTime", sbn.getPostTime());
            draft.put("createdAt", System.currentTimeMillis());
            draft.put("updatedAt", System.currentTimeMillis());
            draft.put("sourceKey", sbn.getKey());
            draft.put("title", title);
            draft.put("rawText", rawText);
            draft.put("amount", amount);
            draft.put("merchant", merchant);
            draft.put("notificationCount", 1);
            draft.put("fingerprint", fingerprint);
            draft.put("captureSource", "notification_listener");
            draft.put("extractedFields", buildExtractedFields(sbn));
        } catch (JSONException ignored) {
            // JSONObject construction above uses fixed primitive fields.
        }
        return draft;
    }

    private void mergeDraft(JSONObject draft, StatusBarNotification sbn, String rawText, String title, double amount, String merchant) {
        try {
            appendUnique(draft, "rawText", rawText);
            if (!title.isEmpty()) draft.put("title", title);
            if (draft.optDouble("amount", 0) <= 0 && amount > 0) draft.put("amount", amount);
            if (!merchant.isEmpty()) draft.put("merchant", merchant);
            draft.put("updatedAt", System.currentTimeMillis());
            draft.put("notificationCount", draft.optInt("notificationCount", 1) + 1);
            draft.put("captureSource", "notification_listener_merged");
            JSONObject fields = draft.optJSONObject("extractedFields");
            if (fields == null) fields = new JSONObject();
            JSONObject incoming = buildExtractedFields(sbn);
            JSONArray incomingNames = incoming.names();
            if (incomingNames != null) {
                for (int index = 0; index < incomingNames.length(); index++) {
                    String key = incomingNames.optString(index, "");
                    if (!key.isEmpty()) fields.put(key, incoming.opt(key));
                }
            }
            draft.put("extractedFields", fields);
        } catch (JSONException ignored) {
            // Keep the first valid draft if a later notification has malformed extras.
        }
    }

    private void finalizeDraft(JSONObject draft) {
        if (draft == null) return;
        String packageName = draft.optString("packageName", "");
        String id = draft.optString("id", "");
        if (id.isEmpty()) return;
        cancelFinalize(packageName);
        try {
            double amount = draft.optDouble("amount", 0);
            String merchant = draft.optString("merchant", "").trim();
            boolean merchantWasMissing = merchant.isEmpty();
            JSONArray suggestions = merchant.isEmpty()
                ? XzbMerchantProfileStore.suggest(getApplicationContext(), amount, getAppName(packageName), draft.optLong("postTime", 0))
                : exactSuggestion(merchant);
            if (merchant.isEmpty() && suggestions.length() > 0) {
                JSONObject best = suggestions.optJSONObject(0);
                JSONObject second = suggestions.length() > 1 ? suggestions.optJSONObject(1) : null;
                boolean confident = best != null && best.optBoolean("highConfidence", false)
                    && (second == null || best.optInt("confidence", 0) - second.optInt("confidence", 0) >= 12);
                if (confident) {
                    merchant = best.optString("name", "");
                    draft.put("category", best.optString("category", "other"));
                    draft.put("merchantPrediction", true);
                }
            }
            boolean merchantMissing = merchant.isEmpty();
            draft.put("merchant", merchantMissing ? "未识别商户" : merchant);
            draft.put("merchantMissing", merchantMissing);
            draft.put("merchantSuggestions", suggestions);
            draft.put("accepted", true);
            draft.put("source", "通知识别");
            draft.put("finalizedAt", System.currentTimeMillis());
            XzbNotificationStore.enqueue(getApplicationContext(), draft);
            if (merchantWasMissing && merchantMissing) {
                XzbQuickConfirmationNotifier.show(getApplicationContext(), draft);
            }
            markAccepted(id, draft.optString("fingerprint", ""));
            clearDraft(packageName);
        } catch (JSONException | IOException error) {
            markRejected("store_failed");
        }
    }

    private JSONArray exactSuggestion(String merchant) throws JSONException {
        JSONArray suggestions = new JSONArray();
        JSONObject item = new JSONObject();
        item.put("name", merchant);
        item.put("category", "other");
        item.put("confidence", 98);
        item.put("score", 100);
        item.put("samples", 0);
        item.put("highConfidence", true);
        suggestions.put(item);
        return suggestions;
    }

    private void scheduleFinalize(final String packageName) {
        cancelFinalize(packageName);
        Runnable task = new Runnable() {
            @Override
            public void run() {
                finalizeDraft(readDraft(packageName));
            }
        };
        finalizeTasks.put(packageName, task);
        handler.postDelayed(task, DRAFT_FINALIZE_DELAY_MS);
    }

    private void cancelFinalize(String packageName) {
        Runnable task = finalizeTasks.remove(packageName);
        if (task != null) handler.removeCallbacks(task);
    }

    private void flushExpiredDrafts(long now) {
        for (String packageName : new String[] {"com.tencent.mm", "com.eg.android.AlipayGphone"}) {
            JSONObject draft = readDraft(packageName);
            if (draft != null && now - draft.optLong("updatedAt", now) > ASSOCIATION_WINDOW_MS) finalizeDraft(draft);
        }
    }

    private void flushAllDrafts() {
        finalizeDraft(readDraft("com.tencent.mm"));
        finalizeDraft(readDraft("com.eg.android.AlipayGphone"));
    }

    private boolean isWithinAssociationWindow(JSONObject draft, long now) {
        return draft != null && now - draft.optLong("updatedAt", now) <= ASSOCIATION_WINDOW_MS;
    }

    private boolean canMerge(JSONObject draft, StatusBarNotification sbn, double amount) {
        String previousKey = draft.optString("sourceKey", "");
        if (!previousKey.isEmpty() && previousKey.equals(sbn.getKey())) return true;
        double previousAmount = draft.optDouble("amount", 0);
        return previousAmount <= 0 || amount <= 0 || Math.abs(previousAmount - amount) < 0.011;
    }

    private boolean isMerchantSupplement(String packageName, String title, String rawText) {
        boolean trusted = isTrustedPaymentTitle(packageName, title);
        boolean labeled = MERCHANT_LABEL_PATTERN.matcher(rawText).find();
        return !MARKETING_PATTERN.matcher(rawText).find() && (trusted || labeled || RECEIPT_DETAIL_PATTERN.matcher(rawText).find());
    }

    private JSONObject readDraft(String packageName) {
        String raw = getDraftPreferences(this).getString("draft_" + packageName, "");
        if (raw.isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException error) {
            clearDraft(packageName);
            return null;
        }
    }

    private void saveDraft(String packageName, JSONObject draft) {
        getDraftPreferences(this).edit().putString("draft_" + packageName, draft.toString()).apply();
    }

    private void clearDraft(String packageName) {
        if (packageName == null || packageName.isEmpty()) return;
        cancelFinalize(packageName);
        getDraftPreferences(this).edit().remove("draft_" + packageName).apply();
    }

    private void captureMostRecentActiveNotification() {
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active == null || active.length == 0) return;
            long cutoff = System.currentTimeMillis() - ACTIVE_NOTIFICATION_LOOKBACK_MS;
            StatusBarNotification newest = null;
            for (StatusBarNotification item : active) {
                if (item == null || item.getPostTime() < cutoff || !isTargetPackage(item.getPackageName())) continue;
                if (newest == null || item.getPostTime() > newest.getPostTime()) newest = item;
            }
            if (newest != null) processNotification(newest);
        } catch (SecurityException ignored) {
            markRejected("active_scan_denied");
        }
    }

    private boolean isTargetPackage(String packageName) {
        return "com.tencent.mm".equals(packageName) || "com.eg.android.AlipayGphone".equals(packageName);
    }

    private String buildRawText(StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        Bundle extras = notification == null ? null : notification.extras;
        StringBuilder builder = new StringBuilder();
        if (notification != null) append(builder, notification.tickerText);
        if (extras != null) {
            for (String key : extras.keySet()) append(builder, flattenValue(extras.get(key), 0));
        }
        return builder.toString().trim();
    }

    private JSONObject buildExtractedFields(StatusBarNotification sbn) {
        JSONObject fields = new JSONObject();
        Notification notification = sbn.getNotification();
        Bundle extras = notification == null ? null : notification.extras;
        if (notification != null) putField(fields, "ticker", notification.tickerText);
        if (extras != null) {
            for (String key : extras.keySet()) {
                String value = flattenValue(extras.get(key), 0);
                if (!value.isEmpty()) putField(fields, key, value);
            }
        }
        return fields;
    }

    private String flattenValue(Object value, int depth) {
        if (value == null || depth > 2) return "";
        if (value instanceof CharSequence || value instanceof Number || value instanceof Boolean) {
            return trimForField(String.valueOf(value));
        }
        if (value instanceof Bundle) {
            StringBuilder result = new StringBuilder();
            Bundle bundle = (Bundle) value;
            for (String key : bundle.keySet()) append(result, flattenValue(bundle.get(key), depth + 1));
            return trimForField(result.toString());
        }
        if (value instanceof CharSequence[]) {
            StringBuilder result = new StringBuilder();
            for (CharSequence item : (CharSequence[]) value) append(result, item);
            return trimForField(result.toString());
        }
        if (value instanceof Parcelable[]) {
            StringBuilder result = new StringBuilder();
            for (Parcelable item : (Parcelable[]) value) append(result, flattenValue(item, depth + 1));
            return trimForField(result.toString());
        }
        return "";
    }

    private String trimForField(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.length() > 800 ? trimmed.substring(0, 800) : trimmed;
    }

    private void putField(JSONObject fields, String key, Object value) {
        String text = value == null ? "" : value.toString().trim();
        if (key == null || text.isEmpty()) return;
        try {
            fields.put(key, trimForField(text));
        } catch (JSONException ignored) {
            // Ignore a malformed extra key/value.
        }
    }

    private void append(StringBuilder builder, CharSequence value) {
        if (value == null) return;
        append(builder, value.toString());
    }

    private void append(StringBuilder builder, String value) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty() || builder.indexOf(text) >= 0) return;
        if (builder.length() > 0) builder.append('\n');
        builder.append(text);
    }

    static String classifyForTest(String packageName, String title, String rawText) {
        return getRejectionReason(packageName, title, rawText);
    }

    static boolean isStoredNotificationAccepted(String packageName, String title, String rawText) {
        return getRejectionReason(packageName, title, rawText) == null;
    }

    static double extractAmountForTest(String rawText) {
        return extractAmount(rawText);
    }

    static String extractMerchantForTest(String rawText, String title) {
        return extractMerchant(rawText, title);
    }

    static String getAppNameForTest(String packageName) {
        return getAppName(packageName);
    }

    static String mergeTextForTest(String first, String second) {
        return mergeUniqueText(first, second);
    }

    private static double extractAmount(String rawText) {
        String source = rawText == null ? "" : rawText;
        Matcher matcher = AMOUNT_PATTERN.matcher(source);
        double best = 0;
        int bestScore = Integer.MIN_VALUE;
        while (matcher.find()) {
            String value = matcher.group().replaceAll("[^0-9.]", "");
            try {
                double parsed = Double.parseDouble(value);
                if (parsed <= 0 || parsed >= 1_000_000) continue;
                int score = scoreAmountCandidate(source, matcher.start(), matcher.end(), matcher.group());
                if (score > bestScore) {
                    best = parsed;
                    bestScore = score;
                }
            } catch (NumberFormatException ignored) {
                // Ignore non-numeric notification fragments.
            }
        }
        return best;
    }

    private static int scoreAmountCandidate(String source, int start, int end, String token) {
        int localStart = Math.max(0, start - 20);
        int localEnd = Math.min(source.length(), end + 20);
        String context = source.substring(localStart, localEnd);
        int score = 0;
        if (token.matches(".*[￥¥元].*")) score += 14;
        if (context.matches("(?s).*(实付|付款金额|支付金额|交易金额|订单金额|已付款|已支付|支出|扣款|收款金额|到账金额|退款金额).*")) score += 55;
        else if (TRANSACTION_CONTEXT_PATTERN.matcher(context).find()) score += 24;
        if (context.matches("(?s).*(余额|剩余|优惠|立减|红包|原价|折扣|可用额度).*")) score -= 70;
        if (context.matches("(?s).*(订单号|交易号|流水号|编号).*")) score -= 35;
        if (token.matches(".*\\.[0-9]{1,2}.*")) score += 4;
        return score;
    }

    private static String extractMerchant(String rawText, String title) {
        String source = rawText == null ? "" : rawText;
        Matcher matcher = MERCHANT_LABEL_PATTERN.matcher(source);
        while (matcher.find()) {
            String value = cleanMerchant(matcher.group(1));
            if (isMerchantCandidate(value)) return value;
        }
        String[] lines = source.split("\\r?\\n");
        for (String line : lines) {
            String value = cleanMerchant(line);
            if (isMerchantCandidate(value) && (value.contains("店") || value.contains("公司") || value.contains("医院"))) return value;
        }
        return "";
    }

    private static String cleanMerchant(String value) {
        return (value == null ? "" : value)
            .replaceAll("[￥¥]\\s*[0-9][0-9,]*(?:\\.[0-9]{1,2})?", "")
            .replaceAll("(?:付款成功|支付成功|交易成功|收款成功|查看详情|详情|完成)$", "")
            .replaceAll("^[：:，,。；;\\-—\\s]+|[：:，,。；;\\-—\\s]+$", "")
            .trim();
    }

    private static boolean isMerchantCandidate(String value) {
        if (value == null || value.length() < 2 || value.length() > 32) return false;
        if (MERCHANT_NOISE_PATTERN.matcher(value).matches()) return false;
        if (!value.matches(".*[A-Za-z\\u4e00-\\u9fff].*")) return false;
        if (value.matches("[0-9\\s()+\\-*/.]+")) return false;
        return !value.matches(".*20[0-9]{2}[-/.年][0-9]{1,2}.*");
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

        if (!hasContext && !trustedTitle && !hasReceiptDetails) return "not_payment";
        if (!hasAmount) return "missing_amount";
        if (marketing && !hasReceiptDetails) return "ad_filtered";
        if ("com.tencent.mm".equals(packageName)) {
            if (trustedTitle && amountNearTransaction) return null;
            if (trustedTitle && hasReceiptDetails && hasAmount && !marketing) return null;
            if (strongTransaction && amountNearTransaction && hasReceiptDetails) return null;
            return "weak_signal";
        }
        if (strongTransaction && amountNearTransaction) return null;
        if (trustedTitle && amountNearTransaction) return null;
        if (trustedTitle && hasReceiptDetails && hasAmount && !marketing) return null;
        if ("com.eg.android.AlipayGphone".equals(packageName) && amountNearTransaction && !marketing) return null;
        return "weak_signal";
    }

    private static boolean isTrustedPaymentTitle(String packageName, String title) {
        String value = title == null ? "" : title.trim();
        if ("com.tencent.mm".equals(packageName)) return WECHAT_PAYMENT_TITLE_PATTERN.matcher(value).find();
        if ("com.eg.android.AlipayGphone".equals(packageName)) {
            return value.contains("支付宝") || value.contains("服务提醒")
                || value.contains("支付助手") || value.contains("账单");
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
        String normalized = rawText == null ? "" : rawText.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        return (packageName == null ? "" : packageName) + ":" + normalized.hashCode();
    }

    private String buildId(StatusBarNotification sbn, String rawText) {
        int hash = rawText == null ? 0 : rawText.hashCode();
        return sbn.getPackageName() + ":" + sbn.getId() + ":" + sbn.getPostTime() + ":" + hash;
    }

    private boolean isRecentDuplicate(String notificationId, String fingerprint) {
        SharedPreferences preferences = getStatePreferences(this);
        String previousId = preferences.getString("lastAcceptedNotificationId", "");
        String previous = preferences.getString("lastAcceptedFingerprint", "");
        long acceptedAt = preferences.getLong("lastAcceptedAt", 0L);
        return notificationId.equals(previousId)
            || (fingerprint.equals(previous) && System.currentTimeMillis() - acceptedAt < DUPLICATE_WINDOW_MS);
    }

    private static void appendUnique(JSONObject target, String key, String value) throws JSONException {
        String current = target.optString(key, "");
        target.put(key, mergeUniqueText(current, value));
    }

    private static String mergeUniqueText(String currentValue, String incomingValue) {
        String current = currentValue == null ? "" : currentValue;
        String incoming = incomingValue == null ? "" : incomingValue;
        if (incoming.isEmpty() || current.contains(incoming)) return current;
        return current.isEmpty() ? incoming : current + "\n" + incoming;
    }

    private static String getAppName(String packageName) {
        if ("com.tencent.mm".equals(packageName)) return "微信";
        if ("com.eg.android.AlipayGphone".equals(packageName)) return "支付宝";
        return packageName;
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
            status.put("lastTextLength", preferences.getInt("lastTextLength", 0));
            status.put("lastReason", preferences.getString("lastReason", "never_seen"));
            status.put("lastDraftAt", preferences.getLong("lastDraftAt", 0L));
            status.put("lastRebindRequestAt", preferences.getLong("lastRebindRequestAt", 0L));
            status.put("lastRebindFailedAt", preferences.getLong("lastRebindFailedAt", 0L));
            status.put("lastServiceDestroyedAt", preferences.getLong("lastServiceDestroyedAt", 0L));
            status.put("rebindRequestCount", preferences.getInt("rebindRequestCount", 0));
            status.put("profileCount", XzbMerchantProfileStore.count(context));
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

    private void markAccepted(String notificationId, String fingerprint) {
        getStatePreferences(this).edit()
            .putLong("lastAcceptedAt", System.currentTimeMillis())
            .putString("lastAcceptedNotificationId", notificationId)
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

    private static SharedPreferences getDraftPreferences(Context context) {
        return context.getSharedPreferences(DRAFT_PREFS, Context.MODE_PRIVATE);
    }
}
