"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dog } from "@/components/Dog";
import { TextEntry } from "@/components/TextEntry";
import { MoneyNoteFlow } from "@/components/MoneyNoteFlow";
import { BuyDecisionFlow } from "@/components/BuyDecisionFlow";
import { LoadingState } from "@/components/LoadingState";
import { useMoneyState } from "@/lib/state/money-store";
import { requestAgent } from "@/lib/agent/client";
import { setDogThinking } from "@/lib/state/dog-state";
import { script } from "@/mock/script";
import { DAILY_TALK, NOTE_MODEL_REPLY } from "@/mock/剧本";

const TALK_DRAFT_KEY = "bondpup.unfinishedTalk";
type TalkTurn = { role: "user" | "assistant"; text: string };

function replaceNames(text: string, alias: string, user: string): string {
  return text.replaceAll("{alias}", alias).replaceAll("{user}", user);
}

function firstThreeSentences(text: string): string {
  const parts = text.match(/[^。！？!?]*[。！？!?]?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.slice(0, 3).join("") || NOTE_MODEL_REPLY.fallback;
}

function readReply(payload: unknown): { text: string; crisis: boolean } {
  if (!payload || typeof payload !== "object") return { text: NOTE_MODEL_REPLY.fallback, crisis: false };
  const root = payload as Record<string, unknown>;
  const result = root.result && typeof root.result === "object" ? root.result as Record<string, unknown> : null;
  const rawText = typeof result?.text === "string" ? result.text : NOTE_MODEL_REPLY.fallback;
  const flags = Array.isArray(root.safetyFlags) ? root.safetyFlags : [];
  const crisis = flags.includes("crisis");
  return { text: flags.length > 0 ? rawText : firstThreeSentences(rawText), crisis };
}

function TalkLanding() {
  const router = useRouter();
  const { state } = useMoneyState();
  const alias = state?.profile.dogName?.trim() || "慢慢";
  const user = state?.profile.displayName?.trim() || "你";
  const [input, setInput] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const [message, setMessage] = useState(replaceNames(DAILY_TALK.prompt, alias, user));
  const [conversation, setConversation] = useState<TalkTurn[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStopped, setChatStopped] = useState(false);
  const silenceShown = useRef(false);

  useEffect(() => () => setDogThinking(false), []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TALK_DRAFT_KEY);
    if (!saved) return;
    const timer = window.setTimeout(() => {
      setInput(saved);
      setFreeMode(true);
      setMessage(replaceNames(DAILY_TALK.return, alias, user));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alias, user]);

  useEffect(() => {
    if (silenceShown.current) return;
    const timer = window.setTimeout(() => {
      silenceShown.current = true;
      setMessage(replaceNames(DAILY_TALK.silence, alias, user));
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [alias, input, user]);

  function finishDraft() {
    window.sessionStorage.removeItem(TALK_DRAFT_KEY);
  }

  async function submitFreeTalk() {
    const text = input.trim();
    if (!text || chatLoading || chatStopped) return;
    setInput("");
    finishDraft();
    setConversation((current) => [...current, { role: "user", text }]);
    setChatLoading(true);
    setDogThinking(true);
    const result = await requestAgent({
      task: "companion_reply",
      scene: "note",
      userText: text,
      noteContext: {
        jars: (state?.jars ?? []).map((jar) => ({ kind: jar.kind, label: jar.label, amount: jar.actual })),
        principles: (state?.principles ?? [])
          .filter((principle) => principle.status === "confirmed" || principle.status === "edited")
          .slice(-5)
          .map((principle) => ({ statement: principle.statement })),
        concerns: (state?.profile.expressionPrefs ?? []).slice(0, 4),
        stories: (state?.stories ?? []).slice(-3).map((story) => ({
          intent: story.intent,
          action: story.action,
          ...(story.amount !== undefined ? { amount: story.amount } : {}),
          ...(story.confirmedJar ? { confirmedJar: story.confirmedJar } : {}),
          ...(story.outcome ? { outcome: {
            happened: story.outcome.happened,
            ...(story.outcome.actualAmount !== undefined ? { actualAmount: story.outcome.actualAmount } : {}),
            ...(story.outcome.feelingNote ? { feelingNote: story.outcome.feelingNote } : {}),
          } } : {}),
        })),
        conversation: conversation.slice(-8),
      },
    });
    if (result.ok) {
      const reply = readReply(result.payload);
      setConversation((current) => [...current, { role: "assistant", text: reply.text }]);
      if (reply.crisis) setChatStopped(true);
    } else {
      setConversation((current) => [...current, { role: "assistant", text: NOTE_MODEL_REPLY.fallback }]);
    }
    setDogThinking(false);
    setChatLoading(false);
  }

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="stage talk-page" aria-label={`和${alias}聊天`}>
        <button className="simple-back decision-back back-arrow-button" type="button" onClick={() => router.push("/")} aria-label="返回首页"><span className="back-arrow-icon" aria-hidden="true" /></button>
        <section className="dog-layer" aria-label={alias}>
          <Dog page="对话" alias={alias} message={freeMode ? null : message} talkMode />
        </section>
        {!freeMode && <section className="talk-actions talk-entry-options" aria-label="对话入口">
          <TextEntry onClick={() => { finishDraft(); router.push("/talk?mode=buy"); }}>{script.home.buyEntry}</TextEntry>
          <TextEntry onClick={() => { finishDraft(); router.push("/talk?topic=money"); }}>{script.home.moneyEntry}</TextEntry>
          <TextEntry onClick={() => { setFreeMode(true); setMessage(replaceNames(DAILY_TALK.prompt, alias, user)); }}>{script.home.chatEntry}</TextEntry>
        </section>}
        {freeMode && <section className="talk-conversation" aria-live="polite">{conversation.map((turn, index) => <p key={`${turn.role}-${index}`} className={turn.role === "user" ? "decision-user-bubble" : "decision-dog-bubble"}>{turn.text}</p>)}{chatLoading && <p className="decision-dog-bubble money-note-thinking-bubble" aria-hidden="true"> </p>}</section>}
        {freeMode && !chatStopped && <form className="talk-record" onSubmit={(event) => { event.preventDefault(); void submitFreeTalk(); }}><input disabled={chatLoading} value={input} onChange={(event) => { setInput(event.target.value); window.sessionStorage.setItem(TALK_DRAFT_KEY, event.target.value); }} placeholder={replaceNames(DAILY_TALK.freePlaceholder, alias, user)} aria-label={replaceNames(DAILY_TALK.freePlaceholder, alias, user)} /><button type="submit" disabled={chatLoading || !input.trim()}>{replaceNames(DAILY_TALK.submit, alias, user)}</button></form>}
      </section>
    </main>
  );
}

function TalkPageInner() {
  const params = useSearchParams();
  const draft = params.get("draft") ?? "";
  if (params.get("topic") === "money") return <MoneyNoteFlow initialStory={draft} recordOnly />;
  if (params.get("mode") === "buy") return <BuyDecisionFlow initialItem={draft} />;
  return <TalkLanding />;
}

export default function TalkPage() {
  return <Suspense fallback={<LoadingState />}><TalkPageInner /></Suspense>;
}
