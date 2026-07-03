package com.xiaozhangben.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

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
        SharedPreferences prefs = getContext().getSharedPreferences(XzbNotificationStore.PREFS, android.content.Context.MODE_PRIVATE);
        String raw = prefs.getString(XzbNotificationStore.KEY_ITEMS, "[]");

        try {
            JSObject ret = new JSObject();
            ret.put("items", new JSArray(raw));
            prefs.edit().putString(XzbNotificationStore.KEY_ITEMS, "[]").apply();
            call.resolve(ret);
        } catch (JSONException error) {
            prefs.edit().putString(XzbNotificationStore.KEY_ITEMS, "[]").apply();
            call.reject("读取通知账单失败", error);
        }
    }
}
