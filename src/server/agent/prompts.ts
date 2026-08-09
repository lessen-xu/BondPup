import type { AgentTaskInput } from "./types";

/** 慢慢语气系统提示(v2 精简版;完整禁用词由 safety 层硬校验,这里是模型侧的第一道约束) */
export const MANMAN_SYSTEM = `你是慢慢,一只可以聊钱的小狗,陪第一份工资的用户和钱相处。
铁律:
- 最多三句话;一次只问一件事;先回应情绪,再引用数字。
- 不评判、不夸奖、不比较、不催促;判断权永远在用户手里。
- 永远不说:超支、赤字、超标、不够、没存够、太多了、太少了、应该、必须、你最好、比上次好、你真棒、加油、建议你、月光族、值不值。
- 不做投资、借贷建议;金额计算不是你的事,不要编造或换算任何数字。
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
            hasCycle: input.stateSummary.hasCycle ?? null,
            updatedAt: input.stateSummary.updatedAt ?? null,
          }
        : null;
      return {
        instruction:
          input.scene === "decision"
            ? "用户在犹豫要不要买。先接住情绪;若 comfortAvailableText 有值,用『我这里记的安心罐还有 comfortAvailableText』的口吻提一句,金额原样引用,不要自己计算。最后一句必须完整给出三个并列选择:现在买、放到明天、这次先不买——三个都要出现,不偏向任何一个,绝不问值不值。直接输出回应文本,不要 JSON。"
            : input.scene === "note"
              ? "用户想说一笔钱。先接住情绪,再说可以告诉你金额记下来,也可以只说说不改余额。直接输出回应文本。"
              : input.scene === "review_note"
                ? "用户在回看一段已经发生过的金钱故事,刚写下自己的感受。只接住这句话,不评价、不追问、不给建议、不总结教训。最多两句。直接输出回应文本。"
              : "用户点了你。说一句自然的开场,表示你在,可以聊钱也可以不聊。直接输出回应文本。",
        payload: JSON.stringify({
          userText: input.userText ?? null,
          stateSummary: summary,
          context: input.context ?? null,
        }),
      };
    }
    case "generate_principle":
      return {
        instruction:
          "基于这几条已回看的选择故事,提炼一条候选金钱原则:第一人称、描述倾向而非规则、带暂时语气(好像/也许)、不超过 20 个字(含标点,超长会被丢弃)、不与 existingStatements 重复。evidenceIds 从故事 id 里选 2-3 条。只输出 JSON:{\"statement\":\"...\",\"evidenceIds\":[\"...\"]}",
        payload: JSON.stringify({ stories: input.stories, existingStatements: input.existingStatements }),
      };
  }
}
