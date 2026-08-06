import type { AgentReply } from "@/contracts";
import type { AgentTaskInput, AgentTaskOutput, DecomposeWishOutput } from "./types";

/**
 * 确定性 Mock 实现:无密钥可跑(评测要求),语气遵守慢慢禁用词表。
 * 接入真实模型后由 index.ts 按环境变量切换,本文件保留作降级路径。
 */

function mockDecompose(wish: string, nearChoice?: string): DecomposeWishOutput {
  const concerns: string[] = [];
  const w = wish + (nearChoice ?? "");
  if (/攒|存|留/.test(w)) concerns.push("每个月能留下一点,不用很多");
  if (/舒服|享受|花|玩|吃/.test(w)) concerns.push("想花的时候可以不愧疚地花");
  if (/房租|房|住/.test(w)) concerns.push("住的地方要先安排稳");
  if (/旅|去|看|买|学/.test(w)) concerns.push("有一件具体想做的事,想离它近一点");
  const fallbacks = [
    "这个月先过得安稳",
    "给自己留一点自由的空间",
    "想对钱的去向心里有数",
    "不想为花出去的钱后悔",
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
  }
}

export function runMockAgentTask(input: AgentTaskInput): AgentTaskOutput {
  if (input.task === "decompose_wish") {
    return { task: "decompose_wish", result: mockDecompose(input.wish, input.nearChoice) };
  }
  return { task: "companion_reply", result: mockReply(input) };
}
