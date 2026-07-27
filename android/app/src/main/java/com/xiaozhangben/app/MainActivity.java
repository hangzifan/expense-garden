package com.xiaozhangben.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(XzbOcrPlugin.class);
        registerPlugin(XzbNotifyPlugin.class);
        registerPlugin(XzbBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (XzbNotificationConnectionManager.hasAccess(this)
            && !XzbPaymentNotificationService.isListenerConnected()) {
            XzbNotificationConnectionManager.scheduleRecovery(this);
        }
    }
}
