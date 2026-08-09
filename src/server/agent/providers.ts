import Anthropic from "@anthropic-ai/sdk";
import { DecomposeWishOutput, GeneratePrincipleOutput } from "./types";
import type { AgentTaskInput, AgentTaskOutput } from "./types";
import { buildTaskPrompt, MANMAN_SYSTEM } from "./prompts";

/**
 * 真实模型 provider。约束(官方文档核验):Sonnet 5 不传 temperature/top_p/top_k/prefill;
 * thinking 省略即默认 adaptive;低延迟用 output_config.effort=low。
 * 单次预算 8s、provider 层不重试(输出闸已有一次重试);任何失败由 index.ts 降级到 Mock。
 * 客户端默认超时 10s(src/lib/agent/client.ts)> 单次预算,避免网页放弃后服务端继续计费。
 */

const TIMEOUT_MS = 8000;

/** 模型输出里抠 JSON(容忍 ```json 围栏与前后闲话) */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型输出中没有 JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

/** 文本 → 任务输出(zod 严格校验,失败抛错交给上层降级) */
function parseTaskOutput(input: AgentTaskInput, text: string): AgentTaskOutput {
  switch (input.task) {
    case "decompose_wish":
      return { task: "decompose_wish", result: DecomposeWishOutput.parse(extractJson(text)) };
    case "generate_principle":
      return { task: "generate_principle", result: GeneratePrincipleOutput.parse(extractJson(text)) };
    case "companion_reply": {
      const t = text.trim();
      if (!t) throw new Error("模型输出为空");
      return {
        task: "companion_reply",
        result: {
          text: t,
          ...(input.scene === "greet" ? { bubbles: ["帮我看看要不要买", "记一笔钱"] } : {}),
          requiresConfirmation: false,
        },
      };
    }
  }
}

export async function runAnthropicTask(input: AgentTaskInput): Promise<AgentTaskOutput> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
  const { instruction, payload } = buildTaskPrompt(input);
  const params: Record<string, unknown> = {
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    max_tokens: 1000,
    system: MANMAN_SYSTEM,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: `${instruction}\n\n${payload}` }],
  };
  const msg = (await client.messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming
  )) as Anthropic.Message;
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseTaskOutput(input, text);
}

export async function runCompatTask(input: AgentTaskInput): Promise<AgentTaskOutput> {
  const base = process.env.OPENAI_COMPAT_BASE_URL!.replace(/\/$/, "");
  const { instruction, payload } = buildTaskPrompt(input);
  let lastError: unknown;
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model: process.env.OPENAI_COMPAT_MODEL,
        max_tokens: 1000,
        messages: [
          { role: "system", content: MANMAN_SYSTEM },
          { role: "user", content: `${instruction}\n\n${payload}` },
        ],
      };
      // DeepSeek 默认开思考,generate_principle 会长考近千 token(实测 9.2s,爆 8s 预算);
      // 关掉后 1.4s。thinking 是 DeepSeek 方言参数,只对 deepseek 端点发,不污染其他兼容端点
      if (base.includes("deepseek")) {
        body.thinking = { type: "disabled" };
      }
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_COMPAT_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`兼容端点 ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      return parseTaskOutput(input, text);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
