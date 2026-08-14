"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryAction } from "@/contracts";
import { createDecisionStory } from "@/server/domain/story";
import { confirmedPrinciples } from "@/server/domain/principle";
import { loadMoneyState, useMoneyState } from "@/lib/state/money-store";
import { MONEY_INPUT_COPY } from "@/lib/money/amount-text";
import { requestAgent } from "@/lib/agent/client";
import { previewDecision, type DecisionSource } from "@/lib/plan/preview-decision";
import { formatYuan, parseAmountCents } from "@/mock/decision";
import { DAILY_DECISION, DECISION_BALANCE, DECISION_REFERENCE, ERRORS, NOTE_MODEL_REPLY } from "@/mock/剧本";
import { setDogThinking } from "@/lib/state/dog-state";
import { Dog } from "./Dog";
import { HandDrawnUnderline } from "./HandDrawnUnderline";
import { LoadingState } from "./LoadingState";

type BuyStep = "item" | "price" | "checking" | "arrange" | "pending-confirm" | "confirm" | "done";
type DecisionConversationTurn = { role: "user" | "assistant"; text: string };

const ACTIONS: Array<{ key: StoryAction; label: string }> = [
  { key: "buy_now", label: DAILY_DECISION.actions.buy },
  { key: "defer", label: DAILY_DECISION.actions.defer },
  { key: "skip_this_time", label: DAILY_DECISION.actions.skip },
];

function isStateConflict(cause: unknown): boolean {
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "state_conflict");
}

function replaceAlias(text: string, alias: string, user = "你"): string {
  return text.replaceAll("{alias}", alias).replaceAll("{user}", user);
}

function sourceButtonText(source: DecisionSource, shortfall: number): string {
  if (source.jarKind === "dream") return `从「${source.label}」出`;
  if (source.jarKind === "living" && source.amount < shortfall) {
    return `从生活罐出（最多 ${formatYuan(source.amount)} 元）`;
  }
  return "从生活罐出";
}

function readDecisionReply(payload: unknown): string {
  if (!payload || typeof payload !== "object") return NOTE_MODEL_REPLY.fallback;
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return NOTE_MODEL_REPLY.fallback;
  const text = (result as Record<string, unknown>).text;
  return typeof text === "string" && text.trim() ? text.trim() : NOTE_MODEL_REPLY.fallback;
}

export function BuyDecisionFlow({ initialItem = "" }: { initialItem?: string }) {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const alias = state?.profile.dogName?.trim() || "慢慢";
  const [step, setStep] = useState<BuyStep>("item");
  const [itemInput, setItemInput] = useState(initialItem);
  const [item, setItem] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof previewDecision> | null>(null);
  const [selectedSource, setSelectedSource] = useState<DecisionSource["jarKind"] | null>(null);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [previewIssue, setPreviewIssue] = useState(false);
  const [proposedAction, setProposedAction] = useState<StoryAction | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dogState, setDogState] = useState<"ears" | null>(null);
  const [pendingSaved, setPendingSaved] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [principleReferenceOpen, setPrincipleReferenceOpen] = useState(false);
  const [conversation, setConversation] = useState<DecisionConversationTurn[]>([]);
  const [followUpInput, setFollowUpInput] = useState("");
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const chatRequestId = useRef(0);

  useEffect(() => () => {
    chatRequestId.current += 1;
    setDogThinking(false);
  }, []);
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const timer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, []);

  const displayPrice = amount === null ? "" : formatYuan(amount);
  const parsedPriceInput = priceInput.trim() ? parseAmountCents(priceInput) : null;
  const comfortJar = state?.jars.find((jar) => jar.kind === "comfort") ?? null;
  const staleBalance = now !== null && comfortJar !== null
    && now - Date.parse(comfortJar.updatedAt) > 7 * 24 * 60 * 60 * 1000;
  const comfortText = useMemo(() => {
    if (!preview || amount === null) return null;
    if (preview.shortfall > 0) {
      return DAILY_DECISION.comfortShortfall.replace("{balance}", formatYuan(preview.comfortAvailable));
    }
    if (staleBalance) {
      return DECISION_BALANCE.stale.line.replace("{balance}", formatYuan(preview.comfortAvailable));
    }
    return DECISION_BALANCE.fresh
      .replace("{balance}", formatYuan(preview.comfortAvailable))
      .replace("{remain}", formatYuan(preview.remaining));
  }, [amount, preview, staleBalance]);
  const referencedPrinciples = state ? confirmedPrinciples(state) : [];

  function submitItem() {
    const next = itemInput.trim();
    if (!next) return;
    setItem(next);
    setStep("price");
  }

  function submitPrice() {
    const parsed = parseAmountCents(priceInput);
    if (parsed === null || parsed <= 0) {
      setError(null);
      return;
    }
    setAmount(parsed);
    setSelectedSource(null);
    setSourceConfirmed(false);
    setConversation([]);
    setFollowUpInput("");
    setPendingUserText(null);
    setError(null);
    if (!state) return;
    setStep("checking");
    setPreviewIssue(false);
    setDogThinking(true);
    window.setTimeout(() => {
      try {
        setPreview(previewDecision(state, { amount: parsed }));
      } catch {
        setPreviewIssue(true);
      } finally {
        setDogThinking(false);
        setStep("arrange");
      }
    }, 0);
  }

  function chooseAction(action: StoryAction) {
    if (preview?.shortfall && !sourceConfirmed) return;
    chatRequestId.current += 1;
    setChatLoading(false);
    setPendingUserText(null);
    setDogThinking(false);
    setProposedAction(action);
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setError(null);
    setStep("confirm");
  }

  function chooseSource(source: DecisionSource["jarKind"]) {
    setSelectedSource(source);
    setSourceConfirmed(false);
    setError(null);
  }

  function startPendingConfirmation() {
    chatRequestId.current += 1;
    setChatLoading(false);
    setPendingUserText(null);
    setDogThinking(false);
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setError(null);
    setStep("pending-confirm");
  }

  async function submitDecisionFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = followUpInput.trim();
    if (!text || chatLoading || !preview) return;
    const requestId = chatRequestId.current + 1;
    chatRequestId.current = requestId;
    const contextConversation = [...conversation, { role: "user" as const, text }];
    setFollowUpInput("");
    setPendingUserText(text);
    setChatLoading(true);
    setDogThinking(true);
    const result = await requestAgent({
      task: "companion_reply",
      scene: "decision",
      userText: text,
      stateSummary: {
        comfortAvailable: preview.comfortAvailable,
        shortfall: preview.shortfall,
        ...(state ? { jars: state.jars.slice(0, 4).map((jar) => ({
          kind: jar.kind,
          label: jar.label,
          planned: jar.planned,
          actual: jar.actual,
        })) } : {}),
        hasCycle: Boolean(state?.cycle),
        ...(state?.cycle?.updatedAt ? { updatedAt: state.cycle.updatedAt } : {}),
      },
      principles: referencedPrinciples.slice(-5).map((principle) => principle.statement),
      concerns: state?.profile.expressionPrefs?.slice(0, 6) ?? [],
      recentStories: (state?.stories ?? []).slice(-3).map((story) => ({
        intent: story.intent,
        action: story.action,
        ...(story.amount !== undefined ? { amount: story.amount } : {}),
        ...(story.outcome ? { happened: story.outcome.happened } : {}),
        ...(story.outcome?.feelingNote ? { feelingNote: story.outcome.feelingNote } : {}),
      })),
      item: {
        name: item,
        ...(amount !== null ? { amount } : {}),
      },
      noteContext: {
        jars: [],
        principles: [],
        concerns: [],
        stories: [],
        conversation: contextConversation.slice(-8),
      },
    });
    if (chatRequestId.current !== requestId) return;
    setConversation([...contextConversation, {
      role: "assistant",
      text: result.ok ? readDecisionReply(result.payload) : NOTE_MODEL_REPLY.fallback,
    }]);
    setPendingUserText(null);
    setChatLoading(false);
    setDogThinking(false);
  }

  function renderDecisionConversation() {
    return <section className="buy-decision-chat" aria-label="继续聊聊"><div className="buy-decision-conversation">{conversation.map((turn, index) => turn.role === "user" ? <p className="decision-user-bubble" key={`${turn.role}-${index}`}>{turn.text}</p> : <p className="decision-dog-bubble" key={`${turn.role}-${index}`}>{turn.text}</p>)}{pendingUserText && <p className="decision-user-bubble">{pendingUserText}</p>}{chatLoading && <p className="decision-dog-bubble money-note-thinking-bubble" aria-hidden="true"> </p>}</div><form className="buy-decision-follow-up" onSubmit={submitDecisionFollowUp}><input className="decision-input" value={followUpInput} onChange={(event) => setFollowUpInput(event.target.value)} placeholder={NOTE_MODEL_REPLY.followUpPlaceholder} aria-label={NOTE_MODEL_REPLY.followUpPlaceholder} /><button className="decision-option" type="submit" disabled={chatLoading || !followUpInput.trim()}>{replaceAlias(NOTE_MODEL_REPLY.followUpSubmit, alias)}</button></form></section>;
  }

  function confirmPendingDecision() {
    if (!state || amount === null || !idempotencyKey || submitting) return;
    setSubmitting(true);
    try {
      const result = createDecisionStory(state, {
        intent: item,
        action: "pending_confirmation",
        amount,
        expectedStateVersion: state.stateVersion,
        idempotencyKey,
      });
      commit(result.state);
      setPendingSaved(true);
      setError(null);
      setStep("done");
    } catch (cause) {
      if (isStateConflict(cause)) {
        const latest = loadMoneyState();
        if (latest) commit(latest);
        setError(`${ERRORS.conflict.line} ${ERRORS.conflict.sub}`);
      } else {
        setError(`${ERRORS.validation.line} ${ERRORS.validation.sub}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function confirmAction() {
    if (!state || amount === null || !proposedAction || !idempotencyKey || submitting) return;
    setSubmitting(true);
    try {
      const result = createDecisionStory(state, {
        intent: item,
        action: proposedAction,
        amount,
        ...(selectedSource ? { candidateJar: selectedSource } : {}),
        reviewInDays: proposedAction === "defer" ? 1 : 3,
        expectedStateVersion: state.stateVersion,
        idempotencyKey,
      });
      commit(result.state);
      setError(null);
      setDogThinking(false);
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
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setError(null);
    if (step === "item") return router.push("/");
    if (step === "price") return setStep("item");
    if (step === "arrange") {
      chatRequestId.current += 1;
      setChatLoading(false);
      setPendingUserText(null);
      setDogThinking(false);
      return setStep("price");
    }
    if (step === "pending-confirm") { setIdempotencyKey(null); return setStep("arrange"); }
    if (step === "confirm") { setIdempotencyKey(null); return setStep("arrange"); }
    router.push("/");
  }

  if (!ready) return <LoadingState />;
  if (!state) {
    return <main className="stage-shell flow-layout-shell buy-decision-shell"><section className="stage talk-page decision-page"><button className="simple-back decision-back" type="button" onClick={() => router.push("/")} aria-label="首页">首页</button><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.noState, alias)}</p><div className="decision-options"><button className="decision-text-action" type="button" onClick={() => router.push("/start")}>{DAILY_DECISION.start}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{DAILY_DECISION.browse}<HandDrawnUnderline /></button></div></section></main>;
  }

  const actionLabel = ACTIONS.find((entry) => entry.key === proposedAction)?.label ?? "";
  const selectedSourceDetail = preview?.sources.find((source) => source.jarKind === selectedSource) ?? null;
  return (
    <main className="stage-shell flow-layout-shell buy-decision-shell">
      <section className="stage talk-page decision-page buy-decision-page" aria-label={DAILY_DECISION.entry}>
        <button className="simple-back decision-back" type="button" onClick={back} aria-label="上一步">上一步</button>
        <section className="dog-layer" aria-label={alias}><Dog page="对话" state={dogState ?? undefined} alias={alias} message={null} talkMode /></section>
        {step === "arrange" && preview && amount !== null && <p className="decision-dog-bubble buy-balance-bubble" aria-live="polite">{comfortText}</p>}
        <section className="decision-dialog" aria-live="polite">
          {step === "item" && <div className="decision-step buy-item-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.intro, alias)}</p><input autoFocus className="decision-input" value={itemInput} onChange={(event) => setItemInput(event.target.value)} placeholder={DAILY_DECISION.itemPlaceholder} aria-label={DAILY_DECISION.itemPlaceholder} /><p className="talk-status">{DAILY_DECISION.itemHint}</p><button className="decision-text-action" type="button" onClick={submitItem}>{DAILY_DECISION.itemNext}<HandDrawnUnderline /></button></div>}
          {step === "price" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.priceQuestion, alias)}</p><input autoFocus className="decision-input" type="text" value={priceInput} onChange={(event) => { setPriceInput(event.target.value); setError(null); }} placeholder={DAILY_DECISION.pricePlaceholder} aria-label={DAILY_DECISION.pricePlaceholder} inputMode="decimal" />{priceInput.trim() && parsedPriceInput === null && <small className="amount-input-feedback">{MONEY_INPUT_COPY.unreadable}</small>}{priceInput.trim() && parsedPriceInput !== null && <small className="amount-input-feedback">{MONEY_INPUT_COPY.understood(formatYuan(parsedPriceInput))}</small>}{error && <p className="talk-status">{error}</p>}<button className="decision-text-action" type="button" onClick={submitPrice}>{DAILY_DECISION.itemNext}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" onClick={() => setPriceInput("")}>{DAILY_DECISION.unsure}<HandDrawnUnderline /></button></div>}
          {step === "checking" && <div className="decision-step"><p className="decision-dog-bubble money-note-thinking-bubble" aria-hidden="true"> </p></div>}
          {step === "arrange" && previewIssue && <div className="decision-step"><p className="decision-dog-bubble">{ERRORS.timeout.line}</p><p className="decision-dog-bubble">{ERRORS.timeout.sub}</p><button className="decision-text-action" type="button" onClick={() => setStep("price")}>{ERRORS.timeout.retry}<HandDrawnUnderline /></button></div>}
          {step === "arrange" && preview && amount !== null && <div className={`decision-step buy-arrange-step${preview.shortfall > 0 ? " buy-shortfall-step" : ""}`}>{referencedPrinciples.length > 0 && <div className="principle-fold"><button type="button" onClick={() => setPrincipleReferenceOpen((open) => !open)}>{DECISION_REFERENCE.label.replace("{count}", String(referencedPrinciples.length))} {principleReferenceOpen ? "^" : "▾"}</button>{principleReferenceOpen && referencedPrinciples.map((principle) => <p key={principle.id}>{principle.statement}</p>)}</div>}<p className="decision-dog-bubble">{DAILY_DECISION.arrange}</p><div className="decision-plain-summary"><p>{DAILY_DECISION.summaryItem.replace("{item}", item).replace("{price}", displayPrice)}</p></div>{preview.shortfall > 0 && <><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.shortfall, alias).replace("{shortfall}", formatYuan(preview.shortfall))}</p><div className="decision-options decision-source-options">{preview.sources.map((source) => <div className="decision-source-choice" key={source.jarKind}><button className={`decision-option${selectedSource === source.jarKind ? " is-selected" : ""}`} type="button" disabled={source.amount === 0} onClick={() => chooseSource(source.jarKind)}>{sourceButtonText(source, preview.shortfall)}</button></div>)}{!preview.canCoverWithCurrentJars && <button className="decision-option" type="button" onClick={startPendingConfirmation}>{DAILY_DECISION.pendingAction}</button>}</div>{selectedSource === "dream" && preview.goalImpact && <p className="talk-status">{preview.goalImpact}</p>}{selectedSourceDetail && !sourceConfirmed && <div className="decision-source-confirm"><p className="decision-dog-bubble">{DAILY_DECISION.sourceConfirmQuestion.replace("{source}", selectedSourceDetail.label).replace("{shortfall}", formatYuan(preview.shortfall))}</p><div className="decision-options"><button className="decision-option" type="button" onClick={() => setSourceConfirmed(true)}>{DAILY_DECISION.confirm}</button><button className="decision-option" type="button" onClick={() => { setSelectedSource(null); setSourceConfirmed(false); }}>{DAILY_DECISION.modify}</button></div></div>}</>}{!staleBalance && (preview.shortfall === 0 || sourceConfirmed) && <><p className="decision-dog-bubble">{DAILY_DECISION.arrangeQuestion}</p><div className="decision-options decision-buy-actions">{ACTIONS.map((action) => <button key={action.key} className="decision-buy-action" type="button" onClick={() => chooseAction(action.key)}>{action.label}<HandDrawnUnderline /></button>)}</div></>}{renderDecisionConversation()}</div>}
          {step === "pending-confirm" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.pendingReply, alias)}</p>{error && <p className="talk-status">{error}</p>}<div className="decision-options"><button className="decision-option" type="button" disabled={submitting} onClick={confirmPendingDecision}>{DAILY_DECISION.pendingConfirm}</button><button className="decision-option" type="button" disabled={submitting} onClick={() => { setIdempotencyKey(null); setStep("arrange"); }}>{DAILY_DECISION.modify}</button></div></div>}
          {step === "confirm" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.confirmQuestion, alias)}</p><p className="decision-plain-summary">{item} {displayPrice}元 · {actionLabel}</p>{error && <p className="talk-status">{error}</p>}<div className="decision-options"><button className="decision-text-action" type="button" disabled={submitting} onClick={confirmAction}>{DAILY_DECISION.confirm}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" disabled={submitting} onClick={() => { setIdempotencyKey(null); setStep("arrange"); }}>{DAILY_DECISION.modify}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" disabled={submitting} onClick={() => { setIdempotencyKey(null); setStep("arrange"); }}>{DAILY_DECISION.cancel}<HandDrawnUnderline /></button></div></div>}
          {step === "done" && <div className="decision-step"><p className="decision-dog-bubble">{pendingSaved ? replaceAlias(DAILY_DECISION.pendingReply, alias) : replaceAlias(DAILY_DECISION.closing, alias)}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>首页<HandDrawnUnderline /></button></div>}
        </section>
      </section>
    </main>
  );
}
