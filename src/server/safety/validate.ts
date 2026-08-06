import type { DecisionStory } from "@/contracts";
import { FORBIDDEN_WORDS } from "./forbidden-words";

/**
 * 语气硬校验层。模型输出在这里过闸,不合格的回应/原则宁可不要:
 * 一条像贴标签的原则,伤害比没有原则大得多。
 */

export interface ValidationFailure {
  rule: "forbidden_words" | "max_sentences" | "max_length" | "first_person" | "evidence";
  message: string;
}

export function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter((w) => text.includes(w));
}

/** 对话回应:无禁用词、最多三句 */
export function validateReplyText(text: string): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const hits = findForbiddenWords(text);
  if (hits.length > 0) {
    failures.push({ rule: "forbidden_words", message: `包含禁用词:${hits.join("、")}` });
  }
  const sentences = text.split(/[。!?!?]/).filter((s) => s.trim().length > 0);
  if (sentences.length > 3) {
    failures.push({ rule: "max_sentences", message: `超过三句(${sentences.length} 句)` });
  }
  return failures;
}

const MAX_STATEMENT_CODEPOINTS = 25;

/** 候选原则:禁用词 / ≤25 字(码点)/ 第一人称 / 证据 2-3 条且必须是已回看的故事 */
export function validatePrincipleCandidate(
  candidate: { statement: string; evidenceIds: string[] },
  stories: DecisionStory[]
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const s = candidate.statement.trim();
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
  if (candidate.evidenceIds.length < 2 || candidate.evidenceIds.length > 3) {
    failures.push({ rule: "evidence", message: "证据必须是 2-3 条故事" });
  } else {
    const reviewed = new Set(stories.filter((st) => st.status === "reviewed").map((st) => st.id));
    const missing = candidate.evidenceIds.filter((id) => !reviewed.has(id));
    if (missing.length > 0) {
      failures.push({ rule: "evidence", message: `证据必须指向已回看的故事(无效:${missing.join("、")})` });
    }
  }
  return failures;
}
