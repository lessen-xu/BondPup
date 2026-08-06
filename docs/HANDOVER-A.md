# 页面对接清单(A 专用)

页面与视觉全归你,想怎么做怎么做。这里只列**页面背后能调的东西**——所有金额计算和状态读写都已封装好,页面里不用写任何算钱的逻辑。

## 通用约定

- **金额一律是「分」的整数**(存储/接口层),展示时 ÷100 变元。例:`350000` → `¥3500`
- 状态真源在浏览器 localStorage,用 hook 读写:
  ```tsx
  import { useMoneyState } from "@/lib/state/money-store";
  const { state, ready, commit, reset, enterDemo } = useMoneyState();
  // state: MoneyState | null(null = 还没做过安排 → 引导去起点)
  // commit(newState) 保存;reset() 清空;enterDemo() 载入合成示例(演示模式入口)
  ```
- `MoneyState` 里有什么:`jars`(数组,每个有 kind/label/planned/actual/goal?)、`cycle`(可安排金额)、`leftover`(碎钻,为 0 不显示)、`principles`、`demo`(true 时页面要显示「合成示例数据」标识)
- 语气红线:禁用词见 `src/server/safety/forbidden-words.ts`(超支/不够/应该/必须/加油…全列在里面),文案别用

## 起点七步页面(从零开始)

| 步 | 页面做什么 | 调什么 |
|---|---|---|
| ① 问近 | 四个选项(想攒一点/舒服些/有具体目标/自己说) | 纯 UI,存选择 |
| ② 问远 | 目标名 + 金额 + 几个月;可跳过 | 纯 UI |
| ③ 拆解 | 把①②的话发给 Agent,展示 3-4 条「在意的事」,可删可改可加 | `POST /api/agent`,body `{"task":"decompose_wish","wish":"用户的话","nearChoice":"①的选择"}` → `{result:{concerns:[...]}}` |
| ④ 问数 | 可安排金额 + 必须支出;旁边挂可选「帮我算一下」六项清单(房租/水电/通讯/交通/饮食/其他,可空,实时求和,**不给参考值**) | `computeLivingJar(items)` from `@/server/domain/living` |
| ⑤⑥⑦ 倒推+分配+确认 | 展示四罐方案(首屏只显示三个罐,未来罐 0 显示为入口);用户改数字实时重算;点确认才写入 | `applyJarPlan({...})` from `@/lib/plan/apply-jar-plan`,确认时传 `confirmed:true`,然后 `commit(result.state)` |

`applyJarPlan` 入参:`{ baseState: state, disposable, livingPlanned 或 livingItems, dreamGoal?: {name, amount, saved, monthsRemaining}, futurePlanned?, confirmed? }`,返回 `{ state, plan: {living, comfort, dream, future, shortfall, dreamMonthly}, note }`——`note` 是可以直接显示的一句话;`shortfall > 0` 时把差额露出来让用户自己选,**不要自动改任何罐**。

## 首页

- 没有 state → 两个入口:「从零开始」(去起点)+「用合成示例体验」(调 `enterDemo()`)
- 有 state → 小狗 + 罐子 + 碎钻(0 不显示)+ 两个气泡 + 输入框
- **点小狗开场白**:`POST /api/agent`,`{"task":"companion_reply","scene":"greet"}` → `{result:{text, bubbles}}`
- **帮我看看要不要买(决策)**:`{"task":"companion_reply","scene":"decision","userText":"...","stateSummary":{"comfortAvailable": 安心罐.planned - 安心罐.actual}}`。**只传安心罐,生活罐永不计入"可以买"**。回应后给三个中性动作:现在买 / 放到明天 / 这次先不买(三个都不许被夸/被劝)
- **有笔钱想说说(记一笔)**:先 `{"task":"companion_reply","scene":"note"}` 接情绪;用户给金额后确认扣罐:
  ```tsx
  import { commitJarDebit } from "@/server/domain/debit";
  const r = commitJarDebit(state, { jarKind: "comfort", amount: 40000,
    expectedStateVersion: state.stateVersion, idempotencyKey: crypto.randomUUID() });
  commit(r.state);   // r.undoToken 留着做「撤销」按钮 → undoJarDebit(state, token)
  ```
  默认建议安心罐;用户可换罐;「只说说,不改余额」= 什么都不调

## 回看页(FOLLOWUP / REVIEW)

- 到期待回看:`dueReviews(state)` from `@/server/domain/story` → 列表展示「当时的决定」
- 完成回看:`completeReview(state, { storyId, happened, actualAmount?, feelingNote?, expectedStateVersion: state.stateVersion, idempotencyKey: crypto.randomUUID() })` → `commit(r.state)`
- 三种决定没有高下:「这次先不买」的回看不能被庆祝为更好的选择

## 原则卡(PRINCIPLE)

- 触发时机:`principleEligible(state)`(≥3 条已回看)为 true 时才请求生成
- 生成:`generatePrincipleCandidate(state)` from `@/server/agent`(async;**返回 null 时什么都不显示**,不解释为什么)
- 写入候选:`buildCandidate(state, { statement, evidenceIds, ... })`;卡片上「依据」可展开显示那几条故事
- 三个按钮:像我 / 改说法 / 暂不确定 → `resolvePrinciple(state, { id, decision: "like_me"|"edit"|"defer", editedText? })`
- 引用:`confirmedPrinciples(state)` → 折叠显示「参考了:1 条你确认过的原则」,可展开可改可删

## 月度回顾屏(CYCLE_REVIEW)

- 进入时机:`isNewCycle(state)` 为 true 的第一次打开,或用户说工资到账;**不做定时推送**
- 拿候选:`buildCycleReviewProposal(state)` from `@/server/domain/cycle` → 上期数字、重算月供 `dreamMonthly`、方向 `monthlyDirection`、上期结余 `leftover`
- **月供涨了必须给两个方向**:「想的话可以放 X,也可以把时间往后挪一个月,两个都行」——只说前者就是在催她;`deadlinePassed` 为 true 时不能说「没完成」,问要不要往后挪或就用现在这些先去
- 用户改完确认:`confirmCycleReview(state, { disposable, livingPlanned, dreamMonthly?, extendMonths?, ... })` → `commit(r.state)`
- 这一屏是引用原则最自然的落点:「上次你发现___,这次还沿用吗?」

## 碎钻(结余)

- 显示:`state.leftover.amount`(为 0 不显示);三档大小按额度分段,低饱和弱高光
- 点开:金额 + `history` 明细(从哪个月哪个罐来)→ 选去哪个罐 → 可填部分金额 → 确认:`moveLeftover(state, { toKind, amount, ... })` → `commit(r.state)`,返回的 `movedNote`(「好,这个月就松一点了。」)直接显示
- **三条动效红线**:变多不庆祝(不发光不弹窗)、不计数(没有角标)、变少不失落(小狗不垂耳朵)

## 现在页面的处置

`src/app/page.tsx` 是 B 垫的临时占位,整页推倒重做,不用保留任何东西。
