package com.xiaozhangben.app;

public final class XzbPaymentNotificationSelfTest {
    private static final String WECHAT = "com.tencent.mm";
    private static final String ALIPAY = "com.eg.android.AlipayGphone";

    private XzbPaymentNotificationSelfTest() {}

    public static void main(String[] args) {
        expect(null, WECHAT, "微信支付", "微信支付\n付款成功 ¥28.80\n收款方：茶百道");
        expect(null, WECHAT, "微信支付", "微信支付\n已支付 10 元\n商户名称：便利店");
        expect(null, WECHAT, "微信", "微信\n微信支付\n付款成功 ¥18.00");
        expect(null, ALIPAY, "支付宝", "支付宝\n你有一笔15元支出\n商户：杭州地铁");
        expect("ad_filtered", WECHAT, "购物助手", "限时优惠，支付9.9元即可领券");
        expect("ad_filtered", ALIPAY, "支付宝", "限时活动，支付9.9元领取优惠券");
        expect("weak_signal", WECHAT, "好友小王", "我刚支付了20元");
        expect("missing_amount", WECHAT, "微信支付", "付款成功");
        System.out.println("notification classifier: 8 checks passed");
    }

    private static void expect(String expected, String packageName, String title, String rawText) {
        String actual = XzbPaymentNotificationService.classifyForTest(packageName, title, rawText);
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError("expected=" + expected + ", actual=" + actual + ", text=" + rawText);
        }
    }
}
