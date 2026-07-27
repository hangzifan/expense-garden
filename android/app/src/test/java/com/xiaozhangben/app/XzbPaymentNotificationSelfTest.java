package com.xiaozhangben.app;

import org.junit.Test;

public final class XzbPaymentNotificationSelfTest {
    private static final String WECHAT = "com.tencent.mm";
    private static final String ALIPAY = "com.eg.android.AlipayGphone";

    public XzbPaymentNotificationSelfTest() {}

    public static void main(String[] args) {
        runChecks();
        System.out.println("notification classifier: 23 checks passed");
    }

    @Test
    public void classifiesPaymentNotificationsWithoutAcceptingAdsOrChats() {
        runChecks();
    }

    private static void runChecks() {
        expect(null, WECHAT, "微信支付", "微信支付\n付款成功 ¥28.80\n收款方：茶百道");
        expect(null, WECHAT, "微信支付", "微信支付\n已支付 10 元\n商户名称：便利店");
        expect(null, WECHAT, "微信", "微信\n微信支付\n付款成功 ¥18.00");
        expect(null, WECHAT, "微信支付", "支付金额\n¥36.00\n收款方：城市便利店");
        expect(null, WECHAT, "收款助手", "收款方：早餐店\n¥8.50\n交易时间 08:21");
        expect(null, ALIPAY, "支付宝", "支付宝\n你有一笔15元支出\n商户：杭州地铁");
        expect(null, ALIPAY, "服务提醒", "商户：地铁出行\n支付金额 ¥3.00\n订单 20260718");
        // Relies specifically on the trusted Alipay title branch: amount and
        // receipt details exist, but no transaction keyword is near the amount.
        expect(null, ALIPAY, "支付宝", "商户：社区超市\n订单号：20260727001\n金额：¥18.00");
        expect("ad_filtered", WECHAT, "购物助手", "限时优惠，支付9.9元即可领券");
        expect("ad_filtered", ALIPAY, "支付宝", "限时活动，支付9.9元领取优惠券");
        expect("weak_signal", WECHAT, "好友小王", "我刚支付了20元");
        expect("weak_signal", WECHAT, "好友小王", "收款方：小王\n¥20.00");
        expect("missing_amount", WECHAT, "微信支付", "付款成功");
        expectAmount(28.80, "微信支付\n付款成功 ¥28.80\n收款方：茶百道");
        expectAmount(15.00, "支付宝\n支出 15.00 元");
        expectAmount(20.00, "微信支付\n支付成功 ¥20.00\n账户余额 100.00元");
        expectMerchant("茶百道", "微信支付\n付款成功 ¥28.80\n收款方：茶百道", "微信支付");
        expectMerchant("杭州地铁", "支付宝\n支出 ¥3.00\n商户：杭州地铁", "支付宝");
        expectMerchant("", "微信支付\n付款成功 ¥28.80", "微信支付");
        expectMerchant("", "支付宝\n支出 ¥15.00", "支付宝");
        expectText("微信", XzbPaymentNotificationService.getAppNameForTest(WECHAT));
        expectText("支付宝", XzbPaymentNotificationService.getAppNameForTest(ALIPAY));
        expectText("第一段\n第二段", XzbPaymentNotificationService.mergeTextForTest("第一段", "第二段"));
    }

    private static void expect(String expected, String packageName, String title, String rawText) {
        String actual = XzbPaymentNotificationService.classifyForTest(packageName, title, rawText);
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError("expected=" + expected + ", actual=" + actual + ", text=" + rawText);
        }
    }

    private static void expectAmount(double expected, String rawText) {
        double actual = XzbPaymentNotificationService.extractAmountForTest(rawText);
        if (Math.abs(expected - actual) > 0.0001) {
            throw new AssertionError("expected amount=" + expected + ", actual=" + actual + ", text=" + rawText);
        }
    }

    private static void expectMerchant(String expected, String rawText, String title) {
        String actual = XzbPaymentNotificationService.extractMerchantForTest(rawText, title);
        if (!expected.equals(actual)) {
            throw new AssertionError("expected merchant=" + expected + ", actual=" + actual + ", text=" + rawText);
        }
    }

    private static void expectText(String expected, String actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("expected text=" + expected + ", actual=" + actual);
        }
    }
}
