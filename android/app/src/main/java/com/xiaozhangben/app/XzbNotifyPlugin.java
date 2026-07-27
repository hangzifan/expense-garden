package com.xiaozhangben.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "XzbNotify",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class XzbNotifyPlugin extends Plugin {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void isEnabled(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void reconnect(PluginCall call) {
        if (!isAccessEnabled() || XzbPaymentNotificationService.isListenerConnected()) {
            call.resolve(buildStatus());
            return;
        }
        XzbNotificationConnectionManager.scheduleRecovery(getContext());
        mainHandler.postDelayed(() -> call.resolve(buildStatus()), 900L);
    }

    @PluginMethod
    public void requestQuickConfirmPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("notifications", call, "quickConfirmPermissionCallback");
    }

    @PermissionCallback
    public void quickConfirmPermissionCallback(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void updateMerchantProfiles(PluginCall call) {
        try {
            JSArray profiles = call.getArray("profiles");
            XzbMerchantProfileStore.update(getContext(), profiles == null ? new JSONArray() : profiles);
            call.resolve(buildStatus());
        } catch (Exception error) {
            call.reject("保存本地商户画像失败", error);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        ComponentName component = getListenerComponent();
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                intent.putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    component.flattenToString()
                );
            } else {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            try {
                Intent fallback = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (ActivityNotFoundException fallbackError) {
                call.reject("无法打开通知使用权设置", fallbackError);
            }
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("无法打开应用后台设置", error);
        }
    }

    @PluginMethod
    public void runSelfTest(PluginCall call) {
        try {
            JSONObject item = new JSONObject();
            item.put("id", "notification-self-test-" + System.currentTimeMillis());
            item.put("packageName", "com.tencent.mm");
            item.put("appName", "微信");
            item.put("postTime", System.currentTimeMillis());
            item.put("title", "微信支付");
            item.put("rawText", "微信支付\n付款成功 ¥0.01\n收款方：通知链路测试");
            item.put("amount", 0.01);
            item.put("merchant", "通知链路测试");
            item.put("merchantMissing", false);
            item.put("accepted", true);
            item.put("test", true);
            item.put("captureSource", "self_test");
            XzbNotificationStore.enqueue(getContext(), item);

            JSObject result = new JSObject();
            result.put("items", XzbNotificationStore.drain(getContext()));
            result.put("status", buildStatus());
            call.resolve(result);
        } catch (JSONException | IOException error) {
            call.reject("通知链路自检失败", error);
        }
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
        return XzbNotificationConnectionManager.hasAccess(getContext());
    }

    private ComponentName getListenerComponent() {
        return XzbNotificationConnectionManager.listenerComponent(getContext());
    }

    private JSObject buildStatus() {
        boolean enabled = isAccessEnabled();
        boolean connected = XzbPaymentNotificationService.isListenerConnected();
        JSObject result = new JSObject();
        JSONObject capture = XzbPaymentNotificationService.getCaptureStatus(getContext());
        result.put("enabled", enabled);
        result.put("connected", connected);
        result.put("recovering", enabled && !connected);
        result.put("quickConfirmEnabled", XzbQuickConfirmationNotifier.isEnabled(getContext()));
        result.put("lastConnectedAt", capture.optLong("lastConnectedAt", 0L));
        result.put("lastDisconnectedAt", capture.optLong("lastDisconnectedAt", 0L));
        result.put("lastSeenAt", capture.optLong("lastSeenAt", 0L));
        result.put("lastAcceptedAt", capture.optLong("lastAcceptedAt", 0L));
        result.put("lastDraftAt", capture.optLong("lastDraftAt", 0L));
        result.put("lastRebindRequestAt", capture.optLong("lastRebindRequestAt", 0L));
        result.put("lastRebindFailedAt", capture.optLong("lastRebindFailedAt", 0L));
        result.put("lastServiceDestroyedAt", capture.optLong("lastServiceDestroyedAt", 0L));
        result.put("rebindRequestCount", capture.optInt("rebindRequestCount", 0));
        result.put("lastPackage", capture.optString("lastPackage", ""));
        result.put("lastTextLength", capture.optInt("lastTextLength", 0));
        result.put("lastReason", capture.optString("lastReason", "never_seen"));
        result.put("profileCount", capture.optInt("profileCount", 0));
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("listenerComponent", getListenerComponent().flattenToString());
        try {
            result.put("queueCount", XzbNotificationStore.count(getContext()));
        } catch (IOException ignored) {
            result.put("queueCount", 0);
        }
        return result;
    }
}
