/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JarKind } from "@/contracts";
import { applyJarPlan, type ApplyJarPlanResult } from "@/lib/plan/apply-jar-plan";
import { createInitialMoneyState } from "@/lib/mock/money-state";
import { useMoneyState } from "@/lib/state/money-store";
import { balanceComfortJar, compareJarAllocation, computeJars } from "@/server/domain/jars";
import { computeLivingJar, type LivingItems } from "@/server/domain/living";
import { ERRORS } from "@/mock/剧本";
import { script, withAlias } from "@/mock/script";
import { Dog } from "./Dog";
import { LoadingState } from "./LoadingState";

const DRAFT_KEY = "onboarding-draft";
const DEFAULT_ALIAS = "慢慢";
const SCREEN_COUNT = 12;

type NearChoice = "save" | "comfortable" | "goal" | "custom";
type LivingItemKey = keyof LivingItems;
type EditableJarKind = Exclude<JarKind, "comfort">;

type GoalDraft = {
  name: string;
  amount: number;
  monthsRemaining: number | null;
};

type OnboardingDraft = {
  screen: number;
  introStep: "welcome" | "nickname";
  alias: string;
  nearChoice?: NearChoice;
  customText?: string;
  hasGoal: boolean | null;
  farChoice: number | null;
  goal: GoalDraft;
  goalField: number;
  concerns: string[];
  concernSelected: boolean[];
  concernsUserEdited: boolean;
  disposable: number;
  livingPlanned: number;
  livingItems: LivingItems;
  useLivingItems: boolean;
  savings?: number;
  futurePlanned: number;
  dreamMonthlyOverride: number | null;
  dreamLabel: string;
};

const livingItemKeys: LivingItemKey[] = ["rent", "utilities", "telecom", "transport", "food", "otherFixed"];
const nearChoices: NearChoice[] = ["save", "comfortable", "goal", "custom"];

const initialDraft: OnboardingDraft = {
  screen: 0,
  introStep: "welcome",
  alias: "",
  hasGoal: null,
  farChoice: null,
  goal: { name: "", amount: 0, monthsRemaining: null },
  goalField: 0,
  concerns: [...script.steps.wishes.items],
  concernSelected: script.steps.wishes.items.map(() => true),
  concernsUserEdited: false,
  disposable: 0,
  livingPlanned: 0,
  livingItems: {},
  useLivingItems: false,
  futurePlanned: 0,
  dreamMonthlyOverride: null,
  dreamLabel: "梦想罐",
};

const flowJars = [
  { kind: "living", label: "生活罐", image: "/assets/jar-living-ui.png" },
  { kind: "dream", label: "梦想罐", image: "/assets/jar-dream-ui.png" },
  { kind: "comfort", label: "安心罐", image: "/assets/jar-comfort-ui.png" },
  { kind: "future", label: "未来罐", image: "/assets/jar-future-ui.png" },
] as const;

function parseYuanToCents(value: string): number {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d*(?:\.\d{0,2})?$/.test(normalized) || !normalized) return 0;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : 0;
}

function concernOverlap(left: string, right: string): number {
  const normalize = (value: string) => new Set(value.replace(/[\s，。、；：！？"'“”‘’（）【】「」——…～~,.!?;:()[\]]/g, ""));
  const a = normalize(left);
  const b = normalize(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const char of a) if (b.has(char)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

function dedupeConcerns(values: string[]): string[] {
  const distinct: string[] = [];
  for (const value of values) {
    const concern = value.trim();
    if (!concern || distinct.some((existing) => concernOverlap(existing, concern) > 0.6)) continue;
    distinct.push(concern);
  }
  return distinct.slice(0, 4);
}

function formatCentsInput(cents: number | undefined): string {
  if (!cents) return "";
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  return fraction ? `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}` : String(whole);
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(cents / 100);
}

function errorMessage(error: unknown): string {
  void error;
  return `${ERRORS.validation.line} ${ERRORS.validation.sub}`;
}

function restoreDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (!Number.isInteger(parsed.screen) || (parsed.screen ?? -1) < 0 || (parsed.screen ?? SCREEN_COUNT) >= SCREEN_COUNT) return null;
    const restoredScreen = parsed.screen === 10
      ? 11
      : parsed.screen === 8 && parsed.hasGoal !== true
        ? 9
        : parsed.screen ?? initialDraft.screen;
    return {
      ...initialDraft,
      ...parsed,
      screen: restoredScreen,
      goal: { ...initialDraft.goal, ...parsed.goal },
      livingItems: { ...initialDraft.livingItems, ...parsed.livingItems },
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : initialDraft.concerns,
      concernSelected: Array.isArray(parsed.concernSelected) ? parsed.concernSelected : initialDraft.concernSelected,
    };
  } catch {
    return null;
  }
}

function withProfileAnswers(state: NonNullable<ReturnType<typeof useMoneyState>["state"]>, draft: OnboardingDraft, alias: string) {
  const concerns = draft.concernsUserEdited
    ? draft.concerns.filter((concern, index) => draft.concernSelected[index] && concern.trim()).map((concern) => concern.trim())
    : [];
  return { ...state, profile: { ...state.profile, dogName: alias, expressionPrefs: concerns } };
}

export function OnboardingFlow() {
  const router = useRouter();
  const { state, commit } = useMoneyState();
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft);
  const [hydrated, setHydrated] = useState(false);
  const [editingWish, setEditingWish] = useState<number | null>(null);
  const [decomposeLoading, setDecomposeLoading] = useState(false);
  const decomposeKey = useRef("");
  const [showCalculator, setShowCalculator] = useState(false);
  const [editingCost, setEditingCost] = useState(0);
  const [editingJar, setEditingJar] = useState<EditableJarKind | null>(null);
  const [editingDreamLabel, setEditingDreamLabel] = useState(false);
  const [futureChoice, setFutureChoice] = useState<"none" | "save" | null>(null);
  const [displayedComfort, setDisplayedComfort] = useState<number | null>(null);
  const [jarsEdited, setJarsEdited] = useState(false);
  const [balanceMessage, setBalanceMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApplyJarPlanResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const alias = draft.alias.trim() || DEFAULT_ALIAS;
  const displayName = state?.profile.displayName;
  const livingTotal = useMemo(() => computeLivingJar(draft.livingItems), [draft.livingItems]);
  const livingPlanned = draft.useLivingItems ? livingTotal : draft.livingPlanned;
  const livingCheck = useMemo(() => computeJars({
    disposable: draft.disposable,
    livingPlanned,
    dreamMonthly: 0,
    futurePlanned: 0,
  }), [draft.disposable, livingPlanned]);
  const goal = useMemo(() => draft.hasGoal && draft.goal.monthsRemaining !== null
    ? ({
        name: draft.dreamLabel.trim() || draft.goal.name.trim() || "梦想罐",
        amount: draft.goal.amount,
        saved: draft.savings ?? 0,
        monthsRemaining: draft.goal.monthsRemaining,
      })
    : undefined, [draft.dreamLabel, draft.goal.amount, draft.goal.monthsRemaining, draft.goal.name, draft.hasGoal, draft.savings]);

  useEffect(() => {
    if (!hydrated || draft.screen !== 4) return;
    const choiceIndex = draft.nearChoice ? nearChoices.indexOf(draft.nearChoice) : -1;
    const selectedChoice = choiceIndex >= 0 ? script.steps.recent.options[choiceIndex].replace(/^[A-D]\s/, "") : "";
    const wish = [selectedChoice, draft.customText?.trim()].filter(Boolean).join("; ") || "我想把钱安排得更适合自己";
    const requestKey = JSON.stringify({ wish, nearChoice: draft.nearChoice, goal });
    if (decomposeKey.current === requestKey) return;
    decomposeKey.current = requestKey;
    setDecomposeLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "decompose_wish", wish, nearChoice: draft.nearChoice, goal }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("agent_failed");
      const payload = await response.json() as { result?: { concerns?: unknown } };
      const rawConcerns = Array.isArray(payload.result?.concerns)
        ? payload.result.concerns.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
        : [];
      const distinctConcerns = dedupeConcerns(rawConcerns);
      const needsUserInput = distinctConcerns.length < 3;
      const concerns = needsUserInput ? [...distinctConcerns, ""] : distinctConcerns;
      setDraft((current) => ({ ...current, concerns, concernSelected: concerns.map(() => true), concernsUserEdited: needsUserInput }));
      setEditingWish(needsUserInput ? distinctConcerns.length : null);
    }).catch(() => {
      setDraft((current) => ({
        ...current,
        concerns: [""],
        concernSelected: [true],
        concernsUserEdited: true,
      }));
      setEditingWish(0);
    }).finally(() => {
      window.clearTimeout(timeout);
      setDecomposeLoading(false);
    });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft.customText, draft.goal.amount, draft.goal.monthsRemaining, draft.goal.name, draft.hasGoal, draft.nearChoice, draft.screen, goal, hydrated]);
  const visibleComfort = jarsEdited ? displayedComfort ?? 0 : preview?.plan.comfort ?? 0;
  const jarBalance = useMemo(() => preview ? compareJarAllocation({
    disposable: draft.disposable,
    living: preview.plan.living,
    comfort: visibleComfort,
    dream: preview.plan.dream,
    future: preview.plan.future,
  }) : null, [draft.disposable, preview, visibleComfort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraft(restoreDraft(window.sessionStorage.getItem(DRAFT_KEY)) ?? initialDraft);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        const initialState = state ?? createInitialMoneyState(displayName, alias);
        const baseState = withProfileAnswers(initialState, draft, alias);
        const result = applyJarPlan({
          baseState,
          disposable: draft.disposable,
          ...(draft.useLivingItems ? { livingItems: draft.livingItems } : { livingPlanned }),
          ...(goal ? { dreamGoal: goal } : {}),
          futurePlanned: draft.futurePlanned,
          ...(draft.dreamMonthlyOverride !== null ? { dreamMonthlyOverride: draft.dreamMonthlyOverride } : {}),
        });
        setPreview(result);
        setPreviewError(null);
      } catch (error) {
        setPreview(null);
        setPreviewError(errorMessage(error));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alias, displayName, draft, goal, hydrated, livingPlanned, state]);

  function patchDraft(patch: Partial<OnboardingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function setScreen(screen: number) {
    patchDraft({ screen });
  }

  function goNext() {
    if (draft.screen === 2 && draft.hasGoal !== true) {
      setScreen(4);
      return;
    }
    if (draft.screen === 7 && draft.hasGoal !== true) {
      setScreen(9);
      return;
    }
    setScreen(Math.min(SCREEN_COUNT - 1, draft.screen + 1));
  }

  function goBack() {
    if (draft.screen === 0) {
      router.push("/");
      return;
    }
    if (draft.screen === 4 && draft.hasGoal !== true) {
      setScreen(2);
      return;
    }
    if (draft.screen === 9 && draft.hasGoal !== true) {
      setScreen(2);
      return;
    }
    setScreen(Math.max(0, draft.screen - 1));
  }

  function updateGoal(patch: Partial<GoalDraft>) {
    setDraft((current) => ({ ...current, goal: { ...current.goal, ...patch } }));
  }

  function updateLivingItem(key: LivingItemKey, value: string) {
    setDraft((current) => ({
      ...current,
      livingItems: { ...current.livingItems, [key]: parseYuanToCents(value) },
      useLivingItems: true,
    }));
  }

  function updateJar(kind: EditableJarKind, value: string) {
    const cents = parseYuanToCents(value);
    if (!jarsEdited) setDisplayedComfort(preview?.plan.comfort ?? 0);
    setJarsEdited(true);
    setBalanceMessage(null);
    if (kind === "living") patchDraft({ livingPlanned: cents, useLivingItems: false });
    if (kind === "dream") patchDraft({ dreamMonthlyOverride: cents });
    if (kind === "future") patchDraft({ futurePlanned: cents });
  }

  function jarAmount(kind: JarKind): number {
    if (!preview) return 0;
    if (kind === "comfort") return visibleComfort;
    return preview.plan[kind];
  }

  function continueFromLiving() {
    if (livingCheck.shortfall > 0) return;
    goNext();
  }

  function continueFromJars() {
    if (!preview || !jarBalance || jarBalance.missing > 0 || jarBalance.excess > 0) return;
    goNext();
  }

  function balanceJars() {
    if (!preview || !jarBalance) return;
    const result = balanceComfortJar({
      disposable: draft.disposable,
      living: preview.plan.living,
      comfort: visibleComfort,
      dream: preview.plan.dream,
      future: preview.plan.future,
    });
    setDisplayedComfort(result.comfort);
    setJarsEdited(true);
    setBalanceMessage(jarBalance.missing > 0 ? `剩下的 ${formatCents(jarBalance.missing)} 元进了安心罐——这是这个月可以不愧疚地用在当下的部分。` : null);
  }

  function chooseFuture(choice: "none" | "save") {
    setFutureChoice(choice);
    if (choice === "none") {
      patchDraft({ futurePlanned: 0 });
      setEditingJar(null);
      return;
    }
    setEditingJar("future");
  }

  function removeWish(index: number) {
    setDraft((current) => ({
      ...current,
      concerns: current.concerns.filter((_, itemIndex) => itemIndex !== index),
      concernSelected: current.concernSelected.filter((_, itemIndex) => itemIndex !== index),
      concernsUserEdited: true,
    }));
    setEditingWish(null);
  }

  function addWish() {
    setDraft((current) => ({
      ...current,
      concerns: [...current.concerns, ""],
      concernSelected: [...current.concernSelected, true],
      concernsUserEdited: true,
    }));
    setEditingWish(draft.concerns.length);
  }

  function chooseNear(choice: NearChoice) {
    setDraft((current) => ({
      ...current,
      nearChoice: choice,
      customText: choice === "custom" ? current.customText : undefined,
      screen: choice === "custom" ? current.screen : 2,
    }));
  }

  function chooseFar(index: number) {
    setDraft((current) => ({
      ...current,
      hasGoal: index === 0,
      farChoice: index,
    }));
  }

  function confirmPlan() {
    try {
      const initialState = state ?? createInitialMoneyState(displayName, alias);
      const baseState = withProfileAnswers(initialState, draft, alias);
      const result = applyJarPlan({
        baseState,
        disposable: draft.disposable,
        ...(draft.useLivingItems ? { livingItems: draft.livingItems } : { livingPlanned }),
        ...(goal ? { dreamGoal: goal } : {}),
        futurePlanned: draft.futurePlanned,
        ...(draft.dreamMonthlyOverride !== null ? { dreamMonthlyOverride: draft.dreamMonthlyOverride } : {}),
        confirmed: true,
      });
      commit(result.state);
      window.sessionStorage.removeItem(DRAFT_KEY);
      router.push("/");
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  }

  function renderFooter(hint?: string, onNext = goNext) {
    return (
      <footer className="flow-footer">
        {hint && <p className="flow-hint">{hint}</p>}
        <div className="flow-controls">
          <button className="flow-back-action" type="button" onClick={goBack} aria-label={script.flow.back}>{script.flow.back}</button>
          {draft.screen < SCREEN_COUNT - 1 && <button className="flow-primary-action" type="button" onClick={onNext}>{script.flow.next}</button>}
        </div>
      </footer>
    );
  }

  function renderBackFooter(hint?: string) {
    return (
      <footer className="flow-footer">
        {hint && <p className="flow-hint">{hint}</p>}
        <div className="flow-controls flow-back-only">
          <button className="flow-back-action" type="button" onClick={goBack} aria-label={script.flow.back}>{script.flow.back}</button>
        </div>
      </footer>
    );
  }

  if (!hydrated) return <LoadingState />;

  return (
    <main className="flow-shell">
      <section className={`flow-page ${draft.screen === 0 ? "flow-page-intro" : ""}`} aria-label={`小狗${alias}起点流程`}>
        {draft.screen === 0 && draft.introStep === "welcome" && <div className="flow-intro-screen flow-welcome-screen"><section className="flow-intro-dog intro-welcome-dog" aria-label="慢慢"><Dog page="首页" state="idle" alias="慢慢" message={null} onActivate={() => patchDraft({ introStep: "nickname" })} /></section><p className="intro-greeting">{script.welcome.greeting}</p><p className="intro-body">{script.welcome.bodyLines.map((line) => <span key={line}>{line}</span>)}</p><p className="intro-closing">{script.welcome.closingLines.map((line) => <span key={line}>{line}</span>)}</p><button className="flow-primary-action intro-primary" type="button" onClick={() => patchDraft({ introStep: "nickname" })}>{script.welcome.start}</button></div>}

        {draft.screen === 0 && draft.introStep === "nickname" && <div className="flow-intro-screen flow-nickname-screen"><section className="flow-intro-dog intro-nickname-dog" aria-label={alias}><Dog page="首页" state="idle" alias={alias} message={null} /></section><p className="intro-nickname-prompt">{script.nickname.prompt}</p><input className="flow-input intro-alias-input" value={draft.alias} onChange={(event) => patchDraft({ alias: event.target.value })} placeholder={script.nickname.placeholder} aria-label={script.nickname.prompt} /><p className="intro-nickname-closing">{script.nickname.closing}</p><button className="flow-primary-action intro-primary intro-nickname-confirm" type="button" onClick={goNext}>{script.nickname.confirm}</button></div>}

        {draft.screen === 1 && <div className="flow-screen flow-recent-screen"><div className="flow-content"><p className="flow-question">{script.steps.recent.question}</p><div className="flow-options">{script.steps.recent.options.map((option, index) => <button key={option} type="button" className={draft.nearChoice === nearChoices[index] ? "is-selected" : ""} onClick={() => chooseNear(nearChoices[index])}><span className="flow-option-letter" aria-hidden="true">{option.slice(0, 1)}</span><span className="flow-option-copy">{option.slice(2)}</span></button>)}</div>{draft.nearChoice === "custom" && <input className="flow-input" value={draft.customText ?? ""} onChange={(event) => patchDraft({ customText: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && draft.customText?.trim()) goNext(); }} placeholder={script.steps.recent.freeInputHint} aria-label={script.steps.recent.freeInputHint} />}<p className="flow-hint flow-recent-hint">{script.steps.recent.stepHint}</p></div>{draft.nearChoice === "custom" ? renderFooter() : renderBackFooter()}</div>}

        {draft.screen === 2 && <div className="flow-screen"><div className="flow-content"><p className="flow-question">{script.steps.far.question}</p><div className="flow-options">{script.steps.far.options.map((option, index) => <button key={option} type="button" className={draft.farChoice === index ? "is-selected" : ""} onClick={() => chooseFar(index)}>{option}</button>)}</div></div>{renderFooter(script.steps.far.stepHint)}</div>}

        {draft.screen === 3 && <div className="flow-screen"><div className="flow-content"><p className="flow-question">{script.steps.far.subQuestions[draft.goalField]}</p>{draft.goalField === 0 && <input className="flow-input" value={draft.goal.name} onChange={(event) => { updateGoal({ name: event.target.value }); patchDraft({ dreamLabel: event.target.value || "梦想罐" }); }} placeholder={script.steps.far.firstPlaceholder} />}{draft.goalField === 1 && <input className="flow-input" value={formatCentsInput(draft.goal.amount)} onChange={(event) => updateGoal({ amount: parseYuanToCents(event.target.value) })} inputMode="decimal" />}{draft.goalField === 2 && <input className="flow-input" value={draft.goal.monthsRemaining ?? ""} onChange={(event) => { const value = event.target.value.trim(); updateGoal({ monthsRemaining: /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null }); }} inputMode="numeric" placeholder={script.steps.far.monthPlaceholder} />}</div><footer className="flow-footer"><p className="flow-hint">{script.steps.far.stepHint}</p><div className="flow-controls"><button className="flow-back-action" type="button" onClick={() => draft.goalField > 0 ? patchDraft({ goalField: draft.goalField - 1 }) : goBack()}>{script.flow.back}</button><button className="flow-primary-action" type="button" onClick={() => draft.goalField < 2 ? patchDraft({ goalField: draft.goalField + 1 }) : goNext()}>{script.flow.next}</button></div></footer></div>}

        {draft.screen === 4 && <div className="flow-screen">{decomposeLoading && <section className="flow-decompose-dog" aria-live="polite"><Dog page="首页" state="think" alias={alias} message="..." /></section>}<div className="flow-content"><p className="flow-question">{script.steps.wishes.question}</p><div className="wish-list">{draft.concerns.map((wish, index) => <div className="wish-row" key={index}><button className="wish-check" type="button" aria-label={draft.concernSelected[index] ? "已选" : "未选"} onClick={() => setDraft((current) => ({ ...current, concernSelected: current.concernSelected.map((item, itemIndex) => itemIndex === index ? !item : item), concernsUserEdited: true }))}><img src={draft.concernSelected[index] ? "/assets/勾选框-已选.png" : "/assets/勾选框-未选.png"} alt="" /></button>{editingWish === index ? <input autoFocus value={wish} onChange={(event) => setDraft((current) => ({ ...current, concerns: current.concerns.map((item, itemIndex) => itemIndex === index ? event.target.value : item), concernsUserEdited: true }))} /> : <button className="wish-text-action" type="button" onClick={() => setEditingWish(index)}>{wish || script.flow.edit}</button>}<button className="wish-remove" type="button" onClick={() => removeWish(index)}>{script.flow.remove}</button></div>)}</div><div className="flow-inline-actions wish-actions"><button className="flow-option-action wish-add-action" type="button" onClick={addWish}>{script.steps.wishes.add}</button></div></div>{renderFooter(script.steps.wishes.stepHint)}</div>}

        {draft.screen === 5 && <div className="flow-screen"><div className="flow-content"><p className="flow-question">{script.steps.numbers.inputs[0]}</p><input className="flow-input" value={formatCentsInput(draft.disposable)} onChange={(event) => patchDraft({ disposable: parseYuanToCents(event.target.value) })} inputMode="decimal" /></div>{renderFooter(script.steps.numbers.stepHint)}</div>}

        {draft.screen === 6 && <div className="flow-screen"><div className="flow-content"><p className="flow-question">{script.steps.numbers.inputs[1]}</p>{!showCalculator ? <><input className="flow-input" value={formatCentsInput(draft.useLivingItems ? livingTotal : draft.livingPlanned)} onChange={(event) => patchDraft({ livingPlanned: parseYuanToCents(event.target.value), useLivingItems: false })} inputMode="decimal" /><p className="flow-input-hint">{script.steps.numbers.livingHint}</p><button className="flow-calculate-action" type="button" onClick={() => setShowCalculator(true)}>{script.steps.numbers.calculate}</button></> : <div className="cost-list"><div className="cost-tabs">{script.steps.numbers.fixedCosts.map((name, index) => <button key={name} type="button" className={editingCost === index ? "is-active" : ""} onClick={() => setEditingCost(index)}>{name}{draft.livingItems[livingItemKeys[index]] ? ` ${formatCents(draft.livingItems[livingItemKeys[index]] ?? 0)}` : ""}</button>)}</div><label>{script.steps.numbers.fixedCosts[editingCost]}<input className="flow-input" value={formatCentsInput(draft.livingItems[livingItemKeys[editingCost]])} onChange={(event) => updateLivingItem(livingItemKeys[editingCost], event.target.value)} inputMode="decimal" /></label><p className="cost-total">{formatCents(livingTotal)} 元</p><button className="flow-option-action" type="button" onClick={() => setShowCalculator(false)}>{script.flow.save}</button></div>}{livingCheck.shortfall > 0 && <p className="flow-message flow-balance-warning">这两个数字加起来有点对不上,要不要回去看看?</p>}</div>{renderFooter(script.steps.numbers.stepHint, continueFromLiving)}</div>}

        {draft.screen === 7 && <div className="flow-screen"><div className="flow-content"><p className="flow-question">{script.steps.numbers.inputs[2]}</p><input className="flow-input" value={formatCentsInput(draft.savings)} onChange={(event) => patchDraft({ savings: parseYuanToCents(event.target.value) })} inputMode="decimal" /></div>{renderFooter(script.steps.numbers.stepHint)}</div>}

        {draft.screen === 8 && draft.hasGoal === true && <div className="flow-screen"><div className="flow-content flow-reverse-copy"><p className="flow-question">{goal ? script.steps.reverse.message.replace(script.flow.placeholder, formatCents(preview?.plan.dreamMonthly ?? 0)) : script.steps.reverse.noTime}</p>{goal && <p>{script.steps.reverse.dogMore}</p>}{preview?.plan.shortfall ? <p>{preview.note}</p> : null}{previewError && <p className="flow-message">{previewError}</p>}</div>{renderFooter(script.steps.reverse.stepHint)}</div>}

        {draft.screen === 9 && <div className="flow-screen flow-jars-screen"><div className="flow-content"><p className="flow-question">{script.steps.jars.question}</p><div className="flow-jar-grid">{flowJars.map((jar) => <button key={jar.kind} type="button" className={`flow-jar-choice ${jar.kind === "future" && jarAmount("future") === 0 ? "flow-future-jar" : ""}`} onClick={() => jar.kind !== "comfort" && setEditingJar(jar.kind)}><span className="flow-jar-art">{jar.kind === "future" && jarAmount("future") === 0 ? <img className="flow-future-image" src="/assets/jar-future-empty-ui.png" alt="" /> : <img className="flow-jar-image" src={jar.image} alt="" />}</span><span className="flow-jar-label"><span className="jar-name-text">{jar.kind === "dream" ? draft.dreamLabel : jar.label}</span></span><strong>{formatCents(jarAmount(jar.kind))} 元</strong></button>)}</div>{jarBalance?.missing ? <div className="flow-balance-status"><span>还差 {formatCents(jarBalance.missing)} 元</span><button type="button" onClick={balanceJars}>放进安心罐</button></div> : null}{jarBalance?.excess ? <div className="flow-balance-status"><span>多出 {formatCents(jarBalance.excess)} 元</span>{visibleComfort > 0 && <button type="button" onClick={balanceJars}>从安心罐扣</button>}</div> : null}{editingJar && !editingDreamLabel && <label className="flow-jar-edit">{editingJar === "dream" ? draft.dreamLabel : flowJars.find((jar) => jar.kind === editingJar)?.label}<input autoFocus className="flow-input" value={formatCentsInput(jarAmount(editingJar))} onChange={(event) => updateJar(editingJar, event.target.value)} inputMode="decimal" />{editingJar === "dream" && <button type="button" onClick={() => setEditingDreamLabel(true)}>改名字</button>}</label>}{editingDreamLabel && <label className="flow-jar-edit">梦想罐名字<input autoFocus className="flow-input" value={draft.dreamLabel} onChange={(event) => { patchDraft({ dreamLabel: event.target.value }); }} onBlur={() => setEditingDreamLabel(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingDreamLabel(false); }} /></label>}<section className="future-question" aria-label="未来罐选择"><p>{script.steps.jars.futureQuestion}</p><p className="flow-message">{script.steps.jars.futureDetail}</p><div className="flow-inline-actions future-options">{script.steps.jars.futureOptions.map((option, index) => <button key={option} className="flow-option-action" type="button" onClick={() => chooseFuture(index === 0 ? "none" : "save")}>{option}</button>)}</div>{futureChoice === "save" && <div className="future-input-line"><span>{script.steps.jars.futureSummary.replace(script.flow.placeholder, formatCents(jarAmount("future"))).replace(script.flow.placeholder, formatCents(jarAmount("comfort")))}</span></div>}</section>{balanceMessage && <p className="flow-message">{balanceMessage}</p>}{previewError && <p className="flow-message">{previewError}</p>}</div>{renderFooter(script.steps.jars.stepHint, continueFromJars)}</div>}

        {draft.screen === 10 && <div className="flow-screen flow-principle-screen"><div className="flow-content"><p className="flow-principle-intro">{script.principleIntro}</p><article className="principle-card flow-principle-card"><span>{script.firstRecord.body}</span></article></div>{renderFooter()}</div>}

        {draft.screen === 11 && <div className="flow-screen flow-confirm-screen"><div className="flow-content"><p className="flow-question">{script.steps.jars.bottom}</p><div className="flow-plan-summary">{flowJars.map((jar) => <p key={jar.kind}><span>{jar.kind === "dream" ? draft.dreamLabel : jar.label}</span><strong>{formatCents(jarAmount(jar.kind))} 元</strong></p>)}</div>{preview && <p className="flow-message">{preview.note}</p>}{submitError && <p className="decision-dog-bubble flow-submit-error">{submitError}</p>}</div><footer className="flow-footer"><p className="flow-hint">{withAlias(script.steps.jars.afterHint, alias)}</p><div className="flow-confirm-actions"><button className="flow-primary-action" type="button" onClick={confirmPlan}>{withAlias(script.steps.jars.confirm, alias)}</button><button className="flow-back-action" type="button" onClick={goBack}>{script.steps.jars.back}</button></div></footer></div>}
      </section>
    </main>
  );
}
