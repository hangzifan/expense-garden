package com.xiaozhangben.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.io.IOException;

@CapacitorPlugin(name = "XzbOcr")
public class XzbOcrPlugin extends Plugin {
    @PluginMethod
    public void pickImageAndRecognize(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImageResult");
    }

    @ActivityCallback
    private void pickImageResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("没有选择图片");
            return;
        }

        Uri uri = data.getData();
        try {
            InputImage image = InputImage.fromFilePath(getContext(), uri);
            TextRecognizer recognizer = TextRecognition.getClient(
                new ChineseTextRecognizerOptions.Builder().build()
            );

            recognizer.process(image)
                .addOnSuccessListener(text -> {
                    JSObject ret = new JSObject();
                    ret.put("text", text.getText());
                    ret.put("uri", uri.toString());
                    call.resolve(ret);
                    recognizer.close();
                })
                .addOnFailureListener(error -> {
                    call.reject("OCR 识别失败", error);
                    recognizer.close();
                });
        } catch (IOException error) {
            call.reject("读取图片失败", error);
        }
    }
}
