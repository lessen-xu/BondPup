import type { DecisionStory } from "@/contracts";
import { FORBIDDEN_WORDS } from "./forbidden-words";

/**
 * 语气硬校验层。模型输出在这里过闸,不合格的回应/原则宁可不要:
 * 一条像贴标签的原则,伤害比没有原则大得多。
 */

export interface ValidationFailure {
  rule: "forbidden_words" | "max_sentences" | "max_length" | "first_person" | "evidence" | "three_actions" | "vague";
  message: string;
}

export function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter((w) => text.includes(w));
}

/** 对话回应:无禁用词、句数不超预算(默认 3;decision 场景摆情况+三选项+交还决定权,预算 5) */
export function validateReplyText(
  text: string,
  opts?: { maxSentences?: number }
): ValidationFailure[] {
  const maxSentences = opts?.maxSentences ?? 3;
  const failures: ValidationFailure[] = [];
  const hits = findForbiddenWords(text);
  if (hits.length > 0) {
    failures.push({ rule: "forbidden_words", message: `包含禁用词:${hits.join("、")}` });
  }
  // ！？ 是全角!?,用转义写死——肉眼分不清全半角,之前就在这里看走眼过
  const sentences = text.split(/[。!?！？]/).filter((s) => s.trim().length > 0);
  if (sentences.length > maxSentences) {
    failures.push({ rule: "max_sentences", message: `超过 ${maxSentences} 句(${sentences.length} 句)` });
  }
  return failures;
}

/**
 * 决策回应的语义闸(冻结规则:三个中性动作,一个都不能少):
 * 必须同时出现「现在买」「放到明天/明天再」「先不买」。
 * 真模型曾只回一句情绪就通过了旧闸——语气合规不等于把三个选项交到她手里。
 */
export function validateDecisionReply(text: string): ValidationFailure[] {
  const failures = validateReplyText(text, { maxSentences: 5 });
  // 容忍常见变体(现在就买/明晚/这次不买):闸门管的是「三个选项都交到她手里」,不是字面背诵
  const missing: string[] = [];
  if (!/现在(就)?买|今天(就)?买/.test(text)) missing.push("现在买");
  if (!/放到明天|明天再|明晚|放一晚|明天(再)?(看|说|定|决定)/.test(text)) missing.push("放到明天");
  if (!/先不买|这次不买|这回不买/.test(text)) missing.push("这次先不买");
  if (missing.length > 0) {
    failures.push({ rule: "three_actions", message: `缺少选项:${missing.join("、")}` });
  }
  return failures;
}

const MAX_STATEMENT_CODEPOINTS = 25;

/** 原则语句本身的规则(候选生成与用户改说法共用):禁用词 / ≤25 码点 / 第一人称 */
export function validatePrincipleStatement(statement: string): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const s = statement.trim();
  const hits = findForbiddenWords(s);
  if (hits.length > 0) {
    failures.push({ rule: "forbidden_words", message: `包含禁用词:${hits.join("、")}` });
  }
  if ([...s].length > MAX_STATEMENT_CODEPOINTS) {
    failures.push({ rule: "max_length", message: `超过 ${MAX_STATEMENT_CODEPOINTS} 字` });
  }
  if (!s.includes("我") || s.startsWith("你")) {
    failures.push({ rule: "first_person", message: "必须是第一人称的表述" });
  }
  return failures;
}

/**
 * 候选原则的通用校验:语句规则 + 证据 2-3 条且都在允许的 id 集合内。
 * 持有完整 MoneyState 的调用方用 validatePrincipleCandidate;
 * 只有故事摘要的调用方(/api/agent)直接传摘要里的 id 集合——两条路径同一套规则。
 */
export function validatePrincipleWithIds(
  candidate: { statement: string; evidenceIds: string[] },
  allowedIds: Set<string>
): ValidationFailure[] {
  const failures: ValidationFailure[] = [...validatePrincipleStatement(candidate.statement)];
  if (candidate.evidenceIds.length < 2 || candidate.evidenceIds.length > 3) {
    failures.push({ rule: "evidence", message: "证据必须是 2-3 条故事" });
    return failures;
  }
  const missing = candidate.evidenceIds.filter((id) => !allowedIds.has(id));
  if (missing.length > 0) {
    failures.push({ rule: "evidence", message: `证据必须指向已回看的故事(无效:${missing.join("、")})` });
  }
  return failures;
}

/** 候选原则:语句规则 + 证据 2-3 条且必须是已回看的故事 */
export function validatePrincipleCandidate(
  candidate: { statement: string; evidenceIds: string[] },
  stories: DecisionStory[]
): ValidationFailure[] {
  const reviewed = new Set(stories.filter((st) => st.status === "reviewed").map((st) => st.id));
  return validatePrincipleWithIds(candidate, reviewed);
}
