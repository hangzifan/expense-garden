package com.xiaozhangben.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class XzbRebindPolicyTest {
    @Test
    public void allowsTheFirstRebindRequest() {
        assertTrue(XzbRebindPolicy.shouldRequest(10_000L, 0L, false));
    }

    @Test
    public void throttlesRepeatedAutomaticAndForcedRequests() {
        assertFalse(XzbRebindPolicy.shouldRequest(12_000L, 10_000L, false));
        assertFalse(XzbRebindPolicy.shouldRequest(10_500L, 10_000L, true));
    }

    @Test
    public void allowsAnotherRequestAfterTheCooldown() {
        assertTrue(XzbRebindPolicy.shouldRequest(15_000L, 10_000L, false));
        assertTrue(XzbRebindPolicy.shouldRequest(11_000L, 10_000L, true));
    }
}
