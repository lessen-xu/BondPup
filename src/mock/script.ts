import { ONBOARDING_MONEY } from "./剧本";

export const script = {
  flow: {
    start: "开始", next: "继续", back: "返回", save: "记下来", edit: "点这里写一写",
    remove: "删掉", placeholder: "▢▢▢",
  },
  welcome: {
    greeting: "你好呀！我是你的小狗，我叫慢慢。",
    bodyLines: [
      "提到「钱」，你现在心里可能有点乱。",
      "想攒钱又不知道从哪下手，",
      "想花钱又总有负罪感。",
    ],
    closingLines: ["没关系。和钱有关的所有事，你都可以跟我讲。", "我会一直陪着你。"],
    start: "那开始吧",
  },
  nickname: {
    prompt: "给我起个小名吧〜以后你就这么叫我啦",
    placeholder: "慢慢",
    closing: "我会做你最好的伙伴，陪你慢慢学会和钱自由自在地相处〜",
    confirm: "就叫这个",
  },
  firstRecord: {
    title: "{alias}的小本本",
    body: "第一次自己管钱，谁都会有点晕乎乎的。\n\n但你说出了\n\"我有点不知道从哪开始\"——\n这样的你，我很喜欢。",
  },
  principleIntro: "我要悄悄记下关于你的事情,写成一张专属于你的金钱原则卡片。",
  steps: {
    recent: {
      question: "这个月,你想用钱过什么样的生活呢?",
      options: ["A 想攒下来一点", "B 想让自己过得舒服一些", "C 有个想买的东西", "D 我想自己说说"],
      freeInputHint: "什么都可以说,比如\"不想再月光了\",或者\"想给自己换一个好一点的键盘\"〜",
      stepHint: "还没想清楚也没关系,先选一个。",
    },
    far: {
      question: "有没有什么事,是你想为它慢慢存一点钱的?",
      options: ["A 有,我一直想着一件事", "B 暂时没有"],
      subQuestions: ["它是什么呢?", "大概是多少钱?", "大概几个月以后?(填个数字就行)"],
      firstPlaceholder: "比如去日本旅行",
      monthPlaceholder: "比如 12",
      stepHint: "没有也完全没关系,我们先把这个月过好。以后想到了,随时告诉我就可以。",
    },
    wishes: {
      question: "我把你刚才告诉我的事情,整理成了几件你在意的事〜",
      items: ["每个月能存下来一点", "为想做的事存一笔钱", "偶尔对自己好一点"],
      add: "我还想加一条", confirm: "就是这些",
      stepHint: "改一改、删掉或加一条都可以。",
    },
    numbers: {
      inputs: [ONBOARDING_MONEY.income, "有哪些是这个月一定要花的?"],
      incomeSubtitle: ONBOARDING_MONEY.subtitle,
      incomePlaceholder: ONBOARDING_MONEY.placeholder,
      goalSavings: "为「{goal}」已经存了多少了？",
      goalSavingsPlaceholder: "还没开始也没关系，填 0 就行",
      largeGoal: ONBOARDING_MONEY.largeGoal,
      largeGoalCheck: ONBOARDING_MONEY.largeGoalCheck,
      largeGoalConfirm: ONBOARDING_MONEY.largeGoalConfirm,
      largeGoalChange: ONBOARDING_MONEY.largeGoalChange,
      unsure: "我还不确定", calculate: "帮我算一下",
      unsureResponse: "不确定也没关系呀〜先空着,想起来了再填。",
      livingHint: "房租、水电、通讯、交通、吃饭这些，这个月躲不掉的",
      fixedCosts: ["房租", "水电燃气", "通讯", "交通", "饮食", "其他固定"],
      stepHint: "先估计个大概就好〜",
    },
    reverse: {
      message: "按现在的安排,梦想罐每个月要留 ▢▢▢ 元。",
      dogMore: "这是按现在的安排算出来的,多一点少一点都可以。",
      stretchedMessage: "照现在这样，每个月要留 ▢▢▢ 元。",
      stretchedDetail: "这个数比你现在能拿出来的多一些，我们换个方式看看？",
      extendTime: "把时间放长一点",
      lowerMonthly: "先少存一点",
      monthsLabel: "想改成多少个月？",
      monthlyLabel: "每个月留多少比较合适？",
      recalculatedMonthly: "这样每个月大概要留 ▢▢▢ 元",
      recalculatedMonths: "这样大概要 ▢▢▢ 个月",
      flexibleHint: "两个都行，也可以先这样放着，以后随时改。",
      noTime: "时间还没定也没关系,先放着。想好了随时告诉我。",
      pressure: "如果这个数看着有点紧,时间和金额都可以再调整。",
      stepHint: "下一步还可以直接改罐子里的数字。",
    },
    jars: {
      question: "我把你的钱分成了四个罐子〜",
      living: { note: "这个月已经确定要花的钱" },
      comfort: { note: "这个袋子里装的是你的\"自由许可证\",怎么花都理直气壮〜" },
      dream: { note: "你每往里面放一块钱,它都会\"叮\"地响一声,提醒你离梦想更近了一步。" },
      future: { empty: "留一点给更远的以后?" },
      futureQuestion: "还有一种钱,是你暂时不打算花的。这个月想留一点吗?",
      futureDetail: "留下来的部分会从安心罐里出,留和不留都可以〜",
      futureOptions: ["这个月先不留", "我想留一点"],
      futureSummary: "未来罐 ▢▢▢ 元 · 安心罐会变成 ▢▢▢ 元",
      futureLow: "这样安心罐就只剩 ▢▢▢ 了,要不要少留一点?",
      futureReduce: "少留一点", stepHint: "每个数字都可以再改。",
      negativeComfort: "这样安心罐就不够了，要不要回去调一下?",
      adjustPrevious: "回到上一步",
      concernRef: ONBOARDING_MONEY.concernRef,
      concernRefSingle: ONBOARDING_MONEY.concernRefSingle,
      concernRefMore: ONBOARDING_MONEY.concernRefMore,
      bottom: ONBOARDING_MONEY.jarsTotal,
      confirm: "跟{alias}击个掌,这就出发!",
      back: "我再想想", afterHint: "确认后,这些安排才会记下来。",
    },
  },
  home: {
    settings: "设置", cards: "收藏", outfit: "装扮", review: "回看",
    startEntry: "从零开始", demoEntry: "用合成示例体验", buyEntry: "帮我看看要不要买", moneyEntry: "有笔钱想说说",
    edit: "改一下", bubbleHint: "戳一戳我呀〜",
    pokeResponses: ["痒〜", "哎呀", "你怎么老戳我"],
  },
} as const;

export function withAlias(text: string, alias: string) {
  return text.replaceAll("{alias}", alias);
}

export function withUser(text: string, user: string) {
  return text.replaceAll("{user}", user);
}
