import type { AgentReply, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import {
  validateDecisionReply,
  validatePrincipleCandidate,
  validatePrincipleWithIds,
  validateReplyText,
} from "@/server/safety/validate";
import { detectSafetyRisk, safetyReplyFor } from "@/server/safety/risk";
import { principleContext, principleEligible } from "@/server/domain/principle";
import type { AgentTaskInput, AgentTaskOutput, GeneratePrincipleOutput } from "./types";
import { runMockAgentTask } from "./mock";
import { runAnthropicTask, runCompatTask } from "./providers";

/**
 * Agent 入口。provider 按环境变量选择:
 * ANTHROPIC_API_KEY → Claude 原生 /v1/messages;OPENAI_COMPAT_API_KEY → 国产兼容端点;
 * 都没有或调用失败/超时 → 确定性 Mock(评测「无密钥可跑」要求,也是降级路径)。
 */
/** 输出闸兜底文案(无禁用词、一句话):回应两次校验不过就用它,不让违规文本出门 */
const SAFE_FALLBACK: AgentReply = {
  text: "我在这儿,你说的我记下了。我们慢慢来。",
  requiresConfirmation: false,
};

export type AgentProvider = "anthropic" | "compat" | "mock";

/** 页面安全分流标记(与 safetyEvent 同源派生;字段名是 API→组件契约,受测试锁定) */
export type AgentSafetyFlag = "crisis" | "debt" | "invest" | "offTopic";

const SAFETY_FLAG: Record<string, AgentSafetyFlag> = {
  self_harm: "crisis",
  debt_loan: "debt",
  investment: "invest",
  generic_emotion: "offTopic",
};

/** 文案来源标识(页面显示「AI 生成/规则生成」用;demo 是前端本地态,服务端不感知) */
export type AgentSource = "ai" | "rule";

export type AgentRunOutput = AgentTaskOutput & {
  provider?: AgentProvider;
  /** ai=真实模型产出;rule=确定性代码产出(Mock/降级/安全回应/兜底) */
  source?: AgentSource;
  /** 输入闸命中时的页面分流标记(crisis 进 SAFETY_EXIT,offTopic 进想聊聊分支) */
  safetyFlags?: AgentSafetyFlag[];
  /** 输入闸命中时的审计草稿(不含原文);持有 moneyState 的一方用 recordSafetyEvent 写入 */
  safetyEvent?: { riskType: string; triggeredRule: string; responseTaken: string };
  /** 真实 provider 失败降级 Mock 时的原因(不含用户输入),便于排查 */
  degraded?: { from: "anthropic" | "compat"; reason: string };
};

function pickProvider(): AgentProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (
    process.env.OPENAI_COMPAT_API_KEY &&
    process.env.OPENAI_COMPAT_BASE_URL &&
    process.env.OPENAI_COMPAT_MODEL
  ) {
    return "compat";
  }
  return "mock";
}

export interface DegradeInfo {
  from: Exclude<AgentProvider, "mock">;
  /** 错误类名与截断消息,不含用户输入 */
  reason: string;
}

async function runProviderTask(
  input: AgentTaskInput
): Promise<{ out: AgentTaskOutput; provider: AgentProvider; degraded?: DegradeInfo }> {
  const provider = pickProvider();
  if (provider !== "mock") {
    try {
      const out =
        provider === "anthropic" ? await runAnthropicTask(input) : await runCompatTask(input);
      return { out, provider };
    } catch (e) {
      // 超时/限流/解析失败 → 确定性 Mock 降级,体验不断;原因入日志(不含用户输入),不静默
      const reason =
        e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 120);
      console.error(
        JSON.stringify({ event: "provider_degraded", provider, task: input.task, reason })
      );
      return { out: runMockAgentTask(input), provider: "mock", degraded: { from: provider, reason } };
    }
  }
  return { out: runMockAgentTask(input), provider: "mock" };
}

export async function runAgentTask(input: AgentTaskInput): Promise<AgentRunOutput> {
  // 输入闸:自伤/借贷/投资/泛化情绪命中 → 绕过模型,统一以 companion_reply 形态返回安全回应
  const userText =
    input.task === "decompose_wish"
      ? [input.wish, input.nearChoice].filter(Boolean).join(" ")
      : input.task === "companion_reply"
        ? input.userText
        : undefined;
  if (userText) {
    const hit = detectSafetyRisk(userText);
    if (hit) {
      return {
        task: "companion_reply",
        result: safetyReplyFor(hit.riskType),
        source: "rule",
        safetyFlags: [SAFETY_FLAG[hit.riskType] ?? "offTopic"],
        safetyEvent: { ...hit, responseTaken: "agent_safety_reply" },
      };
    }
  }
  const sourceOf = (p: AgentProvider): AgentSource => (p === "mock" ? "rule" : "ai");
  if (input.task === "generate_principle") {
    return runPrincipleTask(input, sourceOf);
  }
  // 输出闸按场景取校验:decision 走语义闸(三选项缺一不可,句数预算 5),
  // review_note 预算 2,其余 3。不合格 → 重试一次 → 仍不合格用确定性兜底,绝不放行。
  const gate = (text: string) => {
    if (input.task !== "companion_reply") return [];
    if (input.scene === "decision") {
      return input.noteContext?.conversation.length
        ? validateReplyText(text, { maxSentences: 3 })
        : validateDecisionReply(text);
    }
    return validateReplyText(text, { maxSentences: input.scene === "review_note" ? 2 : 3 });
  };
  const { out, provider, degraded } = await runProviderTask(input);
  if (out.task === "companion_reply" && gate(out.result.text).length > 0) {
    const retry = await runProviderTask(input);
    if (retry.out.task === "companion_reply" && gate(retry.out.result.text).length === 0) {
      return {
        ...retry.out,
        provider: retry.provider,
        source: sourceOf(retry.provider),
        ...(retry.degraded ? { degraded: retry.degraded } : {}),
      };
    }
    // 兜底是规则产物,即使 provider 是真模型也标 rule。
    // decision 场景兜底用确定性 Mock 回应(三选项天然齐全),其余用安全兜底文案。
    if (input.task === "companion_reply" && input.scene === "decision") {
      const mock = runMockAgentTask(input);
      if (mock.task === "companion_reply") {
        return { ...mock, provider, source: "rule" };
      }
    }
    return { task: "companion_reply", result: SAFE_FALLBACK, provider, source: "rule" };
  }
  return { ...out, provider, source: sourceOf(provider), ...(degraded ? { degraded } : {}) };
}

/**
 * 原则任务的统一编排(网页与 MCP 同一条路径):
 * 真模型生成 → safety 校验 → 不合规重试一次 → 仍不合规按 v7.4「宁缺毋滥」不提
 * (一条像贴标签的原则,伤害比没有原则大)。
 * 例外:deterministicFallback=true(演示模式由前端显式传)时用确定性 Mock 候选兜底,
 * 评委路径不断;兜底是代码产物,source 标 rule。校验只此一处,前端不再自设闸门。
 */
/**
 * 空泛度检查(只用于真模型输出;Mock 模板人工审过且承担 demo 兜底,免检):
 * 「你还是想买你真正想买的」这类对任何人都成立的话,对她没用——
 * statement 必须带具体线索:出现证据故事里的实义词、或数字/金额、或时间词。
 */
const VAGUE_STOPWORDS = new Set([
  "还是", "觉得", "感觉", "自己", "东西", "时候", "有点", "一个", "这个", "那个",
  "什么", "真正", "想买", "想要", "喜欢", "需要", "值得", "决定", "已经", "后来",
  "因为", "所以", "可能", "如果", "好像", "也许", "不太", "没有", "就是", "但是",
]);

export function isVague(
  statement: string,
  stories: { intent: string; feelingNote?: string }[]
): boolean {
  if (/\d|[一两二三四五六七八九十百千万]+\s*元/.test(statement)) return false;
  if (/[天晚周月年久次]/.test(statement)) return false;
  // 证据故事的实义词(≥2 字连续片段,剔除虚词/抽象词)出现在 statement 里才算具体——
  // 「你还是想买你真正想买的」靠「还是/想买」是蒙混不过去的
  for (const s of stories) {
    const text = `${s.intent}${s.feelingNote ?? ""}`;
    for (let i = 0; i + 2 <= text.length; i++) {
      const piece = text.slice(i, i + 2);
      if (!/^[一-鿿]{2}$/.test(piece)) continue;
      if (VAGUE_STOPWORDS.has(piece)) continue;
      if (statement.includes(piece)) return false;
    }
  }
  return true;
}

async function runPrincipleTask(
  input: Extract<AgentTaskInput, { task: "generate_principle" }>,
  sourceOf: (p: AgentProvider) => AgentSource
): Promise<AgentRunOutput> {
  const allowedIds = new Set(input.stories.map((s) => s.id));
  const check = (c: GeneratePrincipleOutput) => validatePrincipleWithIds(c, allowedIds).length === 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { out, provider, degraded } = await runProviderTask({ ...input, attempt });
    if (out.task === "generate_principle" && check(out.result)) {
      if (provider !== "mock" && isVague(out.result.statement, input.stories)) {
        continue; // 正确的废话:宁可重试/不提,也不给一条对谁都成立的原则
      }
      return { ...out, provider, source: sourceOf(provider), ...(degraded ? { degraded } : {}) };
    }
  }
  if (input.deterministicFallback) {
    const fallback = runMockAgentTask({ ...input, attempt: 0 });
    if (fallback.task === "generate_principle" && check(fallback.result)) {
      return { ...fallback, provider: "mock", source: "rule" };
    }
  }
  throw new DomainError("validation_error", "这次先不提炼原则,证据还不够");
}

type PrincipleGenerator = (
  input: Extract<AgentTaskInput, { task: "generate_principle" }>
) => Promise<GeneratePrincipleOutput>;

const defaultGenerator: PrincipleGenerator = async (input) => {
  const out = await runAgentTask(input);
  if (out.task !== "generate_principle") throw new Error("unexpected task output");
  return out.result;
};

/**
 * 候选原则编排:资格检查 → 生成 → safety 校验 → 失败重试一次 → 再失败返回 null(静默不提)。
 * 一条像贴标签的原则,伤害比没有原则大——所以宁缺毋滥。
 * generator 可注入(测试用);接真模型后默认走 runAgentTask,编排不变。
 */
export async function generatePrincipleCandidate(
  state: MoneyState,
  generator: PrincipleGenerator = defaultGenerator
): Promise<GeneratePrincipleOutput | null> {
  if (!principleEligible(state)) return null;
  const { evidence, existingStatements } = principleContext(state);
  const baseInput = {
    task: "generate_principle" as const,
    stories: evidence.map((s) => ({
      id: s.id,
      intent: s.intent,
      action: s.action,
      ...(s.outcome ? { happened: s.outcome.happened } : {}),
      ...(s.outcome?.feelingNote ? { feelingNote: s.outcome.feelingNote } : {}),
    })),
    existingStatements,
    // 起点问卷「在意的事」同源接入(与网页路径同一字段);只作背景,校验层保证不进 evidence
    concerns: state.profile.expressionPrefs ?? [],
    deterministicFallback: false,
    attempt: 0,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const candidate = await generator({ ...baseInput, attempt });
      if (validatePrincipleCandidate(candidate, state.stories).length === 0) {
        return candidate;
      }
    } catch {
      // 生成失败与校验失败同等对待:重试一次,再失败静默
    }
  }
  return null;
}
