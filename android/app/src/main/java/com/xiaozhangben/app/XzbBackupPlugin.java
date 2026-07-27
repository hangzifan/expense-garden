package com.xiaozhangben.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

// Mirrors the WebView ledger into the app's private files dir so that
// WebView storage loss (engine update, aggressive cleaners) is recoverable.
@CapacitorPlugin(name = "XzbBackup")
public class XzbBackupPlugin extends Plugin {
    private static final String BACKUP_FILE = "ledger_backup.json";

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.trim().isEmpty()) {
            call.reject("没有可备份的数据");
            return;
        }
        try {
            AtomicFile atomicFile = new AtomicFile(new File(getContext().getFilesDir(), BACKUP_FILE));
            byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
            FileOutputStream output = null;
            try {
                output = atomicFile.startWrite();
                output.write(bytes);
                output.getFD().sync();
                atomicFile.finishWrite(output);
            } catch (IOException error) {
                if (output != null) atomicFile.failWrite(output);
                throw error;
            }
            JSObject result = new JSObject();
            result.put("savedAt", System.currentTimeMillis());
            result.put("bytes", bytes.length);
            call.resolve(result);
        } catch (IOException error) {
            call.reject("写入本地备份失败", error);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        File targetFile = new File(getContext().getFilesDir(), BACKUP_FILE);
        JSObject result = new JSObject();
        if (!targetFile.exists()) {
            result.put("exists", false);
            result.put("data", "");
            call.resolve(result);
            return;
        }
        AtomicFile atomicFile = new AtomicFile(targetFile);
        try (FileInputStream input = atomicFile.openRead();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            result.put("exists", true);
            result.put("data", output.toString(StandardCharsets.UTF_8.name()));
            result.put("modifiedAt", targetFile.lastModified());
            call.resolve(result);
        } catch (IOException error) {
            call.reject("读取本地备份失败", error);
        }
    }
}
