export const categories = [
  { id: "food", name: "餐饮", color: "#ee775d", keywords: ["咖啡", "餐", "饭", "茶", "奶茶", "外卖", "食", "面", "星巴克", "瑞幸"] },
  { id: "transport", name: "交通", color: "#5f9fcf", keywords: ["地铁", "公交", "打车", "滴滴", "高铁", "机票", "停车", "加油"] },
  { id: "shopping", name: "购物", color: "#d6a94f", keywords: ["淘宝", "京东", "商场", "优衣库", "超市", "盒马", "便利店"] },
  { id: "home", name: "居家", color: "#8a7cc4", keywords: ["水费", "电费", "物业", "房租", "燃气", "家居"] },
  { id: "fun", name: "娱乐", color: "#63a889", keywords: ["电影", "游戏", "会员", "演出", "酒吧", "KTV"] },
  { id: "health", name: "医疗", color: "#d86d84", keywords: ["医院", "药", "体检", "诊所", "医保"] },
  { id: "study", name: "学习", color: "#4f77b8", keywords: ["书", "课程", "培训", "文具", "知识"] },
  { id: "other", name: "其他", color: "#7b837d", keywords: [] }
];

export const methods = ["微信", "支付宝", "银行卡", "现金", "其他"];

export const themes = [
  { id: "sage", name: "松绿", primary: "#6f927d", accent: "#ee775d" },
  { id: "coral", name: "珊瑚", primary: "#c96f5d", accent: "#4f8d7b" },
  { id: "ocean", name: "海蓝", primary: "#5f8fb7", accent: "#e2aa53" },
  { id: "ink", name: "墨青", primary: "#31453f", accent: "#d88459" }
];

export const coverPresets = [
  {
    id: "morning",
    name: "晨光",
    css: "linear-gradient(135deg, rgba(255,244,218,.95), rgba(229,242,232,.92) 45%, rgba(244,178,128,.88))"
  },
  {
    id: "leaf",
    name: "叶影",
    css: "radial-gradient(circle at 24% 24%, rgba(221,235,204,.92), transparent 38%), linear-gradient(135deg, #f7fbf3, #d8e9de 48%, #8fb49c)"
  },
  {
    id: "city",
    name: "城光",
    css: "linear-gradient(135deg, #edf5f7, #d6e6ed 42%, #edb27d 100%)"
  },
  {
    id: "night",
    name: "夜色",
    css: "linear-gradient(135deg, #283a35, #4d7065 54%, #d78a62 120%)"
  }
];

export const seedExpenses = [
  {
    id: "seed-1",
    amount: 32,
    merchant: "瑞幸咖啡",
    category: "food",
    method: "微信",
    source: "通知识别",
    date: "2026-07-01",
    time: "08:42",
    note: "早餐咖啡"
  },
  {
    id: "seed-2",
    amount: 18,
    merchant: "地铁",
    category: "transport",
    method: "支付宝",
    source: "通知识别",
    date: "2026-07-01",
    time: "09:18",
    note: ""
  },
  {
    id: "seed-3",
    amount: 86.5,
    merchant: "盒马鲜生",
    category: "shopping",
    method: "支付宝",
    source: "手动",
    date: "2026-06-30",
    time: "19:35",
    note: "晚餐食材"
  },
  {
    id: "seed-4",
    amount: 46,
    merchant: "美团外卖",
    category: "food",
    method: "微信",
    source: "截图识别",
    date: "2026-06-29",
    time: "12:20",
    note: ""
  },
  {
    id: "seed-5",
    amount: 199,
    merchant: "课程订阅",
    category: "study",
    method: "银行卡",
    source: "手动",
    date: "2026-06-25",
    time: "21:12",
    note: "月度课程"
  }
];

export const seedPending = [
  {
    id: "pending-seed-1",
    amount: 28.8,
    merchant: "茶百道",
    category: "food",
    method: "微信",
    source: "通知识别",
    date: "2026-07-01",
    time: "15:06",
    confidence: 91,
    rawText: "微信支付 付款成功 ￥28.80 收款方：茶百道 2026-07-01 15:06"
  }
];
