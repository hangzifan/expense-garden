package com.xiaozhangben.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class XzbQuickConfirmationNotifier {
    static final String CHANNEL_ID = "xzb_payment_confirmation";
    static final String EXTRA_PAYLOAD = "xzb_notification_payload";
    static final String EXTRA_MERCHANT = "xzb_confirmation_merchant";
    static final String EXTRA_CATEGORY = "xzb_confirmation_category";
    static final String EXTRA_NOTIFICATION_ID = "xzb_confirmation_notification_id";
    private static final int MAX_ACTIONS = 3;

    private XzbQuickConfirmationNotifier() {}

    static boolean isEnabled(Context context) {
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "支付商户确认",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("支付通知缺少商户时提供候选并确认");
        manager.createNotificationChannel(channel);
    }

    static int notificationId(String transactionId) {
        return 0x4A000000 | (Math.abs(transactionId == null ? 0 : transactionId.hashCode()) & 0x00FFFFFF);
    }

    static void show(Context context, JSONObject item) {
        if (!isEnabled(context)) return;
        if (!item.optBoolean("merchantMissing", false)) return;
        ensureChannel(context);
        String transactionId = item.optString("id", "payment");
        int id = notificationId(transactionId);
        String method = item.optString("method", item.optString("appName", "支付"));
        double amount = item.optDouble("amount", 0);
        JSONArray suggestions = item.optJSONArray("merchantSuggestions");
        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = openIntent == null ? null : PendingIntent.getActivity(
            context,
            id,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | pendingIntentImmutableFlag()
        );
        String title = method + "支出 " + formatAmount(amount);
        String body = item.optString("merchant", "");
        if (body.isEmpty() || "未识别商户".equals(body)) {
            JSONObject first = suggestions == null ? null : suggestions.optJSONObject(0);
            body = first != null && !first.optString("name", "").trim().isEmpty()
                ? "可能是“" + first.optString("name", "") + "”，请选择确认"
                : "通知未提供商户，请打开小账本补充";
        } else {
            body = "可能是“" + body + "”，请选择确认";
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(contentIntent);

        int actionCount = 0;
        if (suggestions != null) {
            for (int index = 0; index < suggestions.length() && actionCount < MAX_ACTIONS; index++) {
                JSONObject candidate = suggestions.optJSONObject(index);
                if (candidate == null) continue;
                String merchant = candidate.optString("name", "").trim();
                if (merchant.isEmpty()) continue;
                String label = merchant.length() > 8 ? merchant.substring(0, 8) : merchant;
                Intent actionIntent = new Intent(context, XzbQuickConfirmReceiver.class)
                    .putExtra(EXTRA_PAYLOAD, item.toString())
                    .putExtra(EXTRA_MERCHANT, merchant)
                    .putExtra(EXTRA_CATEGORY, candidate.optString("category", "other"))
                    .putExtra(EXTRA_NOTIFICATION_ID, id);
                PendingIntent action = PendingIntent.getBroadcast(
                    context,
                    id + index + 1,
                    actionIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | pendingIntentImmutableFlag()
                );
                builder.addAction(new NotificationCompat.Action.Builder(0, "确认" + label, action).build());
                actionCount++;
            }
        }
        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    private static String formatAmount(double amount) {
        return String.format(java.util.Locale.US, "¥%.2f", amount);
    }

    private static int pendingIntentImmutableFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }
}
