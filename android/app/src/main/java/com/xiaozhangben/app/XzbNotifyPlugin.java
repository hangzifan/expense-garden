package com.xiaozhangben.app;

import android.content.Intent;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;

@CapacitorPlugin(name = "XzbNotify")
public class XzbNotifyPlugin extends Plugin {
    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        boolean enabled = NotificationManagerCompat
            .getEnabledListenerPackages(getContext())
            .contains(getContext().getPackageName());
        ret.put("enabled", enabled);
        call.resolve(ret);
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
            call.resolve(ret);
        } catch (IOException error) {
            call.reject("读取通知账单失败", error);
        }
    }
}
