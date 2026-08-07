"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDecisionStory } from "@/server/domain/story";
import { loadMoneyState, useMoneyState } from "@/lib/state/money-store";
import { ERRORS, DAILY_NOTE, NOTE_MODEL_REPLY, SAFETY } from "@/mock/剧本";
import { requestAgent, type AgentIssue } from "@/lib/agent/client";
import { setDogThinking } from "@/lib/state/dog-state";
import { Dog } from "./Dog";
import { HandDrawnUnderline } from "./HandDrawnUnderline";
import { LoadingState } from "./LoadingState";

type NoteCategory = keyof typeof DAILY_NOTE.responses;
type NoteStep = "story" | "listen" | "model" | "choices" | "done" | "safety-offtopic" | "safety-stopped";

const MODEL_TIMEOUT_MS = 2500;
const MODEL_TO_CHOICES_MS = 800;

function isStateConflict(cause: unknown): boolean {
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "state_conflict");
}

function firstTwoSentences(text: string): string {
  const parts = text.match(/[^。！？!?]*[。！？!?]?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.slice(0, 2).join("") || NOTE_MODEL_REPLY.fallback;
}

function classifyStory(text: string): NoteCategory {
  if (/奖金|红包|收到|退了|多出来|意外/.test(text)) return "income";
  if (/后悔|花完/.test(text)) return "regret";
  if (/犹豫|纠结|不安|没决定/.test(text)) return "hesitation";
  if (/不确定|不知道|怎么用|放哪/.test(text)) return "uncertain";
  return "unclear";
}

function safetyKind(payload: unknown): "crisis" | "debt" | "invest" | "offTopic" | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const result = root.result && typeof root.result === "object" ? root.result as Record<string, unknown> : null;
  const flags = Array.isArray(root.safetyFlags) ? root.safetyFlags : result && Array.isArray(result.safetyFlags) ? result.safetyFlags : [];
  const flag = flags.find((item): item is string => typeof item === "string");
  if (flag === "crisis" || flag === "debt" || flag === "invest" || flag === "offTopic") return flag;
  return null;
}

export function MoneyNoteFlow({ initialStory = "" }: { initialStory?: string }) {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const alias = state?.profile.displayName?.trim() || "慢慢";
  const [step, setStep] = useState<NoteStep>("story");
  const [storyInput, setStoryInput] = useState(initialStory);
  const [story, setStory] = useState("");
  const [category, setCategory] = useState<NoteCategory>("unclear");
  const [modelReply, setModelReply] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [issue, setIssue] = useState<AgentIssue | null>(null);
  const [safety, setSafety] = useState<"crisis" | "debt" | "invest" | "offTopic" | null>(null);
  const [offTopicResponse, setOffTopicResponse] = useState<string | null>(null);
  const [savedCopy, setSavedCopy] = useState<string>(DAILY_NOTE.received);
  const [transitionIndex, setTransitionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef(0);
  const reminderShown = useRef(false);
  const [timeReminderVisible, setTimeReminderVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!reminderShown.current) {
        reminderShown.current = true;
        setTimeReminderVisible(true);
      }
    }, 2 * 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => () => setDogThinking(false), []);

  function submitStory() {
    const next = storyInput.trim();
    if (!next) return;
    setStory(next);
    setCategory(classifyStory(next));
    const random = new Uint32Array(1);
    globalThis.crypto.getRandomValues(random);
    setTransitionIndex(random[0] % DAILY_NOTE.transitions.length);
    setSafety(null);
    setStep("listen");
  }

  function readModelReply(payload: unknown): string {
    if (!payload || typeof payload !== "object") return NOTE_MODEL_REPLY.fallback;
    const root = payload as Record<string, unknown>;
    const result = root.result && typeof root.result === "object" ? root.result as Record<string, unknown> : null;
    return typeof result?.text === "string" ? firstTwoSentences(result.text) : NOTE_MODEL_REPLY.fallback;
  }

  async function requestModelReply() {
    if (modelLoading) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setModelLoading(true);
    setIssue(null);
    setModelReply(null);
    setStep("model");
    setDogThinking(true);
    const result = await requestAgent({ task: "companion_reply", scene: "note", userText: story }, MODEL_TIMEOUT_MS);
    if (requestId.current !== currentRequest) return;
    let nextSafety: ReturnType<typeof safetyKind> = null;
    if (result.ok) {
      nextSafety = safetyKind(result.payload);
      setSafety(nextSafety);
      if (nextSafety === "crisis") {
        setStory("");
        setStoryInput("");
        setDogThinking(false);
        setModelLoading(false);
        return;
      }
      setModelReply(readModelReply(result.payload));
    } else {
      setIssue(result.issue);
      setModelReply(NOTE_MODEL_REPLY.fallback);
    }
    setDogThinking(false);
    setModelLoading(false);
    if (nextSafety === "offTopic") setStep("safety-offtopic");
    else window.setTimeout(() => { if (requestId.current === currentRequest) setStep("choices"); }, MODEL_TO_CHOICES_MS);
  }

  function chooseOffTopic(choice: "yes" | "no") {
    setSafety(null);
    setOffTopicResponse(choice === "yes" ? SAFETY.offTopic.yesResponse : SAFETY.offTopic.noResponse);
    setStep(choice === "yes" ? "choices" : "safety-stopped");
  }

  function remember() {
    if (!state || submitting) return;
    setSubmitting(true);
    try {
      const result = createDecisionStory(state, {
        intent: story.slice(0, 120),
        action: "note_only",
        emotionSummary: category,
        expectedStateVersion: state.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setSavedCopy(DAILY_NOTE.remembered);
      setStep("done");
    } catch (cause) {
      if (isStateConflict(cause)) {
        const latest = loadMoneyState();
        if (latest) commit(latest);
        setIssue(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    if (step === "story") return router.push("/");
    if (step === "listen") return setStep("story");
    if (step === "model") return setStep("listen");
    if (step === "choices") return setStep("listen");
    if (step === "safety-offtopic" || step === "safety-stopped") return setStep("listen");
    router.push("/");
  }

  if (!ready) return <LoadingState />;
  if (safety === "crisis") {
    return <main className="stage-shell flow-layout-shell safety-exit-shell"><section className="stage talk-page safety-exit-page" aria-label="安全退出"><section className="safety-exit-dog" aria-label={alias}><Dog page="对话" state="idle" alias={alias} message={null} /></section><section className="safety-exit-copy" aria-live="assertive"><p>{SAFETY.crisis.line}</p><p>{SAFETY.crisis.body}</p><p>{SAFETY.crisis.closing}</p></section><div className="safety-exit-actions"><button type="button" onClick={() => { setSafety(null); setStep("story"); }}>{SAFETY.crisis.ack}</button><button type="button" onClick={() => router.push("/")}>{SAFETY.crisis.home}</button></div></section></main>;
  }

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="stage talk-page decision-page money-note-page" aria-label={DAILY_NOTE.entry}>
        <button className="simple-back decision-back" type="button" onClick={back} aria-label="返回上一步">返回上一步</button>
        <section className="dog-layer" aria-label={alias}><Dog page="对话" alias={alias} message={null} talkMode /></section>
        {timeReminderVisible && <aside className="time-reminder" aria-live="polite"><p>{SAFETY.timeReminder.line}</p><p>{SAFETY.timeReminder.body}</p><div><button type="button" onClick={() => setTimeReminderVisible(false)}>{SAFETY.timeReminder.ack}</button><button type="button" onClick={() => setTimeReminderVisible(false)}>{SAFETY.timeReminder.continue}</button></div></aside>}
        <section className="decision-dialog" aria-live="polite">
          {step === "story" && <div className="decision-step"><p className="decision-dog-bubble">{DAILY_NOTE.intro}</p><input autoFocus className="decision-input" value={storyInput} onChange={(event) => setStoryInput(event.target.value)} placeholder={DAILY_NOTE.placeholder} aria-label={DAILY_NOTE.placeholder} /><p className="talk-status">{DAILY_NOTE.hint.replace("{alias}", alias)}</p><button className="decision-text-action" type="button" onClick={submitStory}>{DAILY_NOTE.submit}<HandDrawnUnderline /></button></div>}
          {step === "listen" && <div className="decision-step"><p className="decision-user-bubble">{story}</p><p className="decision-dog-bubble">{DAILY_NOTE.responses[category].replace("{alias}", alias)}</p><p className="decision-dog-bubble">{DAILY_NOTE.transitions[transitionIndex]}</p><button className="decision-option" type="button" onClick={requestModelReply}>{DAILY_NOTE.done}</button></div>}
          {step === "model" && <div className="decision-step"><p className="decision-user-bubble">{story}</p>{modelLoading ? <p className="decision-dog-bubble money-note-thinking-bubble" aria-hidden="true">{NOTE_MODEL_REPLY.thinkingHint}</p> : issue ? <><p className="decision-dog-bubble">{issue === "offline" ? ERRORS.offline.line : ERRORS.timeout.line}</p><p className="decision-dog-bubble">{issue === "offline" ? ERRORS.offline.sub : ERRORS.timeout.sub}</p><p className="decision-dog-bubble money-note-model-bubble">{modelReply}</p></> : <p className="decision-dog-bubble money-note-model-bubble">{modelReply}</p>}</div>}
          {step === "safety-offtopic" && <div className="decision-step"><p className="decision-dog-bubble">{SAFETY.offTopic.line}</p><p className="decision-dog-bubble">{SAFETY.offTopic.body}</p><div className="decision-options"><button className="decision-option" type="button" onClick={() => chooseOffTopic("yes")}>{SAFETY.offTopic.options.yes}</button><button className="decision-option" type="button" onClick={() => chooseOffTopic("no")}>{SAFETY.offTopic.options.no}</button></div></div>}
          {step === "safety-stopped" && <div className="decision-step"><p className="decision-dog-bubble">{offTopicResponse ?? SAFETY.offTopic.noResponse}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>返回首页<HandDrawnUnderline /></button></div>}
          {step === "choices" && <div className="decision-step">{offTopicResponse && <p className="decision-dog-bubble">{offTopicResponse}</p>}<p className="decision-dog-bubble">{DAILY_NOTE.choicesPrompt}</p><div className="decision-options decision-source-options"><button className="decision-option" type="button" disabled={submitting} onClick={remember}>{DAILY_NOTE.remember}</button><button className="decision-option" type="button" onClick={() => { setSavedCopy(DAILY_NOTE.received); setStep("done"); }}>{DAILY_NOTE.talkOnly}</button></div></div>}
          {step === "done" && <div className="decision-step"><p className="decision-dog-bubble">{savedCopy}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>返回首页<HandDrawnUnderline /></button></div>}
        </section>
      </section>
    </main>
  );
}
