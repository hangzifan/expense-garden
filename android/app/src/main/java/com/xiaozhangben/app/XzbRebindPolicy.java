package com.xiaozhangben.app;

final class XzbRebindPolicy {
    static final long NORMAL_COOLDOWN_MS = 5_000L;
    static final long FORCED_COOLDOWN_MS = 1_000L;
    static final long[] RECOVERY_DELAYS_MS = { 3_000L, 10_000L, 30_000L };

    private XzbRebindPolicy() {}

    static boolean shouldRequest(long now, long previousRequestAt, boolean force) {
        if (previousRequestAt <= 0) return true;
        long cooldown = force ? FORCED_COOLDOWN_MS : NORMAL_COOLDOWN_MS;
        return now - previousRequestAt >= cooldown;
    }
}
