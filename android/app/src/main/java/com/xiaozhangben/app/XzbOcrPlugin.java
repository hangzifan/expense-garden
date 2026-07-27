package com.xiaozhangben.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "XzbOcr")
public class XzbOcrPlugin extends Plugin {
    private static final int MAX_PICKED_IMAGES = 12;
    // Decode/enhance work runs off the WebView and UI threads; ML Kit callbacks stay async.
    private static final ExecutorService OCR_EXECUTOR = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
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
        final String payload = base64;

        OCR_EXECUTOR.execute(() -> {
            try {
                byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    call.reject("无法读取图片内容");
                    return;
                }
                processBitmap(call, bitmap, null);
            } catch (IllegalArgumentException error) {
                call.reject("图片格式不正确", error);
            }
        });
    }

    @PluginMethod
    public void recognizeUri(PluginCall call) {
        String uriValue = call.getString("uri", "");
        if (uriValue == null || uriValue.trim().isEmpty()) {
            call.reject("没有图片地址");
            return;
        }

        OCR_EXECUTOR.execute(() -> {
            try {
                Bitmap bitmap = decodeUriBitmap(Uri.parse(uriValue));
                Bitmap cropped = cropBitmap(bitmap, call.getObject("crop"));
                if (cropped != bitmap) {
                    safeRecycle(bitmap);
                }
                processBitmap(call, cropped, uriValue);
            } catch (IOException | IllegalArgumentException error) {
                call.reject("读取裁剪图片失败", error);
            }
        });
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

        OCR_EXECUTOR.execute(() -> {
            try {
                JSArray images = new JSArray();
                ClipData clipData = data.getClipData();
                if (clipData != null) {
                    int count = Math.min(clipData.getItemCount(), MAX_PICKED_IMAGES);
                    for (int i = 0; i < count; i++) {
                        Uri uri = clipData.getItemAt(i).getUri();
                        if (uri != null) {
                            persistReadPermission(data, uri);
                            images.put(readImageMetadata(uri));
                        }
                    }
                } else if (data.getData() != null) {
                    persistReadPermission(data, data.getData());
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
        });
    }

    private void processBitmap(PluginCall call, Bitmap bitmap, String uri) {
        TextRecognizer recognizer = TextRecognition.getClient(
            new ChineseTextRecognizerOptions.Builder().build()
        );
        Bitmap colorBitmap = scaleBitmapForOcr(bitmap);
        if (colorBitmap != bitmap) {
            safeRecycle(bitmap);
        }
        Bitmap enhancedBitmap = enhanceBitmapForOcr(colorBitmap);
        InputImage colorImage = InputImage.fromBitmap(colorBitmap, 0);

        recognizer.process(colorImage)
            .addOnSuccessListener(colorText -> {
                InputImage enhancedImage = InputImage.fromBitmap(enhancedBitmap, 0);
                recognizer.process(enhancedImage)
                    .addOnSuccessListener(enhancedText -> resolveBestOcr(
                        call, recognizer, colorBitmap, enhancedBitmap,
                        colorText.getText(), enhancedText.getText(), uri
                    ))
                    .addOnFailureListener(error -> resolveBestOcr(
                        call, recognizer, colorBitmap, enhancedBitmap,
                        colorText.getText(), "", uri
                    ));
            })
            .addOnFailureListener(error -> {
                InputImage enhancedImage = InputImage.fromBitmap(enhancedBitmap, 0);
                recognizer.process(enhancedImage)
                    .addOnSuccessListener(enhancedText -> resolveBestOcr(
                        call, recognizer, colorBitmap, enhancedBitmap,
                        "", enhancedText.getText(), uri
                    ))
                    .addOnFailureListener(enhancedError -> {
                        call.reject("OCR 识别失败", enhancedError);
                        safeRecycle(colorBitmap);
                        safeRecycle(enhancedBitmap);
                        recognizer.close();
                    });
            });
    }

    private void resolveBestOcr(
        PluginCall call,
        TextRecognizer recognizer,
        Bitmap colorBitmap,
        Bitmap enhancedBitmap,
        String colorText,
        String enhancedText,
        String uri
    ) {
        JSObject ret = new JSObject();
        ret.put("text", chooseBestOcrText(colorText, enhancedText));
        if (uri != null) {
            ret.put("uri", uri);
        }
        call.resolve(ret);
        safeRecycle(colorBitmap);
        safeRecycle(enhancedBitmap);
        recognizer.close();
    }

    private void persistReadPermission(Intent data, Uri uri) {
        if (data == null || uri == null) return;
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0) {
            flags |= Intent.FLAG_GRANT_READ_URI_PERMISSION;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException ignored) {
            // Some gallery providers grant access for the current app session only.
        }
    }

    private Bitmap decodeUriBitmap(Uri uri) throws IOException {
        int rotationDegrees = readExifRotation(uri);
        Bitmap bitmap;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) {
                throw new IOException("openInputStream returned null");
            }
            bitmap = BitmapFactory.decodeStream(input);
        }
        if (bitmap == null) {
            throw new IOException("Unable to decode bitmap");
        }
        if (rotationDegrees == 0) {
            return bitmap;
        }
        Matrix matrix = new Matrix();
        matrix.postRotate(rotationDegrees);
        Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        if (rotated != bitmap) {
            safeRecycle(bitmap);
        }
        return rotated;
    }

    // Camera photos of paper receipts carry EXIF orientation; screenshots are unaffected.
    private int readExifRotation(Uri uri) {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return 0;
            ExifInterface exif = new ExifInterface(input);
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                default:
                    return 0;
            }
        } catch (IOException error) {
            return 0;
        }
    }

    private JSObject readImageMetadata(Uri uri) throws IOException {
        Bitmap source = decodeUriBitmap(uri);
        Bitmap preview = source;
        int longSide = Math.max(source.getWidth(), source.getHeight());
        if (longSide > 960) {
            float scale = 960f / (float) longSide;
            preview = Bitmap.createScaledBitmap(
                source,
                Math.max(1, Math.round(source.getWidth() * scale)),
                Math.max(1, Math.round(source.getHeight() * scale)),
                true
            );
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!preview.compress(Bitmap.CompressFormat.JPEG, 82, output)) {
            if (preview != source) safeRecycle(preview);
            safeRecycle(source);
            throw new IOException("Unable to create image preview");
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
        ret.put("width", source.getWidth());
        ret.put("height", source.getHeight());
        if (preview != source) safeRecycle(preview);
        safeRecycle(source);
        return ret;
    }

    private Bitmap scaleBitmapForOcr(Bitmap bitmap) {
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

        return scaled;
    }

    private Bitmap cropBitmap(Bitmap bitmap, JSObject crop) {
        if (crop == null) return bitmap;
        double x = clampPercent(crop.optDouble("x", 0));
        double y = clampPercent(crop.optDouble("y", 0));
        double widthPercent = Math.max(1, Math.min(100 - x, crop.optDouble("width", 100)));
        double heightPercent = Math.max(1, Math.min(100 - y, crop.optDouble("height", 100)));
        int left = Math.min(bitmap.getWidth() - 1, Math.max(0, (int) Math.floor(bitmap.getWidth() * x / 100d)));
        int top = Math.min(bitmap.getHeight() - 1, Math.max(0, (int) Math.floor(bitmap.getHeight() * y / 100d)));
        int width = Math.max(1, Math.min(bitmap.getWidth() - left, (int) Math.ceil(bitmap.getWidth() * widthPercent / 100d)));
        int height = Math.max(1, Math.min(bitmap.getHeight() - top, (int) Math.ceil(bitmap.getHeight() * heightPercent / 100d)));
        if (left == 0 && top == 0 && width == bitmap.getWidth() && height == bitmap.getHeight()) return bitmap;
        return Bitmap.createBitmap(bitmap, left, top, width, height);
    }

    private double clampPercent(double value) {
        return Math.max(0d, Math.min(100d, value));
    }

    private String chooseBestOcrText(String colorText, String enhancedText) {
        String color = colorText == null ? "" : colorText.trim();
        String enhanced = enhancedText == null ? "" : enhancedText.trim();
        if (color.isEmpty()) return enhanced;
        if (enhanced.isEmpty()) return color;
        return scoreOcrText(enhanced) > scoreOcrText(color) ? enhanced : color;
    }

    private int scoreOcrText(String text) {
        int score = Math.min(80, text.length());
        if (text.matches("(?s).*[￥¥]\\s*[0-9][0-9,]*(?:\\.[0-9]{1,2})?.*")) score += 48;
        if (text.matches("(?s).*(金额|实付|付款|支付|交易|消费|收款).*")) score += 28;
        if (text.matches("(?s).*(收款方|商户名称|商家名称|交易对象|交易对方|付款给|支付给).*")) score += 72;
        if (text.matches("(?s).*(微信|支付宝|银行卡|零钱|花呗).*")) score += 18;
        if (text.matches("(?s).*20[0-9]{2}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}.*")) score += 24;
        score += Math.min(20, text.split("\\r?\\n").length * 2);
        return score;
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
