package com.xiaozhangben.app;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import org.json.JSONObject;

@CapacitorPlugin(name = "XzbNotify")
public class XzbNotifyPlugin extends Plugin {
    @PluginMethod
    public void isEnabled(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void reconnect(PluginCall call) {
        if (isAccessEnabled()) {
            NotificationListenerService.requestRebind(
                new ComponentName(getContext(), XzbNotificationListenerService.class)
            );
        }
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void drainNotifications(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("items", XzbNotificationStore.drain(getContext()));
            ret.put("status", buildStatus());
            call.resolve(ret);
        } catch (IOException error) {
            call.reject("读取通知账单失败", error);
        }
    }

    private boolean isAccessEnabled() {
        return NotificationManagerCompat
            .getEnabledListenerPackages(getContext())
            .contains(getContext().getPackageName());
    }

    private JSObject buildStatus() {
        boolean enabled = isAccessEnabled();
        if (enabled && !XzbPaymentNotificationService.isListenerConnected()) {
            NotificationListenerService.requestRebind(
                new ComponentName(getContext(), XzbNotificationListenerService.class)
            );
        }

        JSObject result = new JSObject();
        JSONObject capture = XzbPaymentNotificationService.getCaptureStatus(getContext());
        result.put("enabled", enabled);
        result.put("connected", capture.optBoolean("connected", false));
        result.put("lastConnectedAt", capture.optLong("lastConnectedAt", 0L));
        result.put("lastDisconnectedAt", capture.optLong("lastDisconnectedAt", 0L));
        result.put("lastSeenAt", capture.optLong("lastSeenAt", 0L));
        result.put("lastAcceptedAt", capture.optLong("lastAcceptedAt", 0L));
        result.put("lastPackage", capture.optString("lastPackage", ""));
        result.put("lastReason", capture.optString("lastReason", "never_seen"));
        try {
            result.put("queueCount", XzbNotificationStore.count(getContext()));
        } catch (IOException ignored) {
            result.put("queueCount", 0);
        }
        return result;
    }
}
