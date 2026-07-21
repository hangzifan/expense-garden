package com.xiaozhangben.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONException;
import org.json.JSONObject;

public final class XzbQuickConfirmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String payload = intent.getStringExtra(XzbQuickConfirmationNotifier.EXTRA_PAYLOAD);
        String merchant = intent.getStringExtra(XzbQuickConfirmationNotifier.EXTRA_MERCHANT);
        String category = intent.getStringExtra(XzbQuickConfirmationNotifier.EXTRA_CATEGORY);
        if (payload == null || merchant == null || merchant.trim().isEmpty()) return;
        try {
            JSONObject item = new JSONObject(payload);
            item.put("merchant", merchant.trim());
            item.put("category", category == null || category.isEmpty() ? "other" : category);
            item.put("merchantMissing", false);
            item.put("quickConfirmed", true);
            item.put("quickConfirmedAt", System.currentTimeMillis());
            item.put("source", "通知快捷确认");
            item.put("accepted", true);
            XzbNotificationStore.enqueue(context.getApplicationContext(), item);
            int notificationId = intent.getIntExtra(XzbQuickConfirmationNotifier.EXTRA_NOTIFICATION_ID, 0);
            if (notificationId != 0) {
                NotificationManagerCompat.from(context).cancel(notificationId);
            }
            context.getSharedPreferences("xzb_notification_listener_state", Context.MODE_PRIVATE)
                .edit().putString("lastReason", "quick_confirmed").apply();
        } catch (JSONException | java.io.IOException ignored) {
            // A failed quick action remains visible in the app's pending list on the next sync.
        }
    }
}