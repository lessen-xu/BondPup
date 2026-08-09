import type { AgentReply } from "@/contracts";
import type {
  AgentTaskInput,
  AgentTaskOutput,
  DecomposeWishOutput,
  GeneratePrincipleOutput,
} from "./types";

/**
 * 确定性 Mock 实现:无密钥可跑(评测要求),语气遵守慢慢禁用词表。
 * 接入真实模型后由 index.ts 按环境变量切换,本文件保留作降级路径。
 */

function mockDecompose(
  wish: string,
  nearChoice?: string,
  goal?: { name: string; amount: number; monthsRemaining: number },
): DecomposeWishOutput {
  const concerns: string[] = [];
  const w = wish + (nearChoice ?? "");
  if (goal?.name.trim()) concerns.push(`为${goal.name.trim()}留出一笔专用的钱`);
  if (/日本|旅行|旅游/.test(w)) concerns.push("为去日本旅行留出一笔专用的钱");
  if (/上海|城市|过得还不错/.test(w)) concerns.push("在上海把这个月过得舒展一点");
  if (/攒|存|留/.test(w)) concerns.push("每个月能留下一点,不用很多");
  if (/舒服|享受|花|玩|吃/.test(w)) concerns.push("想花的时候可以不愧疚地花");
  if (/房租|房|住/.test(w)) concerns.push("住的地方要先安排稳");
  if (/旅|去|看|买|学/.test(w)) concerns.push("有一件具体想做的事,想离它近一点");
  // 兜底要具体到能想象出画面(评审超时降级看到的就是这几句),但仍是用户视角、不含建议
  const fallbacks = [
    "房租和吃饭这些固定的,先稳稳留出来",
    "每周能有一顿和朋友的饭,不用抠着算",
    "月底手里还有点余量,不用数着日子等工资",
  ];
  for (const f of fallbacks) {
    if (concerns.length >= 3) break;
    if (!concerns.includes(f)) concerns.push(f);
  }
  return { concerns: concerns.slice(0, 4) };
}

function mockReply(input: Extract<AgentTaskInput, { task: "companion_reply" }>): AgentReply {
  const comfort = input.stateSummary?.comfortAvailable;
  switch (input.scene) {
    case "greet":
      return {
        text: "我在呢。今天想聊聊钱,还是就坐一会儿?",
        bubbles: ["帮我看看要不要买", "有笔钱想说说"],
        requiresConfirmation: false,
      };
    case "decision": {
      const line =
        comfort !== undefined
          ? `我这里记的安心罐还有 ${comfort % 100 === 0 ? comfort / 100 : (comfort / 100).toFixed(2)} 元,这部分是可以放心用的。`
          : "我这里还没有记这个月的安排,不过可以先聊聊这件东西。";
      return {
        text: `听起来你已经想了一会儿了。${line}你可以现在买,也可以放到明天,或者这次先不买——三个都行。`,
        requiresConfirmation: false,
      };
    }
    case "note":
      return {
        text: "临时改变安排,心里有点不踏实很正常。想记下来的话告诉我金额,只想说说也可以。",
        requiresConfirmation: false,
      };
    case "review_note":
      return {
        text: "我听见了。你说的这句,我会留着。",
        requiresConfirmation: false,
      };
  }
}

/** 模板池:第一人称、描述倾向、带暂时语气、≤25 码点、无禁用词 */
const PRINCIPLE_TEMPLATES: { match: (actions: string[]) => boolean; statement: string }[] = [
  {
    match: (a) => a.filter((x) => x === "defer").length >= 2,
    statement: "我放一晚再决定,好像更踏实",
  },
  {
    match: (a) => a.filter((x) => x === "buy_now").length >= 2,
    statement: "我花在想了很久的东西上,不太后悔",
  },
  {
    match: (a) => a.filter((x) => x === "skip_this_time").length >= 2,
    statement: "我好像想先看它会不会进入生活",
  },
  { match: () => true, statement: "我不是舍不得花,是想先看清它" },
];

function mockPrinciple(
  input: Extract<AgentTaskInput, { task: "generate_principle" }>
): GeneratePrincipleOutput {
  const actions = input.stories.map((s) => s.action);
  const pool = PRINCIPLE_TEMPLATES.filter(
    (t) => !input.existingStatements.includes(t.statement)
  );
  const matched = pool.filter((t) => t.match(actions));
  const pick = matched[Math.min(input.attempt, matched.length - 1)] ?? PRINCIPLE_TEMPLATES[3];
  return {
    statement: pick.statement,
    evidenceIds: input.stories.slice(-3).map((s) => s.id),
  };
}

export function runMockAgentTask(input: AgentTaskInput): AgentTaskOutput {
  if (input.task === "decompose_wish") {
    return { task: "decompose_wish", result: mockDecompose(input.wish, input.nearChoice, input.goal) };
  }
  if (input.task === "generate_principle") {
    return { task: "generate_principle", result: mockPrinciple(input) };
  }
  return { task: "companion_reply", result: mockReply(input) };
}
