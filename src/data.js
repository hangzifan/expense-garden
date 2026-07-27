export const categories = [
  { id: "food", name: "餐饮", icon: "food", color: "#ee775d", keywords: ["咖啡", "餐", "饭", "茶", "奶茶", "外卖", "食", "面", "星巴克", "瑞幸", "茶百道", "蜜雪", "喜茶", "霸王茶姬"] },
  { id: "transport", name: "交通", icon: "transport", color: "#5f9fcf", keywords: ["地铁", "公交", "打车", "滴滴", "高铁", "机票", "停车", "加油"] },
  { id: "shopping", name: "购物", icon: "shopping", color: "#d6a94f", keywords: ["淘宝", "京东", "商场", "优衣库", "超市", "盒马", "便利店"] },
  { id: "home", name: "用水", icon: "water", color: "#4d9fc5", keywords: ["水费", "自来水", "饮用水", "桶装水", "矿泉水", "水站"] },
  { id: "fun", name: "娱乐", icon: "fun", color: "#63a889", keywords: ["电影", "游戏", "会员", "演出", "酒吧", "KTV"] },
  { id: "health", name: "医疗", icon: "health", color: "#d86d84", keywords: ["医院", "药", "体检", "诊所", "医保"] },
  { id: "study", name: "学习", icon: "study", color: "#4f77b8", keywords: ["书", "课程", "培训", "文具", "知识"] },
  { id: "other", name: "其他", icon: "other", color: "#7b837d", keywords: [] }
];

export const incomeCategories = [
  { id: "salary", name: "工资", icon: "gift", color: "#4f9d75", keywords: ["工资", "薪资", "薪水", "奖金", "绩效"] },
  { id: "bonus", name: "奖金", icon: "gift", color: "#d6a94f", keywords: ["奖金", "红包", "奖励"] },
  { id: "finance", name: "理财", icon: "tag", color: "#5f8fb7", keywords: ["理财", "利息", "收益", "分红"] },
  { id: "refund", name: "退款", icon: "tag", color: "#63a889", keywords: ["退款", "退回", "返现"] },
  { id: "transfer", name: "转账", icon: "travel", color: "#9a7ac2", keywords: ["转账", "收款", "入账"] },
  { id: "income-other", name: "其他", icon: "other", color: "#7b837d", keywords: [] }
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


