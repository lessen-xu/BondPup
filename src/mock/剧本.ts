export const NOTE_MODEL_REPLY = {
  fallback: "嗯,我都听着了。",
  thinkingHint: "",
  followUpPlaceholder: "还想说什么就直接打字",
  followUpSubmit: "说给我听",
  continueLabel: "嗯,说完了",
} as const;

export const ONBOARDING_MONEY = {
  income: "这个月你的收入大概是多少？",
  subtitle: "工资、生活费、或者其他进账，加起来就行",
  placeholder: "比如 6500",
  jarsTotal: "四个罐子加起来，正好是这个月的收入",
  concernRef: "你说过「{concern1}」「{concern2}」——安心罐这些就是留给它们的。",
  concernRefSingle: "你说过「{concern1}」——安心罐这些就是留给它的。",
  concernRefMore: "你说过「{concern1}」「{concern2}」……还有一条。安心罐这些就是留给它们的。",
  largeGoal: "哇，{amount}元〜是个不小的目标呢。",
  largeGoalCheck: "这个数没写错吧？",
  largeGoalConfirm: "就是这个数",
  largeGoalChange: "我再想想",
} as const;

export const moneyNoteScript = {
  back: "返回上一步", backHome: "返回首页", loading: "我想一下〜", intro: "你说,我听着。",
  storyPlaceholder: "想说说哪一笔钱?", storySubmit: "告诉我", amountQuestion: "我听见了。大概是多少钱呢?",
  amountPlaceholder: "金额", amountSubmit: "继续", talkOnly: "只说说,不改余额",
  chooseJar: "这笔钱想记在哪个罐子?", confirm: "把 ▢▢▢ 元记在{jarLabel},可以吗?",
  confirmDebit: "确认记下", changeJar: "换一个罐子", saved: "好,我记下了。",
  talkOnlySaved: "好,那我就先不动罐子。你说的这件事,我记得。", undo: "撤销",
  undone: "已经撤销了,罐子回到刚才的样子。", noState: "先和我一起把这个月的罐子放好,再来记这笔钱。",
  goStart: "从零开始", fallbackError: "这笔钱暂时没记进去。我们可以换个罐子,或者先只说说。",
  listen: {
    done: "嗯,说完了",
    responses: {
      income: "噢〜多出来一笔钱,是件开心的事呀。你看到它的时候,第一反应是什么?",
      hesitation: "嗯,这笔钱你还没决定怎么用。它让你有点犹豫,是不是?",
      regret: "嗯,花完了之后你感觉没那么好。这种感觉我懂的。",
      uncertain: "嗯,你还没想好它的去处。那我们可以一起想想,不着急。",
      unclear: "嗯嗯,我听着呢。慢慢说。",
    },
    transition: [
      "嗯,我大概懂你的感觉了。",
      "这笔钱让你有点……",
      "就是想说一说,对不对?",
    ],
  },
  modelReply: NOTE_MODEL_REPLY,
  vault: {
    title: "{alias}的小金库",
    subtitle: "我替你收着的纸条,想看的时候就来看看。",
    empty: "还没有写下纸条。",
  },
} as const;

export const REVIEW_STEP1 = {
  summary: "那天你在想 {item}，{price}元，最后选了{action}。",
} as const;

export const REVIEW_CARD = {
  subtitle: "我们说今天来看看",
  body: {
    now: "那件{item}，后来真的进入你的生活了吗？",
    tomorrow: "昨天那件{item}，你今天还会主动想起它吗？",
    skip: "那件{item}你没买，现在是什么感觉？",
  },
} as const;

export const REVIEW_OPTIONS = {
  now: ["用过几次", "还没怎么用", "说不上来", "最后没买"],
  tomorrow: ["还惦记着", "放下了", "在等个时机", "后来买了"],
  skip: ["挺轻松", "有点遗憾", "没什么感觉", "后来还是买了"],
} as const;

export const REVIEW_RESPONSES = {
  main: {
    "用过几次": "嗯，它真的进到你生活里了。",
    "还没怎么用": "嗯，买回来放着的东西，谁都有几件。",
    "说不上来": "嗯嗯，说不清也没关系。",
    "最后没买": "嗯，那就先这样。",
    "还惦记着": "那它还在你心里呀。",
    "放下了": "嗯，那就先放着吧。",
    "在等个时机": "好，那再等等。",
    "后来买了": "嗯，那它还是来了。",
    "挺轻松": "嗯，那就好。",
    "有点遗憾": "嗯，有点遗憾也很正常～",
    "没什么感觉": "嗯嗯，我知道了。",
    "后来还是买了": "嗯，我记下了。",
  },
  followUp: {
    "还没怎么用": "说不定哪天就用上了，这种事也常有。",
    "在等个时机": "有些决定，多一点时间也没关系。",
  },
} as const;

export const REVIEW_ASK_JAR = {
  question: "那这笔钱当时是从哪个罐子出的？",
  options: ["生活罐", "安心罐", "梦想罐", "不记得了"],
  jarResponse: "好，从{jar}里出的，我记上了。",
  forgottenResponse: "好，那数字先不动。我帮你记着这件事。",
} as const;

export const REVIEW_CONFIRM_DEDUCT = {
  question: "那就从{jar}里出这 {amount} 元？",
  confirm: "嗯，就这样",
  cancel: "再想想",
  done: "好，从{jar}里出的，我记上了。",
  undo: "改回去",
} as const;

export const REVIEW_STEP3 = {
  questions: {
    now: {
      "用过几次": "那你什么时候会想起用它？",
      "还没怎么用": "当时是什么让你想买它的？",
      "说不上来": "现在再看这笔钱，你会怎么说？",
      "最后没买": "最后是什么让你停下的？",
    },
    tomorrow: {
      "还惦记着": "它哪一点还吸引你？",
      "放下了": "是什么让你放下的？",
      "在等个时机": "那你在等什么？",
      "后来买了": "后来是什么让你决定买的？",
    },
    skip: {
      "挺轻松": "那没买之后有什么变化吗？",
      "有点遗憾": "那遗憾的是什么？",
      "没什么感觉": "现在再看，你会怎么说？",
      "后来还是买了": "后来是什么让你改主意的？",
    },
  },
  fallback: "这次有什么想记下来的吗？",
  placeholder: "一两句话就行，想到什么写什么",
  skip: "这次不用",
  save: "记下来",
} as const;

export const REVIEW_STEP4 = { closing: "好，我记下了。" } as const;

export const REVIEW_NAV = { next: "继续", backHome: "返回首页" } as const;

export const HOME_REVIEW_CARD = { subtitle: "我们说今天来看看" } as const;

export const CARDS_PAGE = {
  labels: {
    confirmed: "已确认",
    edited: "已修改",
    unsure: "暂不确定",
    candidate: "候选",
    welcome: "起点",
  },
  greeting: "每张卡片都是你对自己的了解。",
} as const;

export const PRINCIPLE_CANDIDATE = {
  lead: "{alias} 悄悄记下了一件事",
  evidence: "依据",
  skipped: "这次先不提炼了，等我们再多几次经历。",
  actions: {
    like: "这很像我",
    edit: "改成我的说法",
    defer: "暂时不能确定",
  },
  saveEdit: "保存这句话",
} as const;

export const DECISION_REFERENCE = {
  label: "参考了 {count} 条你确认过的原则",
  close: "收起",
} as const;

/** 碎钻详情页(结余):不催不庆祝不计数,挪走说成好事,为 0 空着也很好 */
export const LEFTOVER_PAGE = {
  title: "碎钻",
  intro: "上个周期没花完的钱，我把它们收成了这一小堆。",
  amountLine: "这里一共 {amount} 元。",
  fromLine: "{cycle}从{jar}剩下的 {amount} 元",
  hint: "它们不属于任何罐子。想挪就挪，不挪也很好。",
  empty: "现在这里是空的。空着也很好。",
  moveEntry: "挪一点去罐子里",
  chooseJar: "想放进哪个罐子？",
  amountQuestion: "挪多少呢？",
  amountAll: "全部挪过去",
  amountNext: "就挪这些",
  confirm: "把 {amount} 元放进{jar}，好吗？",
  confirmYes: "就这样",
  confirmNo: "再想想",
  moveFailed: "这次没挪动。要不再试一次？",
  back: "返回首页",
} as const;

/** 已确认/已修改/暂不确定的原则,在放大视图里的管理动作——原则归用户所有,随时可改可删 */
export const PRINCIPLE_MANAGE = {
  delete: "删掉这张",
  deleteConfirm: "这句话就不要了吗？删掉后我不会再提起它。",
  deleteYes: "删掉",
  deleteNo: "先留着",
  editRejected: "这句话我先没能记下。要不换个说法试试？",
} as const;

export const REVIEW_ACTION_LABELS = {
  buy_now: "现在买",
  defer: "放到明天",
  skip_this_time: "这次先不买",
} as const;

export const DECISION_BALANCE = {
  fresh: "安心罐里现在有 {balance} 元。买了它的话，还会剩下 {remain} 元。",
  stale: {
    line: "我这儿记的是还剩 {balance} 元，不过有段时间没跟你对过了。现在大概还剩多少？",
    placeholder: "填个大概就行，不确定就跳过",
    options: { keep: "就按这个数看", update: "我更新一下" },
    updatePlaceholder: "现在大概还剩多少？",
    keepResponse: "好，那就先按这个数看。你想改的时候随时告诉我。",
    updateResponse: "好，我记新的。那就按这个数往下看。",
    skipResponse: "好，那就先按原来的数看。",
  },
} as const;

// 兼容旧引用;新页面统一使用 REVIEW_RESPONSES。
export const REVIEW_STEP2 = REVIEW_RESPONSES;

// ============================================================
// 修改四：全局收尾语
// ============================================================
export const CLOSING = {
  setupDone: "好，我记下了。四个罐子我替你收着。以后花了钱、犹豫要不要买、或者只是想说说话，都可以来找我。",
  casual: "好，我收到了。以后想说的时候随时来。",
} as const;

export const ERRORS = {
  offline: {
    line: "咦，我这边好像连不上了。",
    sub: "等一下再试试？你刚说的话我都记着呢。",
    retry: "再试一次",
    fallback: "先看看罐子",
  },
  timeout: {
    line: "我想了一下，有点没跟上。",
    sub: "要不要再说一遍？或者我们先做别的。",
    retry: "再说一遍",
    fallback: "先看看罐子",
  },
  validation: {
    line: "这个数我好像没看懂。",
    sub: "再填一次？填个大概就行。",
  },
  conflict: {
    line: "咦，好像别的地方也在改数字。",
    sub: "我先去看一眼最新的，你等我一下。",
    action: "看看最新的",
  },
  loading: {
    line: "等我一下，我去翻翻小本本。",
  },
} as const;

export const DEMO = {
  entryFresh: "从零开始",
  entryDemo: "用示例数据先逛一圈",
  enterLine: "这些数字是我编的，不是你的。",
  enterSub: "你先随便点点，想真的开始了告诉我。",
  badge: "示例数据",
  exitLabel: "清掉示例数据",
  exitConfirm: "要把示例的数字都清掉吗？你自己的记录不受影响。",
  exitYes: "清掉",
  exitNo: "再逛逛",
  exitDone: "好，清干净了。",
} as const;

/** 周期回顾(CYCLE_REVIEW)三分支文案(A 供稿 2026-08-12)。
 *  硬约束:期限到了绝不说「没完成/没达成」;月供上涨必须给两个方向;庆祝的是安排成了,不夸存得多。 */
export const CYCLE_REVIEW = {
  entry: { label: "新的一个月了", sub: "这个月还想这么分吗？" },
  goalReached: {
    line: "「{goal}」存够啦！这一笔你自己攒下来的。",
    keep: "先放着，我帮你收好",
    note: "想用它的时候随时来取，这张纸条我先帮你贴着。",
  },
  deadlinePassed: {
    line: "说好的时间到了，「{goal}」还差 {amount} 元。时间可以往后挪一挪，也可以就用现在这些先去。",
    extend: "往后挪一挪",
    useNow: "就用现在这些",
  },
  direction: {
    previous: "上个月是这样分的：",
    monthlyUp: "「{goal}」这个月要放 {amount} 元。比上个月多一点，想的话可以放这个数，也可以把时间往后挪一个月，两个都行。",
    keepMonthly: "放这个数",
    extendMonth: "把时间往后挪一个月",
    same: "还是这么分",
    change: "我想改一下",
  },
  edit: {
    disposable: "这个月能安排多少？",
    dreamMonthly: "「{goal}」月供",
    comfortNote: "剩下的进安心罐：{amount} 元",
    confirm: "就这么安排",
    back: "再想想",
  },
  done: {
    line: "好，这个月就这么安排。",
    leftoverNote: "上个月没花完的 {amount} 元，变成碎钻收在垫子上了。",
    home: "返回首页",
  },
} as const;

export const SETTINGS = {
  title: "设置",
  exportData: "导出我的数据",
  importData: "导入我的数据",
  importError: "这份文件没读出来。看看是不是之前导出的那一份？",
  clearData: "清空所有数据",
  clearConfirm: "真的要清空吗？清空后会回到欢迎页。",
  clearYes: "确认清空",
  clearNo: "先留着",
} as const;

export const SAFETY = {
  crisis: {
    line: "我停一下。",
    body: "刚才你说的话，我记住了。\n钱的事我们随时可以再聊，但现在我更想知道你还好吗。\n这件事我帮不上忙，但你身边一定有人可以。",
    closing: "我会在这儿等你回来。",
    ack: "我知道了",
    home: "回去看看罐子",
  },
  debt: {
    line: "这个我确实不懂，不敢乱说。",
    body: "借钱、分期这些事，找懂的人问会比问我靠得住。",
    closing: "我们可以聊聊这个月的安排，或者你就想说说话也行。",
  },
  invest: {
    line: "投资我不做，也不打算做。",
    body: "不是不想帮你，是这件事我给不了负责的建议。",
    closing: "我能陪你做的，是把手上的钱分明白。",
  },
  offTopic: {
    line: "嗯，我听着呢。",
    body: "这件事有影响到你这个月的安排吗？",
    options: { yes: "有一点", no: "没有" },
    yesResponse: "那我们看看要不要调一下。",
    noResponse: "好，那就先放着。你想说的时候随时说。",
  },
  timeReminder: {
    line: "我们聊了挺久了。",
    body: "要不要先歇一会儿？我不会走的。",
    ack: "好",
    continue: "再聊一会儿",
  },
} as const;

/** 日常场景定稿文案。页面只做 {alias} 插值，不改写句子。 */
export const DAILY_DECISION = {
  entry: "帮我看看要不要买",
  intro: "好呀〜你想买什么?跟我说说看",
  itemPlaceholder: "比如「一个投影仪」",
  itemHint: "还没想好具体是什么也没关系,先说说看〜",
  itemNext: "告诉我",
  priceQuestion: "嗯嗯,我记下了。那它大概多少钱呀?",
  pricePlaceholder: "填个大概就行〜",
  unsure: "我还不确定",
  unsureResponse: "没关系〜大概的范围也可以,比如「几百块」或者「一千出头」。你随便说,我帮你记着。",
  noState: "咦,我还没帮你分好罐子呢〜要不要先花几分钟,我帮你把罐子分一分?这样以后再看「要不要买」,我心里就有数啦。",
  start: "先分罐子",
  browse: "不了,就随便看看",
  comfortEnough: "安心罐里现在有 {balance} 元。买了它的话,还会剩下 {remain} 元。",
  comfortShortfall: "安心罐里现在有 {balance} 元。",
  shortfall: "按安心罐算会差 {shortfall} 元。剩下这部分你想放在哪里?",
  sourceConfirmQuestion: "就从「{source}」出这 {shortfall} 元，可以吗?",
  pendingAction: "先记着，不动罐子",
  pendingReply: "{alias}:那先记着，等钱够了我们再看。",
  pendingConfirm: "先这样记着",
  arrange: "我帮你捋一下〜",
  summaryItem: "想买:{item}  {price}元",
  summaryComfort: "从安心罐出:还会剩 {remain}元",
  arrangeQuestion: "想现在决定,还是先放一放?都可以的。",
  actions: { buy: "现在买", defer: "放到明天", skip: "这次先不买" },
  confirmQuestion: "我这样记下来,可以吗?",
  confirm: "就这样",
  modify: "我再想想",
  cancel: "先不记了",
  closing: "好,我记下了。不管买不买,我都站你这边。",
  uncertainDecision: "不确定也很正常呀。那就先放一放,明天再来看看它。钱的事,{alias}想清楚比急着决定好。",
  offTopic: "嗯嗯,我听着呢。想聊钱的事随时找我,想聊别的也行〜",
  priceUncertain: "噢,价格还没完全定下来〜那你心里大概的预算范围是多少呀?比如「超过 500 就不太想买了」这种。",
  shortfallSources: "等后端提供来源选项后可选",
} as const;

export const DAILY_NOTE = {
  entry: "记一笔钱",
  intro: "嗯,我听着呢。这笔钱是什么情况呀?",
  placeholder: "比如「收到了一笔奖金」「退了一笔钱」「花了一笔有点后悔的钱」……",
  hint: "什么都可以说〜{alias}不会评价你,只会听着。",
  submit: "告诉我",
  done: "嗯,说完了",
  responses: {
    income: "噢〜多出来一笔钱,是件开心的事呀。你看到它的时候,第一反应是什么?",
    hesitation: "嗯,这笔钱你还没决定怎么用。它让你有点犹豫,是不是?",
    regret: "嗯,花完了之后你感觉没那么好。这种感觉我懂的。",
    uncertain: "嗯,你不太确定它放在哪里合适。那我们可以一起想想,不着急。",
    unclear: "嗯嗯,我听着呢。{alias}说。",
  },
  transitions: ["嗯,我大概懂你的感觉了。", "这笔钱让你有点……", "就是想说一说,对不对?"],
  choicesPrompt: "那这笔钱,要不要动一下罐子里的数字?",
  remember: "改一下数字",
  talkOnly: "不用改,就是想说说",
  amountQuestion: "那这笔钱大概多少?",
  amountPlaceholder: "比如 5000 或者 5万",
  directionQuestion: "这笔钱是进账,还是花出去了?",
  directions: { credit: "进账", debit: "花出去" },
  jarQuestion: "想把这笔钱放进哪个罐子?",
  debitJarQuestion: "这笔钱从哪个罐子出?",
  creditConfirm: "那就把这 {amount} 元放进{jar}?",
  debitConfirm: "那就从{jar}里出这 {amount} 元?",
  confirm: "嗯,就这样",
  modify: "我再想想",
  creditDone: "好,这笔进账我放进{jar}了。",
  debitDone: "好,这笔钱我从{jar}记下了。",
  remembered: "好,我帮你记好了。",
  received: "好,我收到了。以后想说的时候随时来。",
  adjust: "好呀〜你想怎么调整?告诉我,我来帮你改。",
  regretBranch: "嗯,花完有点后悔,这种感觉好真实。不过钱花都花了,它已经完成了它的事。你现在想做的,是调整接下来的安排,还是只是想把这件事说出来?",
} as const;

export const DAILY_TALK = {
  prompt: "今天想聊什么?",
  freePlaceholder: "说什么都可以〜{alias}听着呢",
  submit: "说给我听",
  detected: "咦,你说的这个,要不要我们一起看看?还是你就是想随便聊聊?",
  together: "一起看看",
  casual: "随便聊聊",
  silence: "嗯……我就在这儿哦。你不用急着回答,发呆也可以的。",
  return: "嘿,你回来啦〜上次我们聊到一半,你还想继续说吗?不想说也没关系。",
  triggers: {
    decision: ["我想买", "要不要买", "值得买", "帮我看看", "想买"],
    note: ["收到一笔", "有笔钱", "花了笔钱", "退了笔钱", "奖金", "红包", "后悔"],
  },
} as const;
