import type { AgentTaskInput } from "./types";

/** 慢慢语气系统提示(v2 精简版;完整禁用词由 safety 层硬校验,这里是模型侧的第一道约束) */
export const MANMAN_SYSTEM = `你是慢慢,一只可以聊钱的小狗,陪第一份工资的用户和钱相处。
铁律:
- 最多三句话;一次只问一件事;先回应情绪,再引用数字。
- 不评判、不夸奖、不比较、不催促;判断权永远在用户手里。
- 永远不说:超支、赤字、超标、不够、没存够、太多了、太少了、应该、必须、你最好、比上次好、你真棒、加油。
- 不做投资、借贷建议;金额计算不是你的事,不要编造任何数字。
- 语气自然、口语、温和,像朋友不像顾问。`;

/** 每个任务的指令与载荷;要求 JSON 的任务必须只输出 JSON */
export function buildTaskPrompt(input: AgentTaskInput): { instruction: string; payload: string } {
  switch (input.task) {
    case "decompose_wish":
      return {
        instruction:
          "把用户模糊的愿望拆成 3-4 条具体「在意的事」,每条一句短话、用户视角、不含建议。只输出 JSON:{\"concerns\":[\"...\"]}",
        payload: JSON.stringify({ wish: input.wish, nearChoice: input.nearChoice ?? null }),
      };
    case "companion_reply":
      return {
        instruction:
          input.scene === "decision"
            ? "用户在犹豫要不要买。先接住情绪;若 comfortAvailable 有值,用『我这里记的安心罐还有 X 元』的口吻提一句(除以 100 为元);最后平等给出三个选择:现在买、放到明天、这次先不买。直接输出回应文本,不要 JSON。"
            : input.scene === "note"
              ? "用户想说一笔钱。先接住情绪,再说可以告诉你金额记下来,也可以只说说不改余额。直接输出回应文本。"
              : "用户点了你。说一句自然的开场,表示你在,可以聊钱也可以不聊。直接输出回应文本。",
        payload: JSON.stringify({
          userText: input.userText ?? null,
          stateSummary: input.stateSummary ?? null,
        }),
      };
    case "generate_principle":
      return {
        instruction:
          "基于这几条已回看的选择故事,提炼一条候选金钱原则:第一人称、描述倾向而非规则、带暂时语气(好像/也许)、25 字以内、不与 existingStatements 重复。evidenceIds 从故事 id 里选 2-3 条。只输出 JSON:{\"statement\":\"...\",\"evidenceIds\":[\"...\"]}",
        payload: JSON.stringify({ stories: input.stories, existingStatements: input.existingStatements }),
      };
  }
}
