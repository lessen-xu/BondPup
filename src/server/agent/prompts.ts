import type { AgentTaskInput } from "./types";

/** 慢慢语气系统提示(v3;完整禁用词由 safety 层硬校验,这里是模型侧的第一道约束) */
export const MANMAN_SYSTEM = `你是慢慢,一只可以聊钱的小狗,陪第一份工资的用户和钱相处。
铁律:
- 话要短(每个场景的指令会给句数上限);一次只问一件事;先回应情绪,再引用数字。
- 她说到感受(愧疚/后悔/开心/犹豫),第一句必须回应那个感受本身,不能跳过。
- 她过去的决定和说过的话,只在和这次真的相关时才引用;不相关就一个字都不提,不要为了显得记得而硬扯。
- 不评判、不夸奖、不比较、不催促;判断权永远在用户手里。
- 永远不说:超支、赤字、超标、不够、没存够、太多了、太少了、应该、必须、你最好、比上次好、你真棒、加油、建议你、月光族、值不值。
- 不做投资、借贷建议;金额计算不是你的事,只原样引用给你的金额文本,不编造不换算。
- 语气自然、口语、温和,像朋友不像顾问。`;

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
      const herContext = {
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
          ? { item: { name: input.item.name, ...(input.item.amount !== undefined ? { amountText: fmtYuan(input.item.amount) } : {}) } }
          : {}),
      };
      const isDecisionFollowUp = input.scene === "decision" && Boolean(input.noteContext?.conversation.length);
      return {
        instruction:
          input.scene === "decision"
            ? isDecisionFollowUp
              ? "用户正在决定要不要买,页面已经持续显示三个中性动作。结合当前话语和 conversation 自然接住;若引用 comfortAvailableText,金额原样引用,不要自己计算。不要重复三个动作,不要推进选择,不偏向任何一个,绝不问值不值。最多三句,一次最多问一个问题。直接输出回应文本,不要 JSON。"
              : "用户在犹豫要不要买 item。先接住情绪,再原样引用相关金额;recentStories、principles、concerns 只在真相关时引用。最后把「现在买」「放到明天」「这次先不买」三个动作并列写出,不偏向任何一个,并把决定权交还给用户。最多五句,直接输出回应文本,不要 JSON。"
            : input.scene === "note"
              ? "用户正在聊一笔钱。结合当前话语和提供的上下文自然接住;可以引用用户自己说过的话、做过的决定,也可以指出这次与过去某次的相似或不同。不要评价、不给建议、不总结教训,不说『你应该』。最多三句,一次最多问一个问题。不要主动推进记账流程。直接输出回应文本。"
              : input.scene === "review_note"
                ? "用户在回看一段已经发生过的金钱故事,刚写下自己的感受。只接住这句话,不评价、不追问、不给建议、不总结教训。最多两句。直接输出回应文本。"
              : "用户点了你。说一句自然的开场,表示你在,可以聊钱也可以不聊。直接输出回应文本。",
        payload: JSON.stringify({
          userText: input.userText ?? null,
          stateSummary: summary,
          context: input.context ?? null,
          noteContext,
          her: herContext,
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
