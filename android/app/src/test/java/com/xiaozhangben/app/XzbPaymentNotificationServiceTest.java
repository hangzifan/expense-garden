package com.xiaozhangben.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class XzbPaymentNotificationServiceTest {
    private static final String WECHAT = "com.tencent.mm";
    private static final String ALIPAY = "com.eg.android.AlipayGphone";

    @Test
    public void acceptsWechatPaymentFromTrustedSender() {
        assertNull(XzbPaymentNotificationService.classifyForTest(
            WECHAT,
            "微信支付",
            "微信支付\n付款成功 ¥28.80\n收款方：茶百道"
        ));
    }

    @Test
    public void acceptsWechatIntegerAmount() {
        assertNull(XzbPaymentNotificationService.classifyForTest(
            WECHAT,
            "微信支付",
            "微信支付\n已支付 10 元\n商户名称：便利店"
        ));
    }

    @Test
    public void acceptsAlipayExpenseReminder() {
        assertNull(XzbPaymentNotificationService.classifyForTest(
            ALIPAY,
            "支付宝",
            "支付宝\n你有一笔15元支出\n商户：杭州地铁"
        ));
    }

    @Test
    public void rejectsWechatMarketingMessage() {
        assertEquals("ad_filtered", XzbPaymentNotificationService.classifyForTest(
            WECHAT,
            "购物助手",
            "限时优惠，支付9.9元即可领券"
        ));
    }

    @Test
    public void rejectsAlipayMarketingPush() {
        assertEquals("ad_filtered", XzbPaymentNotificationService.classifyForTest(
            ALIPAY,
            "支付宝",
            "限时活动，支付9.9元领取优惠券"
        ));
    }

    @Test
    public void rejectsOrdinaryWechatChatAboutPayment() {
        assertEquals("weak_signal", XzbPaymentNotificationService.classifyForTest(
            WECHAT,
            "好友小王",
            "我刚支付了20元"
        ));
    }

    @Test
    public void reportsMissingAmount() {
        assertEquals("missing_amount", XzbPaymentNotificationService.classifyForTest(
            WECHAT,
            "微信支付",
            "付款成功"
        ));
    }
}
