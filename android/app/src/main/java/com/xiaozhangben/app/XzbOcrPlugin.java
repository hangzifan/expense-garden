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
import java.util.ArrayList;
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
    public void pickImagesAndRecognize(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImagesRecognizeResult");
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
            processBitmap(call, bitmap, null);
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
            Bitmap bitmap = decodeUriBitmap(uri);
            processBitmap(call, bitmap, uri.toString());
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
                    if (uri != null) images.put(readImageMetadata(uri));
                }
            } else if (data.getData() != null) {
                images.put(readImageMetadata(data.getData()));
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

    @ActivityCallback
    private void pickImagesRecognizeResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("没有选择图片");
            return;
        }

        ArrayList<Uri> uris = collectImageUris(data);
        if (uris.isEmpty()) {
            call.reject("没有读到图片内容");
            return;
        }

        TextRecognizer recognizer = TextRecognition.getClient(
            new ChineseTextRecognizerOptions.Builder().build()
        );
        recognizeUriAt(call, recognizer, uris, 0, new JSArray());
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

    private void processBitmap(PluginCall call, Bitmap bitmap, String uri) {
        TextRecognizer recognizer = TextRecognition.getClient(
            new ChineseTextRecognizerOptions.Builder().build()
        );
        Bitmap ocrBitmap = prepareBitmapForOcr(bitmap);
        if (ocrBitmap != bitmap) {
            safeRecycle(bitmap);
        }
        InputImage image = InputImage.fromBitmap(ocrBitmap, 0);

        recognizer.process(image)
            .addOnSuccessListener(text -> {
                JSObject ret = new JSObject();
                ret.put("text", text.getText());
                if (uri != null) {
                    ret.put("uri", uri);
                }
                call.resolve(ret);
                safeRecycle(ocrBitmap);
                recognizer.close();
            })
            .addOnFailureListener(error -> {
                call.reject("OCR 识别失败", error);
                safeRecycle(ocrBitmap);
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

    private ArrayList<Uri> collectImageUris(Intent data) {
        ArrayList<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            int count = Math.min(clipData.getItemCount(), MAX_PICKED_IMAGES);
            for (int i = 0; i < count; i++) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    private void recognizeUriAt(PluginCall call, TextRecognizer recognizer, ArrayList<Uri> uris, int index, JSArray results) {
        if (index >= uris.size()) {
            JSObject ret = new JSObject();
            ret.put("results", results);
            call.resolve(ret);
            recognizer.close();
            return;
        }

        Uri uri = uris.get(index);
        try {
            Bitmap bitmap = decodeUriBitmap(uri);
            Bitmap ocrBitmap = prepareBitmapForOcr(bitmap);
            if (ocrBitmap != bitmap) {
                safeRecycle(bitmap);
            }
            InputImage image = InputImage.fromBitmap(ocrBitmap, 0);
            recognizer.process(image)
                .addOnSuccessListener(text -> {
                    JSObject item = new JSObject();
                    item.put("uri", uri.toString());
                    item.put("text", text.getText());
                    results.put(item);
                    safeRecycle(ocrBitmap);
                    recognizeUriAt(call, recognizer, uris, index + 1, results);
                })
                .addOnFailureListener(error -> {
                    JSObject item = new JSObject();
                    item.put("uri", uri.toString());
                    item.put("text", "");
                    item.put("error", error.getMessage());
                    results.put(item);
                    safeRecycle(ocrBitmap);
                    recognizeUriAt(call, recognizer, uris, index + 1, results);
                });
        } catch (IOException error) {
            JSObject item = new JSObject();
            item.put("uri", uri.toString());
            item.put("text", "");
            item.put("error", error.getMessage());
            results.put(item);
            recognizeUriAt(call, recognizer, uris, index + 1, results);
        }
    }

    private Bitmap decodeUriBitmap(Uri uri) throws IOException {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) {
                throw new IOException("openInputStream returned null");
            }
            Bitmap bitmap = BitmapFactory.decodeStream(input);
            if (bitmap == null) {
                throw new IOException("Unable to decode bitmap");
            }
            return bitmap;
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

    private JSObject readImageMetadata(Uri uri) throws IOException {
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
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

        Bitmap scaled = bitmap;

        if (targetLongSide != longSide) {
            float scale = (float) targetLongSide / (float) longSide;
            int targetWidth = Math.max(1, Math.round(width * scale));
            int targetHeight = Math.max(1, Math.round(height * scale));
            scaled = Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true);
        }

        Bitmap enhanced = enhanceBitmapForOcr(scaled);
        if (enhanced != scaled && scaled != bitmap) {
            safeRecycle(scaled);
        }
        return enhanced;
    }

    private Bitmap enhanceBitmapForOcr(Bitmap bitmap) {
        Bitmap mutable = bitmap.copy(Bitmap.Config.ARGB_8888, true);
        int width = mutable.getWidth();
        int height = mutable.getHeight();
        int[] pixels = new int[width * height];
        mutable.getPixels(pixels, 0, width, 0, 0, width, height);

        for (int i = 0; i < pixels.length; i++) {
            int color = pixels[i];
            int alpha = (color >>> 24) & 0xff;
            int red = (color >>> 16) & 0xff;
            int green = (color >>> 8) & 0xff;
            int blue = color & 0xff;
            int gray = Math.round((float) (red * 0.299 + green * 0.587 + blue * 0.114));
            int contrasted = clamp(Math.round((gray - 128) * 1.18f + 128));
            int value = contrasted > 238 ? 255 : (contrasted < 28 ? 0 : contrasted);
            pixels[i] = (alpha << 24) | (value << 16) | (value << 8) | value;
        }

        mutable.setPixels(pixels, 0, width, 0, 0, width, height);
        return mutable;
    }

    private int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private void safeRecycle(Bitmap bitmap) {
        if (bitmap != null && !bitmap.isRecycled()) {
            bitmap.recycle();
        }
    }
}
