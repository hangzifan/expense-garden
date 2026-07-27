package com.xiaozhangben.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class XzbMerchantProfileStore {
    private static final String PREFS = "xzb_merchant_profiles";
    private static final String KEY = "profiles";

    private XzbMerchantProfileStore() {}

    static void update(Context context, JSONArray profiles) {
        JSONArray safe = profiles == null ? new JSONArray() : profiles;
        getPreferences(context).edit().putString(KEY, safe.toString()).apply();
    }

    static int count(Context context) {
        return readProfiles(context).length();
    }

    static JSONArray suggest(Context context, double amount, String method, long postTime) {
        JSONArray profiles = readProfiles(context);
        List<JSONObject> candidates = new ArrayList<>();
        for (int index = 0; index < profiles.length(); index++) {
            JSONObject profile = profiles.optJSONObject(index);
            if (profile == null) continue;
            JSONObject scored = score(profile, amount, method, postTime);
            if (scored.optInt("score", 0) >= 38) candidates.add(scored);
        }
        Collections.sort(candidates, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject left, JSONObject right) {
                int score = Integer.compare(right.optInt("score", 0), left.optInt("score", 0));
                return score != 0 ? score : Integer.compare(right.optInt("samples", 0), left.optInt("samples", 0));
            }
        });
        JSONArray result = new JSONArray();
        for (int index = 0; index < Math.min(3, candidates.size()); index++) {
            result.put(candidates.get(index));
        }
        return result;
    }

    private static JSONObject score(JSONObject profile, double amount, String method, long postTime) {
        JSONObject result = new JSONObject();
        try {
            int exactCount = countAmount(profile.optJSONArray("amounts"), amount);
            double nearRatio = nearestAmountRatio(profile.optJSONArray("amounts"), amount);
            int methodCount = countValue(profile.optJSONArray("methods"), method);
            int hour = hourOf(postTime);
            int weekday = weekdayOf(postTime);
            int hourCount = hour < 0 ? 0 : countValue(profile.optJSONArray("hours"), String.valueOf(hour));
            int weekdayCount = weekday < 0 ? 0 : countValue(profile.optJSONArray("weekdays"), String.valueOf(weekday));
            int samples = Math.max(0, profile.optInt("count", 0));
            int amountScore = exactCount > 0
                ? 44 + Math.min(exactCount, 4) * 7
                : nearRatio <= 0.03 ? 24 : 0;
            int score = amountScore
                + (methodCount > 0 ? 15 + Math.min(methodCount, 3) * 2 : 0)
                + (hourCount > 0 ? 8 + Math.min(hourCount, 3) * 2 : 0)
                + (weekdayCount > 0 ? 5 : 0)
                + Math.min(samples, 6) * 2;
            int confidence = Math.min(97, Math.round(45 + score * 0.5f));
            result.put("name", profile.optString("name", ""));
            result.put("category", profile.optString("category", "other"));
            result.put("method", profile.optString("method", "其他"));
            result.put("score", score);
            result.put("confidence", confidence);
            result.put("samples", samples);
            result.put("exactAmountCount", exactCount);
            result.put("highConfidence", exactCount >= 2 && score >= 78);
        } catch (JSONException ignored) {
            // A malformed local profile is ignored by returning a zero-score candidate.
        }
        return result;
    }

    private static JSONArray readProfiles(Context context) {
        String raw = getPreferences(context).getString(KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static int countAmount(JSONArray values, double amount) {
        if (values == null) return 0;
        String expected = String.format(java.util.Locale.US, "%.2f", amount);
        for (int index = 0; index < values.length(); index++) {
            JSONObject item = values.optJSONObject(index);
            if (item != null && expected.equals(item.optString("value", ""))) {
                return item.optInt("count", 0);
            }
        }
        return 0;
    }

    private static double nearestAmountRatio(JSONArray values, double amount) {
        if (values == null || values.length() == 0 || amount <= 0) return 1;
        double nearest = Double.MAX_VALUE;
        for (int index = 0; index < values.length(); index++) {
            JSONObject item = values.optJSONObject(index);
            if (item == null) continue;
            try {
                nearest = Math.min(nearest, Math.abs(item.optDouble("value", amount) - amount));
            } catch (Exception ignored) {
                // Ignore malformed amount entries.
            }
        }
        return nearest == Double.MAX_VALUE ? 1 : nearest / Math.max(amount, 1);
    }

    private static int countValue(JSONArray values, String value) {
        if (values == null) return 0;
        for (int index = 0; index < values.length(); index++) {
            JSONObject item = values.optJSONObject(index);
            if (item != null && value.equals(item.optString("value", ""))) {
                return item.optInt("count", 0);
            }
        }
        return 0;
    }

    private static int hourOf(long timestamp) {
        if (timestamp <= 0) return -1;
        java.util.Calendar calendar = java.util.Calendar.getInstance();
        calendar.setTimeInMillis(timestamp);
        return calendar.get(java.util.Calendar.HOUR_OF_DAY);
    }

    private static int weekdayOf(long timestamp) {
        if (timestamp <= 0) return -1;
        java.util.Calendar calendar = java.util.Calendar.getInstance();
        calendar.setTimeInMillis(timestamp);
        return calendar.get(java.util.Calendar.DAY_OF_WEEK) - 1;
    }
}
