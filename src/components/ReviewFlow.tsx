"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { JarKind, MoneyState, StoryAction } from "@/contracts";
import { MoneyState as MoneyStateSchema } from "@/contracts";
import { completeReview } from "@/server/domain/story";
import { commitJarDebit, undoJarDebit } from "@/server/domain/debit";
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
  REVIEW_ASK_MONEY,
  REVIEW_STEP1,
  REVIEW_STEP3,
  REVIEW_STEP4,
  ERRORS,
} from "@/mock/剧本";
import { Dog } from "./Dog";
import { HandDrawnUnderline } from "./HandDrawnUnderline";
import { LoadingState } from "./LoadingState";

type ReviewMode = "now" | "tomorrow" | "skip";
type ReviewStep = "detail" | "response" | "money" | "whichJar" | "confirmDebit" | "note" | "done" | "deferred";
type UndoToken = ReturnType<typeof commitJarDebit>["undoToken"];

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

function postponeReview(state: MoneyState, storyId: string): MoneyState {
  const story = state.stories.find((item) => item.id === storyId);
  if (!story) return state;
  const base = story.reviewAt ? Date.parse(story.reviewAt) : new Date().getTime();
  const reviewAt = new Date(base + 3 * 86400000).toISOString();
  return MoneyStateSchema.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    stories: state.stories.map((item) => item.id === storyId ? { ...item, reviewAt } : item),
  });
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
  const [spent, setSpent] = useState<"spent" | "notBought" | "notYet" | null>(null);
  const [selectedJar, setSelectedJar] = useState<JarKind | null>(null);
  const [undoToken, setUndoToken] = useState<UndoToken | null>(null);
  const [noteLead, setNoteLead] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dogState, setDogState] = useState<"ears" | null>(null);

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
  const summary = REVIEW_STEP1.summary.replace("{item}", item).replace("{price}", price).replace("{action}", action);
  const question = mode ? REVIEW_CARD.body[mode].replace("{item}", item) : REVIEW_CARD.body.skip.replace("{item}", item);
  const options = mode ? REVIEW_OPTIONS[mode] : REVIEW_OPTIONS.skip;

  function selectOption(option: string) {
    setSelectedOption(option);
    setStep("response");
  }

  function continueAfterResponse() {
    if (currentRecord.action === "buy_now") setStep("money");
    else setStep("note");
  }

  function selectMoneyChoice(choice: "spent" | "notBought" | "notYet") {
    setSpent(choice);
    if (choice === "spent") setStep("whichJar");
    else if (choice === "notYet") {
      try {
        const nextState = postponeReview(currentState, currentRecord.id);
        commit(nextState);
        setStep("deferred");
      } catch (cause) {
        if (isStateConflict(cause)) {
          const latest = loadMoneyState();
          if (latest) commit(latest);
          setError(`${ERRORS.conflict.line} ${ERRORS.conflict.sub}`);
        } else {
          setError(`${ERRORS.validation.line} ${ERRORS.validation.sub}`);
        }
      }
    } else {
      setNoteLead(REVIEW_ASK_MONEY.notBoughtResponse);
      setStep("note");
    }
  }

  function selectJar(kind: JarKind | "forgotten") {
    if (kind === "forgotten") {
      setSelectedJar(null);
      setNoteLead(REVIEW_ASK_MONEY.whichJar.forgottenResponse);
      setStep("note");
      return;
    }
    setSelectedJar(kind);
    setStep("confirmDebit");
  }

  function confirmDebit() {
    if (!selectedJar || currentRecord.amount === undefined) return;
    try {
      const result = commitJarDebit(currentState, {
        jarKind: selectedJar,
        amount: currentRecord.amount,
        storyId: currentRecord.id,
        expectedStateVersion: currentState.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setUndoToken(result.undoToken);
      setNoteLead(REVIEW_CONFIRM_DEDUCT.done.replace("{jar}", JAR_NAMES[selectedJar]));
      setError(null);
      setStep("note");
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

  function undoDebit() {
    if (!undoToken) return;
    try {
      const result = undoJarDebit(currentState, undoToken, {
        expectedStateVersion: currentState.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setUndoToken(null);
      setSelectedJar(null);
      setStep("whichJar");
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

  function finishReview(includeNote: boolean) {
    try {
      const result = completeReview(currentState, {
        storyId: currentRecord.id,
        happened: spent === "spent" || (currentRecord.action === "buy_now" && spent === null),
        ...(spent === "spent" && currentRecord.amount !== undefined ? { actualAmount: currentRecord.amount } : {}),
        ...(includeNote && note.trim() ? { feelingNote: note.trim().slice(0, 200) } : {}),
        expectedStateVersion: currentState.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setDogState("ears");
      window.setTimeout(() => setDogState(null), 1200);
      setStep("done");
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
          {step === "money" && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_ASK_MONEY.question}</p><div className="decision-options review-options"><button className="decision-option" type="button" onClick={() => selectMoneyChoice("spent")}>{REVIEW_ASK_MONEY.options.spent}</button><button className="decision-option" type="button" onClick={() => selectMoneyChoice("notBought")}>{REVIEW_ASK_MONEY.options.notBought}</button><button className="decision-option" type="button" onClick={() => selectMoneyChoice("notYet")}>{REVIEW_ASK_MONEY.options.notYet}</button></div></div>}
          {step === "whichJar" && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_ASK_MONEY.whichJar.question}</p><div className="decision-options review-options">{REVIEW_ASK_MONEY.whichJar.options.map((option) => <button key={option} className="decision-option" type="button" onClick={() => selectJar(option === "不记得了" ? "forgotten" : (Object.entries(JAR_NAMES).find(([, label]) => label === option)?.[0] as JarKind))}>{option}</button>)}</div></div>}
          {step === "confirmDebit" && selectedJar && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_CONFIRM_DEDUCT.question.replace("{jar}", JAR_NAMES[selectedJar]).replace("{amount}", price)}</p>{error && <p className="talk-status">{error}</p>}<div className="decision-options"><button className="decision-option" type="button" onClick={confirmDebit}>{REVIEW_CONFIRM_DEDUCT.confirm}</button><button className="decision-option" type="button" onClick={() => setStep("whichJar")}>{REVIEW_CONFIRM_DEDUCT.cancel}</button></div></div>}
          {step === "note" && <div className="decision-step">{noteLead && <p className="decision-dog-bubble">{noteLead}</p>}<p className="decision-dog-bubble">{REVIEW_STEP3.placeholder}</p><input className="decision-input" value={note} onChange={(event) => setNote(event.target.value)} aria-label={REVIEW_STEP3.placeholder} />{undoToken && <button className="decision-text-action" type="button" onClick={undoDebit}>{REVIEW_CONFIRM_DEDUCT.undo}<HandDrawnUnderline /></button>}{error && <p className="talk-status">{error}</p>}<div className="decision-options"><button className="decision-option" type="button" onClick={() => finishReview(true)}>{REVIEW_STEP3.save}</button><button className="decision-option" type="button" onClick={() => finishReview(false)}>{REVIEW_STEP3.skip}</button></div></div>}
          {step === "deferred" && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_ASK_MONEY.notYetResponse}</p><p className="decision-dog-bubble">{REVIEW_ASK_MONEY.notYetFollowUp}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{REVIEW_NAV.backHome}<HandDrawnUnderline /></button></div>}
          {step === "done" && <div className="decision-step"><p className="decision-dog-bubble">{REVIEW_STEP4.closing}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{REVIEW_NAV.backHome}<HandDrawnUnderline /></button></div>}
        </section>
      </section>
    </main>
  );
}
