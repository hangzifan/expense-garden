package com.xiaozhangben.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
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
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

@CapacitorPlugin(name = "XzbOcr")
public class XzbOcrPlugin extends Plugin {
    private static final int MAX_PICKED_IMAGES = 12;

    @PluginMethod
    public void pickImageAndRecognize(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImageResult");
    }

    @PluginMethod
    public void pickImage(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImageOnlyResult");
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImagesResult");
    }

    @PluginMethod
    public void recognizeImage(PluginCall call) {
        String dataUrl = call.getString("dataUrl", "");
        if (dataUrl == null || dataUrl.trim().isEmpty()) {
            call.reject("没有图片内容");
            return;
        }

        String base64 = dataUrl;
        int commaIndex = dataUrl.indexOf(',');
        if (commaIndex >= 0) {
            base64 = dataUrl.substring(commaIndex + 1);
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("无法读取图片内容");
                return;
            }
            processImage(call, InputImage.fromBitmap(prepareBitmapForOcr(bitmap), 0), null);
        } catch (IllegalArgumentException error) {
            call.reject("图片格式不正确", error);
        }
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
            processImage(call, image, uri.toString());
        } catch (IOException error) {
            call.reject("读取图片失败", error);
        }
    }

    @ActivityCallback
    private void pickImageOnlyResult(PluginCall call, ActivityResult result) {
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
            call.resolve(readImageAsObject(uri));
        } catch (IOException error) {
            call.reject("读取图片失败", error);
        }
    }

    @ActivityCallback
    private void pickImagesResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("没有选择图片");
            return;
        }

        try {
            JSArray images = new JSArray();
            ClipData clipData = data.getClipData();
            if (clipData != null) {
                int count = Math.min(clipData.getItemCount(), MAX_PICKED_IMAGES);
                for (int i = 0; i < count; i++) {
                    Uri uri = clipData.getItemAt(i).getUri();
                    if (uri != null) {
                        images.put(readImageAsObject(uri));
                    }
                }
            } else if (data.getData() != null) {
                images.put(readImageAsObject(data.getData()));
            }

            if (images.length() == 0) {
                call.reject("没有读到图片内容");
                return;
            }

            JSObject ret = new JSObject();
            ret.put("images", images);
            call.resolve(ret);
        } catch (IOException error) {
            call.reject("读取图片失败", error);
        }
    }

    private void processImage(PluginCall call, InputImage image, String uri) {
        TextRecognizer recognizer = TextRecognition.getClient(
            new ChineseTextRecognizerOptions.Builder().build()
        );

        recognizer.process(image)
            .addOnSuccessListener(text -> {
                JSObject ret = new JSObject();
                ret.put("text", text.getText());
                if (uri != null) {
                    ret.put("uri", uri);
                }
                call.resolve(ret);
                recognizer.close();
            })
            .addOnFailureListener(error -> {
                call.reject("OCR 识别失败", error);
                recognizer.close();
            });
    }

    private byte[] readUriBytes(Uri uri) throws IOException {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) {
                throw new IOException("openInputStream returned null");
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private JSObject readImageAsObject(Uri uri) throws IOException {
        String mimeType = getContext().getContentResolver().getType(uri);
        if (mimeType == null || mimeType.trim().isEmpty()) {
            mimeType = "image/jpeg";
        }
        byte[] bytes = readUriBytes(uri);
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("dataUrl", "data:" + mimeType + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        return ret;
    }

    private Bitmap prepareBitmapForOcr(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int longSide = Math.max(width, height);
        int targetLongSide = longSide;

        if (longSide < 1800) {
            targetLongSide = 1800;
        } else if (longSide > 2600) {
            targetLongSide = 2600;
        }

        if (targetLongSide == longSide) {
            return bitmap;
        }

        float scale = (float) targetLongSide / (float) longSide;
        int targetWidth = Math.max(1, Math.round(width * scale));
        int targetHeight = Math.max(1, Math.round(height * scale));
        return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true);
    }
}
