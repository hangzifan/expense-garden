package com.xiaozhangben.app;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class XzbNotificationStore {
    private static final String QUEUE_DIR = "notification_queue";
    private static final int MAX_QUEUE_FILES = 200;

    private XzbNotificationStore() {}

    static void enqueue(Context context, JSONObject item) throws IOException {
        File dir = getQueueDir(context);
        String name = System.currentTimeMillis() + "-" + UUID.randomUUID() + ".json";
        File tempFile = new File(dir, name + ".tmp");
        File targetFile = new File(dir, name);
        byte[] bytes = item.toString().getBytes(StandardCharsets.UTF_8);

        try (FileOutputStream output = new FileOutputStream(tempFile)) {
            output.write(bytes);
            output.getFD().sync();
        }

        if (!tempFile.renameTo(targetFile)) {
            tempFile.delete();
            throw new IOException("Unable to commit notification entry");
        }
        pruneQueue(dir);
    }

    static JSONArray drain(Context context) throws IOException {
        File dir = getQueueDir(context);
        File[] files = dir.listFiles((file, name) -> name.endsWith(".json"));
        JSONArray items = new JSONArray();
        if (files == null || files.length == 0) {
            return items;
        }

        Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        for (File file : files) {
            try {
                String raw = readFile(file);
                items.put(new JSONObject(raw));
                file.delete();
            } catch (JSONException | IOException error) {
                quarantineFile(file);
            }
        }
        return items;
    }

    private static void pruneQueue(File dir) {
        File[] files = dir.listFiles((file, name) -> name.endsWith(".json"));
        if (files == null || files.length <= MAX_QUEUE_FILES) {
            return;
        }

        Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        int removeCount = files.length - MAX_QUEUE_FILES;
        for (int i = 0; i < removeCount; i++) {
            files[i].delete();
        }
    }

    private static void quarantineFile(File file) {
        File badFile = new File(file.getParentFile(), file.getName() + ".bad");
        if (!file.renameTo(badFile)) {
            file.delete();
        }
    }

    private static File getQueueDir(Context context) throws IOException {
        File dir = new File(context.getFilesDir(), QUEUE_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Unable to create notification queue");
        }
        return dir;
    }

    private static String readFile(File file) throws IOException {
        try (FileInputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
