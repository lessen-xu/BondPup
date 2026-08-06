import type { AgentTaskInput, AgentTaskOutput } from "./types";
import { runMockAgentTask } from "./mock";

/**
 * Agent 入口。provider 选择:
 * - ANTHROPIC_API_KEY 存在 → Claude 原生 /v1/messages(计划接入:Sonnet 5 + adaptive thinking + effort low)
 * - OPENAI_COMPAT_API_KEY 存在 → 国产模型 OpenAI 兼容端点
 * - 都没有 → 确定性 Mock(评测「无密钥可跑」要求;也是超时/失败的降级路径)
 * 今天(Day-2)只有 Mock;真实适配层接入时此函数签名不变。
 */
export async function runAgentTask(input: AgentTaskInput): Promise<AgentTaskOutput> {
  return runMockAgentTask(input);
}
