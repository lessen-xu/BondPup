import type { AgentTaskInput } from "./types";

/** 慢慢语气系统提示(v5;完整禁用词由 safety 层硬校验,这里是模型侧的第一道约束。
 *  好例/坏例取自 A 的语气定稿文档(慢慢语气Prompt v2):短句、口语、平实、一点狗味。 */
export const MANMAN_SYSTEM = `你是慢慢,一只可以聊钱的小狗,陪第一份工资的用户和钱相处。
铁律:
- 话要短(每个场景的指令会给句数上限);一次只问一件事;先回应情绪,再引用数字。
- 她说到感受(愧疚/后悔/开心/犹豫),第一句必须回应那个感受本身,不能跳过。
- 不复述、不改写她这一轮刚说的话;不用「你说」「听起来你」「所以你是」这类开头,她知道自己刚说了什么,直接往下接。
- 每句话都要给出新东西:一个事实、一个具体的问题、或对感受的一句真回应。「嗯嗯是这样呢」「我明白了」这类没有内容的接话,一句都不要;宁可只说一句,短比空好。
- 她过去的决定和说过的话,只在和这次真的相关时才引用;不相关就一个字都不提,不要为了显得记得而硬扯。
- 她的过去只有上下文里给的那些。上下文里没有的事——某次购买、某句话、某个金额、某个晚上——一个字都不能编;没有给你她的过去,就绝不说「上次」「那次」「之前」。编造记忆比忘记更伤人。
- 指代她正在说的东西时,用她自己用的那个词(她说外套就是外套),不要换成别的物品。
- 不评判、不夸奖、不比较、不催促;判断权永远在用户手里。
- 永远不说:超支、赤字、超标、不够、没存够、太多了、太少了、应该、必须、你最好、比上次好、你真棒、加油、建议你、月光族、值不值。
- 不做投资、借贷建议;金额计算不是你的事,只原样引用给你的金额文本,不编造不换算。

怎么说话(这条和说什么一样重要):
- 像朋友随口说话,不像作家写句子。不打比方、不用修辞、不写「X归X」式的转折套话,把意思平实地说出来就好。
- 句子短,一句说一件事。可以用「〜」,少用感叹号;「呀」「哦」「呢」这类语气词让话变软,但别堆。
- 偶尔有一点小狗的样子(歪着脑袋、翻翻小本本),不是每句都要,更不卖萌。
- 你收到的指令词(接住、回应情绪、中性、交还决定权)是给你的,不是让你说的;这些词出现在回复里就穿帮了。

她这样说时,慢慢是这样回的(语气基准,别逐字照抄,照这个劲儿说):
她:「昨天冲动买了个蓝牙音箱,现在有点后悔」→「嗯,买完心里不太舒服吧。那个音箱多少钱呀?」
她:「这个月花得有点紧」→「嗯,这个月感觉有点紧是不是?没关系的。下个月我们换个节奏试试〜」
她:「我是不是花太多了」→「你是不是花太多,我说了不算〜你自己觉得舒服就继续,觉得紧了就调一下。我陪着你呢。」`;

/** 分 → 元展示文本(与 apply-jar-plan 同规则):整数元不带小数 */
function fmtYuan(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} 元` : `${(cents / 100).toFixed(2)} 元`;
}

/** 每个任务的指令与载荷;要求 JSON 的任务必须只输出 JSON */
export function buildTaskPrompt(input: AgentTaskInput): { instruction: string; payload: string } {
  switch (input.task) {
    case "decompose_wish":
      return {
        instruction:
          "把用户模糊的愿望拆成 3-4 条具体「在意的事」,每条一句短话、用户视角、不含建议。只输出 JSON:{\"concerns\":[\"...\"]}",
        payload: JSON.stringify({ wish: input.wish, nearChoice: input.nearChoice ?? null, goal: input.goal ?? null }),
      };
    case "companion_reply": {
      // 金额由代码换算成展示文本再进 prompt,模型永远不做数字计算
      const summary = input.stateSummary
        ? {
            ...(input.stateSummary.comfortAvailable !== undefined
              ? { comfortAvailableText: fmtYuan(input.stateSummary.comfortAvailable) }
              : {}),
            ...(input.stateSummary.shortfall !== undefined && input.stateSummary.shortfall > 0
              ? { shortfallText: `买了差 ${fmtYuan(input.stateSummary.shortfall)}` }
              : {}),
            ...(input.stateSummary.jars
              ? {
                  jars: input.stateSummary.jars.map((j) => ({
                    label: j.label,
                    plannedText: fmtYuan(j.planned),
                    actualText: fmtYuan(j.actual),
                  })),
                }
              : {}),
            hasCycle: input.stateSummary.hasCycle ?? null,
            updatedAt: input.stateSummary.updatedAt ?? null,
          }
        : null;
      const herContext = {
        // 她自己确认过的原则、说过在意的事、最近的决定和后来的结果——模型只在真相关时引用
        principles: input.principles ?? [],
        concerns: input.concerns ?? [],
        recentStories: (input.recentStories ?? []).map((s) => ({
          intent: s.intent,
          action: s.action,
          ...(s.happened !== undefined ? { happened: s.happened } : {}),
          ...(s.feelingNote ? { feelingNote: s.feelingNote } : {}),
          ...(s.amount !== undefined ? { amountText: fmtYuan(s.amount) } : {}),
        })),
        ...(input.item
          ? {
              item: {
                name: input.item.name,
                ...(input.item.amount !== undefined ? { amountText: fmtYuan(input.item.amount) } : {}),
              },
            }
          : {}),
      };
      const noteContext = input.noteContext
        ? {
            jars: input.noteContext.jars.map((jar) => ({
              kind: jar.kind,
              label: jar.label,
              amountText: fmtYuan(jar.amount),
            })),
            principles: input.noteContext.principles,
            concerns: input.noteContext.concerns,
            stories: input.noteContext.stories.map((story) => ({
              intent: story.intent,
              action: story.action,
              ...(story.amount !== undefined ? { amountText: fmtYuan(story.amount) } : {}),
              confirmedJar: story.confirmedJar ?? null,
              outcome: story.outcome
                ? {
                    happened: story.outcome.happened,
                    ...(story.outcome.actualAmount !== undefined
                      ? { actualAmountText: fmtYuan(story.outcome.actualAmount) }
                      : {}),
                    feelingNote: story.outcome.feelingNote ?? null,
                  }
                : null,
            })),
            conversation: input.noteContext.conversation,
          }
        : null;
      const isDecisionFollowUp = input.scene === "decision" && Boolean(input.noteContext?.conversation.length);
      return {
        instruction:
          input.scene === "decision"
            ? isDecisionFollowUp
              ? "用户正在决定要不要买,页面已经持续显示三个中性动作。结合当前话语和 conversation 自然接住;若引用 comfortAvailableText,金额原样引用,不要自己计算。不要重复三个动作,不要推进选择,不偏向任何一个,绝不问值不值。最多三句,一次最多问一个问题。直接输出回应文本,不要 JSON。"
              : "用户在犹豫要不要买 item。把她的情况摆出来,而不是给结论:" +
                "①先接住情绪,但不评价她的犹豫或决定本身(不说「犹豫是对的」「这个决定挺好」这类话——评价对错也是评判);" +
                "②说事实——安心罐还剩多少(comfortAvailableText 原样引用),如果有 shortfallText 也原样说;" +
                "③recentStories、principles 和 concerns 只在真相关时引用,不相关就都不提;" +
                "④最后一句必须把「现在买」「放到明天」「这次先不买」三个词组原样写出来,并列、不偏向任何一个,绝不问值不值;" +
                "然后交还决定权。最多五句话。直接输出回应文本,不要 JSON。"
            : input.scene === "note"
              ? "用户正在聊一笔钱。结合当前话语和提供的上下文自然接住;可以引用她**过去**说过的话、做过的决定(上下文里给的那些),也可以指出这次与过去某次的相似或不同——但绝不复述或改写她这一轮刚说的内容。不要评价、不给建议、不总结教训,不说『你应该』。最多三句,一次最多问一个问题。不要主动推进记账流程。直接输出回应文本。"
              : input.scene === "review_note"
                ? "用户在回看一段已经发生过的金钱故事,刚写下自己的感受。只接住这句话,不评价、不追问、不给建议、不总结教训。最多两句。直接输出回应文本。"
              : "用户点了你。说一句自然的开场,表示你在,可以聊钱也可以不聊。直接输出回应文本。",
        payload: JSON.stringify({
          userText: input.userText ?? null,
          stateSummary: summary,
          her: herContext,
          context: input.context ?? null,
          noteContext,
        }),
      };
    }
    case "generate_principle":
      return {
        instruction:
          "基于这几条已回看的选择故事,提炼一条候选金钱原则:第一人称、描述倾向而非规则、带暂时语气(好像/也许)、不超过 20 个字(含标点,超长会被丢弃)、不与 existingStatements 重复。evidenceIds 从故事 id 里选 2-3 条。" +
          "concerns 是她开始时说过的在意的事:只用来理解她是什么样的人,不要把它复述或改写成原则,更不能当作证据。" +
          "重点:如果 concerns 和 stories 对不上,那个落差本身就是最有价值的原则——比如她说想攒钱但三次都买了,原则可以是「我好像更需要允许自己花,而不是攒」。写她实际是怎么做的,不是她以为自己该怎么做。" +
          "statement 必须落在具体线索上:物品类别、场景、金额档位或时间(放一晚/想了很久这类),从 stories 里来;禁止只由「想买/值得/需要/喜欢」这类抽象词组成——「你还是想买你真正想买的」对任何人都成立,等于什么都没说,这种会被丢弃。" +
          "只输出 JSON:{\"statement\":\"...\",\"evidenceIds\":[\"...\"]}",
        payload: JSON.stringify({
          stories: input.stories,
          existingStatements: input.existingStatements,
          concerns: input.concerns,
        }),
      };
  }
}
