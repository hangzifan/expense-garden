package com.xiaozhangben.app;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import androidx.core.app.NotificationManagerCompat;
import java.util.concurrent.atomic.AtomicInteger;

final class XzbNotificationConnectionManager {
    private static final String STATE_PREFS = "xzb_notification_listener_state";
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static final AtomicInteger RECOVERY_GENERATION = new AtomicInteger();
    private static final Object REBIND_LOCK = new Object();

    private XzbNotificationConnectionManager() {}

    static boolean hasAccess(Context context) {
        Context appContext = context.getApplicationContext();
        ComponentName component = listenerComponent(appContext);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            NotificationManager manager = appContext.getSystemService(NotificationManager.class);
            if (manager != null) return manager.isNotificationListenerAccessGranted(component);
        }
        return NotificationManagerCompat.getEnabledListenerPackages(appContext).contains(appContext.getPackageName());
    }

    static boolean requestRebind(Context context, boolean force) {
        Context appContext = context.getApplicationContext();
        if (!hasAccess(appContext) || XzbPaymentNotificationService.isListenerConnected()) return false;
        synchronized (REBIND_LOCK) {
            SharedPreferences preferences = preferences(appContext);
            long now = System.currentTimeMillis();
            long previous = preferences.getLong("lastRebindRequestAt", 0L);
            if (!XzbRebindPolicy.shouldRequest(now, previous, force)) return false;
            try {
                NotificationListenerService.requestRebind(listenerComponent(appContext));
                preferences.edit()
                    .putLong("lastRebindRequestAt", now)
                    .putInt("rebindRequestCount", preferences.getInt("rebindRequestCount", 0) + 1)
                    .putString("lastReason", "rebind_requested")
                    .apply();
                return true;
            } catch (RuntimeException error) {
                preferences.edit()
                    .putLong("lastRebindFailedAt", now)
                    .putString("lastReason", "rebind_failed")
                    .apply();
                return false;
            }
        }
    }

    static void scheduleRecovery(Context context) {
        Context appContext = context.getApplicationContext();
        int generation = RECOVERY_GENERATION.incrementAndGet();
        requestRebind(appContext, true);
        for (long delay : XzbRebindPolicy.RECOVERY_DELAYS_MS) {
            MAIN_HANDLER.postDelayed(() -> {
                if (generation != RECOVERY_GENERATION.get()) return;
                if (XzbPaymentNotificationService.isListenerConnected() || !hasAccess(appContext)) return;
                requestRebind(appContext, false);
            }, delay);
        }
    }

    static void cancelRecovery() {
        RECOVERY_GENERATION.incrementAndGet();
    }

    static ComponentName listenerComponent(Context context) {
        return new ComponentName(context.getApplicationContext(), XzbNotificationListenerService.class);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
    }
}
