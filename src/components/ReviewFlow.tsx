"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { JarKind, MoneyPrinciple, MoneyState, StoryAction } from "@/contracts";
import { completeReview } from "@/server/domain/story";
import { buildCandidate, resolvePrinciple } from "@/server/domain/principle";
import { requestAgent } from "@/lib/agent/client";
import { loadMoneyState, useMoneyState } from "@/lib/state/money-store";
import { setDogThinking } from "@/lib/state/dog-state";
import { formatYuan } from "@/mock/decision";
import {
  REVIEW_ACTION_LABELS,
  REVIEW_CARD,
  REVIEW_CONFIRM_DEDUCT,
  REVIEW_NAV,
  REVIEW_OPTIONS,
  REVIEW_RESPONSES,
  REVIEW_ASK_JAR,
  REVIEW_STEP1,
  REVIEW_STEP3,
  REVIEW_STEP4,
  PRINCIPLE_CANDIDATE,
  ERRORS,
} from "@/mock/剧本";
import { Dog } from "./Dog";
import { HandDrawnUnderline } from "./HandDrawnUnderline";
import { LoadingState } from "./LoadingState";

type ReviewMode = "now" | "tomorrow" | "skip";
type ReviewStep = "detail" | "response" | "whichJar" | "confirmDebit" | "note" | "principle" | "done";

function isStateConflict(cause: unknown): boolean {
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "state_conflict");
}

const ACTION_MODE: Record<StoryAction, ReviewMode | null> = {
  buy_now: "now",
  defer: "tomorrow",
  skip_this_time: "skip",
  note_only: null,
};

const JAR_NAMES: Record<JarKind, string> = {
  living: "生活罐",
  comfort: "安心罐",
  dream: "梦想罐",
  future: "未来罐",
};

const HAPPENED_OUTCOMES = new Set([
  "用过几次",
  "还没怎么用",
  "说不上来",
  "后来买了",
  "后来还是买了",
]);

type CandidateOutput = { statement: string; evidenceIds: string[] };
type ProposedPrinciple = { state: MoneyState; principle: MoneyPrinciple };
type PrincipleProposal =
  | { kind: "candidate"; value: ProposedPrinciple }
  | { kind: "skipped" }
  | { kind: "none" };

function replaceAlias(text: string, alias: string): string {
  return text.replaceAll("{alias}", alias);
}

function limitReplyToTwoSentences(text: string): string {
  const parts = text.match(/[^。！？!?]*[。！？!?]?/g)?.filter((part) => part.trim()) ?? [];
  return parts.slice(0, 2).join("").trim() || "嗯,我记下了。这句我留着。";
}

async function proposePrinciple(state: MoneyState): Promise<PrincipleProposal> {
  const reviewed = state.stories.filter((story) => story.status === "reviewed");
  if (reviewed.length < 3) return { kind: "none" };
  const evidence = reviewed.slice(-3);
  const evidenceIds = evidence.map((story) => story.id);
  const evidenceKey = [...evidenceIds].sort().join("|");
  if (state.principles.some((principle) => [...principle.evidenceIds].sort().join("|") === evidenceKey)) return { kind: "none" };
  const response = await requestAgent({
    task: "generate_principle",
    stories: evidence.map((story) => ({
      id: story.id,
      intent: story.intent,
      action: story.action,
      ...(story.outcome ? { happened: story.outcome.happened } : {}),
      ...(story.outcome?.feelingNote ? { feelingNote: story.outcome.feelingNote } : {}),
    })),
    existingStatements: state.principles
      .filter((principle) => principle.status === "confirmed" || principle.status === "edited")
      .map((principle) => principle.statement),
    // 演示模式评委路径不能概率性断:真模型两轮都被严闸拒掉时用确定性候选兜底;
    // 真实模式保持 v7.4 宁缺毋滥(不传即 false)
    deterministicFallback: state.demo,
    attempt: 0,
  });
  if (!response.ok) {
    return !state.demo && response.issue === "validation"
      ? { kind: "skipped" }
      : { kind: "none" };
  }
  if (!response.payload || typeof response.payload !== "object") return { kind: "none" };
  const payload = response.payload as { result?: CandidateOutput };
  const candidate = payload.result;
  if (!candidate || typeof candidate.statement !== "string" || !Array.isArray(candidate.evidenceIds)) return { kind: "none" };
  try {
    const result = buildCandidate(state, {
      statement: candidate.statement,
      evidenceIds: candidate.evidenceIds,
      expectedStateVersion: state.stateVersion,
      idempotencyKey: globalThis.crypto.randomUUID(),
    });
    return { kind: "candidate", value: { state: result.state, principle: result.principle } };
  } catch {
    return { kind: "none" };
  }
}

export function ReviewFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, ready, commit } = useMoneyState();
  const storyId = params.get("id");
  const record = useMemo(() => state?.stories.find((item) => item.id === storyId) ?? null, [state, storyId]);
  const alias = state?.profile.dogName?.trim() || "慢慢";
  const [step, setStep] = useState<ReviewStep>("detail");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedJar, setSelectedJar] = useState<JarKind | null>(null);
  const [noteLead, setNoteLead] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reviewReply, setReviewReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dogState, setDogState] = useState<"ears" | null>(null);
  const [candidate, setCandidate] = useState<MoneyPrinciple | null>(null);
  const [candidateEvidenceOpen, setCandidateEvidenceOpen] = useState(false);
  const [candidateEditing, setCandidateEditing] = useState(false);
  const [candidateEditText, setCandidateEditText] = useState("");
  const [principleSkipped, setPrincipleSkipped] = useState(false);

  useEffect(() => () => {
    setDogThinking(false);
  }, []);

  if (!ready) return <LoadingState />;
  if (!state || !record) {
    return <main className="empty-home-loading"><button className="simple-back" type="button" onClick={() => router.push("/")} aria-label="返回首页">返回首页</button></main>;
  }

  const currentState = state;
  const currentRecord = record;

  const mode = ACTION_MODE[currentRecord.action];
  const item = currentRecord.intent;
  const price = currentRecord.amount === undefined ? "" : formatYuan(currentRecord.amount);
  const action = REVIEW_ACTION_LABELS[currentRecord.action as keyof typeof REVIEW_ACTION_LABELS] ?? "这件事";
  const summaryTemplate = price ? REVIEW_STEP1.summary : REVIEW_STEP1.summary.replace("，{price}元", "");
  const summary = summaryTemplate.replace("{item}", item).replace("{price}", price).replace("{action}", action);
  const question = mode ? REVIEW_CARD.body[mode].replace("{item}", item) : REVIEW_CARD.body.skip.replace("{item}", item);
  const options = mode ? REVIEW_OPTIONS[mode] : REVIEW_OPTIONS.skip;
  const happened = selectedOption !== null && HAPPENED_OUTCOMES.has(selectedOption);
  const noteQuestion = mode && selectedOption
    ? (REVIEW_STEP3.questions[mode] as Record<string, string>)[selectedOption] ?? REVIEW_STEP3.fallback
    : REVIEW_STEP3.fallback;

  function selectOption(option: string) {
    setSelectedOption(option);
    setStep("response");
  }

  function continueAfterResponse() {
    setStep(happened ? "whichJar" : "note");
  }

  function selectJar(kind: JarKind | "forgotten") {
    if (kind === "forgotten") {
      setSelectedJar(null);
      setNoteLead(REVIEW_ASK_JAR.forgottenResponse);
      setStep("note");
      return;
    }
    setSelectedJar(kind);
    setStep("confirmDebit");
  }

  function confirmDebit() {
    if (!selectedJar || currentRecord.amount === undefined) return;
    setNoteLead(REVIEW_CONFIRM_DEDUCT.done.replace("{jar}", JAR_NAMES[selectedJar]));
    setError(null);
    setStep("note");
  }

  async function finishReview(includeNote: boolean) {
    try {
      if (includeNote && note.trim()) {
        setReviewReply(null);
        setDogThinking(true);
        const reply = await requestAgent({
          task: "companion_reply",
          scene: "review_note",
          userText: note.trim(),
          context: {
            item,
            action,
            outcome: selectedOption ?? "",
          },
        }, 2500);
        setDogThinking(false);
        const text = reply.ok && reply.payload && typeof reply.payload === "object" && "result" in reply.payload
          ? (reply.payload.result as { text?: unknown }).text
          : null;
        setReviewReply(limitReplyToTwoSentences(typeof text === "string" ? text : "嗯,我记下了。这句我留着。"));
        await new Promise((resolve) => window.setTimeout(resolve, 800));
      }
      const result = completeReview(currentState, {
        storyId: currentRecord.id,
        happened,
        ...(happened && currentRecord.amount !== undefined ? { actualAmount: currentRecord.amount } : {}),
        ...(happened && selectedJar && currentRecord.amount !== undefined ? { debitJar: selectedJar } : {}),
        ...(includeNote && note.trim() ? { feelingNote: note.trim().slice(0, 200) } : {}),
        expectedStateVersion: currentState.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setDogState("ears");
      window.setTimeout(() => setDogState(null), 1200);
      const nextCandidate = await proposePrinciple(result.state);
      if (nextCandidate.kind === "candidate") {
        commit(nextCandidate.value.state);
        setCandidate(nextCandidate.value.principle);
        setCandidateEditText(nextCandidate.value.principle.statement);
        setCandidateEvidenceOpen(false);
        setCandidateEditing(false);
        setStep("principle");
      } else {
        setPrincipleSkipped(nextCandidate.kind === "skipped");
        setStep("done");
      }
    } catch (cause) {
      if (isStateConflict(cause)) {
        const latest = loadMoneyState();
        if (latest) commit(latest);
        setError(`${ERRORS.conflict.line} ${ERRORS.conflict.sub}`);
      } else {
        setError(`${ERRORS.validation.line} ${ERRORS.validation.sub}`);
      }
    }
  }

  function resolveCandidate(decision: "like_me" | "edit" | "defer") {
    if (!candidate) return;
    if (decision === "edit" && !candidateEditing) {
      setCandidateEditing(true);
      return;
    }
    try {
      const latestState = loadMoneyState();
      if (!latestState) return;
      const result = resolvePrinciple(latestState, {
        id: candidate.id,
        decision,
        ...(decision === "edit" ? { editedText: candidateEditText } : {}),
        expectedStateVersion: latestState.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setCandidate(result.principle);
      setStep("done");
    } catch {
      setStep("done");
    }
  }

  const responseText = selectedOption ? REVIEW_RESPONSES.main[selectedOption as keyof typeof REVIEW_RESPONSES.main] : "";
  const followUpText = selectedOption && selectedOption in REVIEW_RESPONSES.followUp
    ? REVIEW_RESPONSES.followUp[selectedOption as keyof typeof REVIEW_RESPONSES.followUp]
    : null;

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="stage talk-page decision-page review-flow-page" aria-label="回看">
        <button className="simple-back decision-back" type="button" onClick={() => router.push("/")} aria-label="返回首页">返回首页</button>
        <section className="review-flow-dog" aria-label={alias}><Dog page="回看" state={dogState ?? undefined} alias={alias} message={null} /></section>
        <section className="decision-dialog review-flow-dialog" aria-live="polite">
          {step === "detail" && <div className="decision-step"><p className="decision-user-bubble">{summary}</p><p className="decision-dog-bubble">{question}</p><div className="decision-options review-options">{options.map((option) => <button key={option} className="decision-option" type="button" onClick={() => selectOption(option)}>{option}</button>)}</div></div>}
          {step === "response" && <div className="decision-step"><p className="decision-dog-bubble">{responseText}</p>{followUpText && <p className="decision-dog-bubble">{followUpText}</p>}<button className="decision-text-action" type="button" onClick={continueAfterResponse}>{REVIEW_NAV.next}<HandDrawnUnderline /></button></div>}
          {step === "whichJar" && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_ASK_JAR.question}</p><div className="decision-options review-options">{REVIEW_ASK_JAR.options.map((option) => <button key={option} className="decision-option" type="button" onClick={() => selectJar(option === "不记得了" ? "forgotten" : (Object.entries(JAR_NAMES).find(([, label]) => label === option)?.[0] as JarKind))}>{option}</button>)}</div></div>}
          {step === "confirmDebit" && selectedJar && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_CONFIRM_DEDUCT.question.replace("{jar}", JAR_NAMES[selectedJar]).replace("{amount}", price)}</p>{error && <p className="talk-status">{error}</p>}<div className="decision-options"><button className="decision-option" type="button" onClick={confirmDebit}>{REVIEW_CONFIRM_DEDUCT.confirm}</button><button className="decision-option" type="button" onClick={() => setStep("whichJar")}>{REVIEW_CONFIRM_DEDUCT.cancel}</button></div></div>}
          {step === "note" && <div className="decision-step">{noteLead && <p className="decision-dog-bubble">{noteLead}</p>}{reviewReply ? <p className="decision-dog-bubble">{reviewReply}</p> : <><p className="decision-dog-bubble">{noteQuestion}</p><input className="decision-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder={REVIEW_STEP3.placeholder} aria-label={noteQuestion} /></>}{error && <p className="talk-status">{error}</p>}{!reviewReply && <div className="decision-options"><button className="decision-option" type="button" onClick={() => finishReview(true)}>{REVIEW_STEP3.save}</button><button className="decision-option" type="button" onClick={() => finishReview(false)}>{REVIEW_STEP3.skip}</button></div>}</div>}
          {step === "principle" && candidate && <div className="decision-step principle-candidate-step"><article className="principle-card principle-candidate-card"><p>{replaceAlias(PRINCIPLE_CANDIDATE.lead, alias)}</p><strong>{candidate.statement}</strong><button className="principle-evidence-toggle" type="button" onClick={() => setCandidateEvidenceOpen((open) => !open)}>{PRINCIPLE_CANDIDATE.evidence} {candidateEvidenceOpen ? "^" : "▾"}</button>{candidateEvidenceOpen && <div className="principle-evidence-list">{candidate.evidenceIds.map((id) => { const story = currentState.stories.find((item) => item.id === id); return <p key={id}>{story ? `${story.intent}${story.outcome?.feelingNote ? ` · ${story.outcome.feelingNote}` : ""}` : id}</p>; })}</div>}</article>{candidateEditing && <input className="decision-input principle-edit-input" value={candidateEditText} onChange={(event) => setCandidateEditText(event.target.value)} aria-label={candidate.statement} />}{candidateEditing ? <div className="decision-options principle-candidate-actions"><button className="decision-option" type="button" onClick={() => resolveCandidate("edit")}>{PRINCIPLE_CANDIDATE.saveEdit}</button><button className="decision-option" type="button" onClick={() => resolveCandidate("defer")}>{PRINCIPLE_CANDIDATE.actions.defer}</button></div> : <div className="decision-options principle-candidate-actions"><button className="decision-option" type="button" onClick={() => resolveCandidate("like_me")}>{PRINCIPLE_CANDIDATE.actions.like}</button><button className="decision-option" type="button" onClick={() => resolveCandidate("edit")}>{PRINCIPLE_CANDIDATE.actions.edit}</button><button className="decision-option" type="button" onClick={() => resolveCandidate("defer")}>{PRINCIPLE_CANDIDATE.actions.defer}</button></div>}</div>}
          {step === "done" && <div className="decision-step"><p className="decision-dog-bubble">{principleSkipped ? PRINCIPLE_CANDIDATE.skipped : REVIEW_STEP4.closing}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{REVIEW_NAV.backHome}<HandDrawnUnderline /></button></div>}
        </section>
      </section>
    </main>
  );
}
