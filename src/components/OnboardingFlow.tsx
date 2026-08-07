/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JarKind } from "@/contracts";
import { applyJarPlan, type ApplyJarPlanResult } from "@/lib/plan/apply-jar-plan";
import { createInitialMoneyState } from "@/lib/mock/money-state";
import { useMoneyState } from "@/lib/state/money-store";
import { computeJars } from "@/server/domain/jars";
import { computeLivingJar, type LivingItems } from "@/server/domain/living";
import { ERRORS, SAFETY } from "@/mock/剧本";
import { script, withAlias } from "@/mock/script";
import { Dog } from "./Dog";
import { LoadingState } from "./LoadingState";

const DRAFT_KEY = "onboarding-draft";
const DEFAULT_ALIAS = "慢慢";
const SCREEN_COUNT = 8;
const DRAFT_VERSION = 2;

type NearChoice = "save" | "comfortable" | "goal" | "custom";
type LivingItemKey = keyof LivingItems;
type EditableJarKind = Exclude<JarKind, "comfort">;

type GoalDraft = {
  name: string;
  amount: number;
  monthsRemaining: number | null;
};

type OnboardingDraft = {
  version: number;
  screen: number;
  introStep: "welcome" | "nickname";
  alias: string;
  nearChoice?: NearChoice;
  customText?: string;
  hasGoal: boolean | null;
  farChoice: number | null;
  goal: GoalDraft;
  concerns: string[];
  concernSelected: boolean[];
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
  version: DRAFT_VERSION,
  screen: 0,
  introStep: "welcome",
  alias: "",
  hasGoal: null,
  farChoice: null,
  goal: { name: "", amount: 0, monthsRemaining: null },
  concerns: [...script.steps.wishes.items],
  concernSelected: script.steps.wishes.items.map(() => true),
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

const flowJarAssets = [...flowJars.map((jar) => jar.image), "/assets/jar-future-empty-ui.png"];

function parseYuanToCents(value: string): number {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d*(?:\.\d{0,2})?$/.test(normalized) || !normalized) return 0;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : 0;
}

function parseMonths(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const months = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(months) && months > 0 ? months : null;
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
    if (!Number.isInteger(parsed.screen)) return null;
    const savedScreen = parsed.screen ?? -1;
    const legacyScreens = [0, 1, 2, 2, 3, 4, 4, 4, 5, 6, 7];
    const screen = parsed.version === DRAFT_VERSION
      ? savedScreen
      : legacyScreens[savedScreen];
    if (screen === undefined || screen < 0 || screen >= SCREEN_COUNT) return null;
    return {
      ...initialDraft,
      ...parsed,
      version: DRAFT_VERSION,
      screen,
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
  const concerns = draft.concerns.filter((concern, index) => draft.concernSelected[index] && concern.trim()).map((concern) => concern.trim());
  return { ...state, profile: { ...state.profile, displayName: alias, expressionPrefs: concerns } };
}

export function OnboardingFlow() {
  const router = useRouter();
  const { state, commit } = useMoneyState();
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft);
  const [hydrated, setHydrated] = useState(false);
  const [editingWish, setEditingWish] = useState<number | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [editingCost, setEditingCost] = useState(0);
  const [editingDreamLabel, setEditingDreamLabel] = useState(false);
  const [comfortAccepted, setComfortAccepted] = useState(false);
  const [preview, setPreview] = useState<ApplyJarPlanResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jarAssetsReady, setJarAssetsReady] = useState(false);
  const [jarPage, setJarPage] = useState<"view" | "edit">("view");

  const alias = draft.alias.trim() || DEFAULT_ALIAS;
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
    const timer = window.setTimeout(() => {
      setDraft(restoreDraft(window.sessionStorage.getItem(DRAFT_KEY)) ?? initialDraft);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all(flowJarAssets.map((src) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = src;
    }))).then(() => {
      if (active) setJarAssetsReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        const initialState = state ?? createInitialMoneyState(alias);
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
  }, [alias, draft, goal, hydrated, livingPlanned, state]);

  function patchDraft(patch: Partial<OnboardingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function setScreen(screen: number) {
    patchDraft({ screen });
  }

  function goNext() {
    setScreen(Math.min(SCREEN_COUNT - 1, draft.screen + 1));
  }

  function goBack() {
    if (draft.screen === 0) {
      router.push("/");
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
    if (kind === "living") patchDraft({ livingPlanned: cents, useLivingItems: false });
    if (kind === "dream") patchDraft({ dreamMonthlyOverride: cents });
    if (kind === "future") patchDraft({ futurePlanned: cents });
  }

  function jarAmount(kind: JarKind): number {
    if (!preview) return 0;
    if (kind === "comfort" && draft.screen === 6 && !comfortAccepted) return 0;
    return preview.plan[kind === "comfort" ? "comfort" : kind];
  }

  function saveLivingCosts() {
    const total = livingTotal;
    const check = computeJars({
      disposable: draft.disposable,
      livingPlanned: total,
      dreamMonthly: 0,
      futurePlanned: 0,
    });
    patchDraft({ livingPlanned: total, useLivingItems: true });
    setShowCalculator(false);
    if (check.shortfall === 0) goNext();
  }

  function saveNumberPlan() {
    if (livingCheck.shortfall === 0) goNext();
  }

  function continueFromJars() {
    if (!preview || preview.plan.shortfall > 0) return;
    setComfortAccepted(true);
    setScreen(7);
  }

  function openJarEditor() {
    setComfortAccepted(true);
    setJarPage("edit");
  }

  function acceptJarPlan() {
    if (!preview || preview.plan.shortfall > 0) {
      openJarEditor();
      return;
    }
    setComfortAccepted(true);
    setScreen(7);
  }

  function chooseFuture(choice: "none" | "save") {
    if (choice === "none") {
      patchDraft({ futurePlanned: 0 });
    }
  }

  function removeWish(index: number) {
    setDraft((current) => ({
      ...current,
      concerns: current.concerns.filter((_, itemIndex) => itemIndex !== index),
      concernSelected: current.concernSelected.filter((_, itemIndex) => itemIndex !== index),
    }));
    setEditingWish(null);
  }

  function addWish() {
    setDraft((current) => ({
      ...current,
      concerns: [...current.concerns, ""],
      concernSelected: [...current.concernSelected, true],
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
      screen: index === 0 ? current.screen : 3,
    }));
  }

  function confirmPlan() {
    try {
      const initialState = state ?? createInitialMoneyState(alias);
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
        {draft.screen > 0 && <div className="flow-progress" aria-label={`第 ${draft.screen} 步,共 7 步`}>{Array.from({ length: 7 }, (_, index) => <span key={index} className={`${index + 1 === draft.screen ? "is-current" : ""} ${draft.screen === 6 && jarPage === "edit" && index === 5 ? "is-substep" : ""}`} />)}</div>}
        {draft.screen === 0 && draft.introStep === "welcome" && <div className="flow-intro-screen flow-welcome-screen"><section className="flow-intro-dog intro-welcome-dog" aria-label="慢慢"><Dog page="首页" state="idle" alias="慢慢" message={null} onActivate={() => patchDraft({ introStep: "nickname" })} /></section><p className="intro-greeting">{script.welcome.greeting}</p><p className="intro-body">{script.welcome.bodyLines.map((line) => <span key={line}>{line}</span>)}</p><p className="intro-closing">{script.welcome.closingLines.map((line) => <span key={line}>{line}</span>)}</p><button className="flow-primary-action intro-primary" type="button" onClick={() => patchDraft({ introStep: "nickname" })}>{script.welcome.start}</button><p className="flow-age-notice intro-age-notice">{SAFETY.ageNotice}</p></div>}

        {draft.screen === 0 && draft.introStep === "nickname" && <div className="flow-intro-screen flow-nickname-screen"><section className="flow-intro-dog intro-nickname-dog" aria-label={alias}><Dog page="首页" state="idle" alias={alias} message={null} /></section><p className="intro-nickname-prompt">{script.nickname.prompt}</p><input className="flow-input intro-alias-input" value={draft.alias} onChange={(event) => patchDraft({ alias: event.target.value })} placeholder={script.nickname.placeholder} aria-label={script.nickname.prompt} /><p className="intro-nickname-closing">{script.nickname.closing}</p><button className="flow-primary-action intro-primary intro-nickname-confirm" type="button" onClick={goNext}>{script.nickname.confirm}</button></div>}

        {draft.screen === 1 && <div className="flow-screen flow-recent-screen"><div className="flow-content"><p className="flow-question">{script.steps.recent.question}</p><div className="flow-options">{script.steps.recent.options.map((option, index) => <button key={option} type="button" className={draft.nearChoice === nearChoices[index] ? "is-selected" : ""} onClick={() => chooseNear(nearChoices[index])}><span className="flow-option-letter" aria-hidden="true">{option.slice(0, 1)}</span><span className="flow-option-copy">{option.slice(2)}</span></button>)}</div>{draft.nearChoice === "custom" && <input className="flow-input" value={draft.customText ?? ""} onChange={(event) => patchDraft({ customText: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && draft.customText?.trim()) goNext(); }} placeholder={script.steps.recent.freeInputHint} aria-label={script.steps.recent.freeInputHint} />}<p className="flow-hint flow-recent-hint">{script.steps.recent.stepHint}</p></div>{draft.nearChoice === "custom" ? renderFooter() : renderBackFooter()}</div>}

        {draft.screen === 2 && (
          <div className={`flow-screen flow-far-screen ${draft.hasGoal === true ? "flow-far-details" : ""}`}>
            <div className="flow-content">
              {draft.hasGoal !== true ? (
                <>
                  <p className="flow-question">{script.steps.far.question}</p>
                  <div className="flow-options">{script.steps.far.options.map((option, index) => <button key={option} type="button" className={draft.farChoice === index ? "is-selected" : ""} onClick={() => chooseFar(index)}>{option}</button>)}</div>
                </>
              ) : (
                <>
                  <p className="flow-question">{script.steps.far.question}</p>
                  <div className="flow-goal-fields">
                    <label><span>{script.steps.far.subQuestions[0]}</span><input className="flow-input" value={draft.goal.name} onChange={(event) => { updateGoal({ name: event.target.value }); patchDraft({ dreamLabel: event.target.value || "梦想罐" }); }} placeholder={script.steps.far.firstPlaceholder} /></label>
                    <label><span>{script.steps.far.subQuestions[1]}</span><input className="flow-input" value={formatCentsInput(draft.goal.amount)} onChange={(event) => updateGoal({ amount: parseYuanToCents(event.target.value) })} inputMode="decimal" /></label>
                    <label><span>{script.steps.far.subQuestions[2]}</span><input className="flow-input" value={draft.goal.monthsRemaining ?? ""} onChange={(event) => updateGoal({ monthsRemaining: parseMonths(event.target.value) })} inputMode="numeric" placeholder={script.steps.far.monthPlaceholder} /></label>
                  </div>
                </>
              )}
            </div>
            {draft.hasGoal === true ? renderFooter(script.steps.far.stepHint) : renderBackFooter(script.steps.far.stepHint)}
          </div>
        )}

        {draft.screen === 3 && <div className="flow-screen flow-wishes-screen"><div className="flow-content"><p className="flow-question">{script.steps.wishes.question}</p><div className="wish-list">{draft.concerns.map((wish, index) => <div className="wish-row" key={index}><button className="wish-check" type="button" aria-label={draft.concernSelected[index] ? "已选" : "未选"} onClick={() => setDraft((current) => ({ ...current, concernSelected: current.concernSelected.map((item, itemIndex) => itemIndex === index ? !item : item) }))}><img src={draft.concernSelected[index] ? "/assets/勾选框-已选.png" : "/assets/勾选框-未选.png"} alt="" /></button>{editingWish === index ? <input autoFocus value={wish} onChange={(event) => setDraft((current) => ({ ...current, concerns: current.concerns.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} /> : <button className="wish-text-action" type="button" onClick={() => setEditingWish(index)}>{wish || script.flow.edit}</button>}<button className="wish-remove" type="button" onClick={() => removeWish(index)}>{script.flow.remove}</button></div>)}</div><div className="flow-inline-actions wish-actions"><button className="flow-option-action wish-add-action" type="button" onClick={addWish}>{script.steps.wishes.add}</button><button className="flow-primary-action" type="button" onClick={() => setEditingWish(null)}>{script.flow.done}</button></div></div>{renderFooter(script.steps.wishes.stepHint)}</div>}

        {draft.screen === 4 && (
          <div className="flow-screen flow-numbers-screen">
            <div className="flow-content">
              {!showCalculator ? (
                <>
                  <p className="flow-question">{script.steps.numbers.inputs[0]}</p>
                  <div className="flow-number-fields">
                    <input className="flow-input" value={formatCentsInput(draft.disposable)} onChange={(event) => patchDraft({ disposable: parseYuanToCents(event.target.value) })} inputMode="decimal" />
                    <label><span>{script.steps.numbers.inputs[1]}</span><input className="flow-input" value={formatCentsInput(draft.useLivingItems ? livingTotal : draft.livingPlanned)} onChange={(event) => patchDraft({ livingPlanned: parseYuanToCents(event.target.value), useLivingItems: false })} inputMode="decimal" /></label>
                    <p className="flow-input-hint">{script.steps.numbers.livingHint}</p>
                    <button className="flow-calculate-action" type="button" onClick={() => setShowCalculator(true)}>{script.steps.numbers.calculate}</button>
                    <label><span>{script.steps.numbers.inputs[2]}</span><input className="flow-input" value={formatCentsInput(draft.savings)} onChange={(event) => patchDraft({ savings: parseYuanToCents(event.target.value) })} inputMode="decimal" /></label>
                    {livingCheck.shortfall > 0 && <p className="flow-message flow-balance-warning">这两个数字加起来有点对不上,要不要回去看看?</p>}
                    <button className="flow-primary-action numbers-save-action" type="button" onClick={saveNumberPlan}>{script.flow.save}</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="flow-question">{script.steps.numbers.inputs[1]}</p>
                  <div className="cost-list">
                    <div className="cost-tabs">{script.steps.numbers.fixedCosts.map((name, index) => <button key={name} type="button" className={editingCost === index ? "is-active" : ""} onClick={() => setEditingCost(index)}>{name}{draft.livingItems[livingItemKeys[index]] ? ` ${formatCents(draft.livingItems[livingItemKeys[index]] ?? 0)}` : ""}</button>)}</div>
                    <label>{script.steps.numbers.fixedCosts[editingCost]}<input className="flow-input" value={formatCentsInput(draft.livingItems[livingItemKeys[editingCost]])} onChange={(event) => updateLivingItem(livingItemKeys[editingCost], event.target.value)} inputMode="decimal" /></label>
                    <p className="cost-total">{formatCents(livingTotal)} 元</p>
                    <button className="flow-option-action cost-save-action" type="button" onClick={saveLivingCosts}>{script.flow.save}</button>
                  </div>
                </>
              )}
            </div>
            <footer className="flow-footer"><div className="flow-controls flow-back-only"><button className="flow-back-action" type="button" onClick={() => showCalculator ? setShowCalculator(false) : goBack()} aria-label={script.flow.back}>{script.flow.back}</button></div></footer>
          </div>
        )}

        {draft.screen === 5 && <div className="flow-screen"><div className="flow-content flow-reverse-copy"><p className="flow-question">{goal ? script.steps.reverse.message.replace(script.flow.placeholder, formatCents(preview?.plan.dreamMonthly ?? 0)) : script.steps.reverse.noTime}</p>{goal && <p>{script.steps.reverse.dogMore}</p>}{preview?.plan.shortfall ? <p>{preview.note}</p> : null}{previewError && <p className="flow-message">{previewError}</p>}</div>{renderFooter(script.steps.reverse.stepHint)}</div>}

        {draft.screen === 6 && jarPage === "view" && (
          <div className="flow-screen flow-jars-screen flow-jars-view">
            <div className="flow-content">
              <p className="flow-question">{script.steps.jars.question}</p>
              <div className="flow-jar-grid">
                {flowJars.map((jar) => (
                  <div key={jar.kind} className={`flow-jar-choice ${jar.kind === "future" && jarAmount("future") === 0 ? "flow-future-jar" : ""}`}>
                    <span className={`flow-jar-art ${jarAssetsReady ? "is-ready" : "is-loading"}`}>
                      {jar.kind === "future" && jarAmount("future") === 0
                        ? <img className="flow-future-image" src="/assets/jar-future-empty-ui.png" alt="" />
                        : <img className="flow-jar-image" src={jar.image} alt="" />}
                    </span>
                    <span className="flow-jar-label"><span className="jar-name-text">{jar.kind === "dream" ? draft.dreamLabel : jar.label}</span></span>
                    <strong>{formatCents(jarAmount(jar.kind))} 元</strong>
                  </div>
                ))}
              </div>
              {preview && preview.plan.shortfall === 0 && !comfortAccepted && preview.plan.comfort > 0 && <p className="flow-balance-status">还差 {formatCents(preview.plan.comfort)} 元</p>}
              {preview && preview.plan.shortfall > 0 && <p className="flow-balance-status">多出 {formatCents(preview.plan.shortfall)} 元</p>}
            </div>
            <footer className="flow-footer flow-jar-view-footer">
              <button className="flow-back-action" type="button" onClick={goBack}>{script.flow.back}</button>
              <div className="flow-jar-view-actions">
                <button className="flow-option-action" type="button" onClick={openJarEditor}>{script.steps.jars.viewEdit}</button>
                {preview?.plan.shortfall === 0 && <button className="flow-primary-action" type="button" onClick={acceptJarPlan}>{script.steps.jars.viewAccept}</button>}
              </div>
            </footer>
          </div>
        )}

        {draft.screen === 6 && jarPage === "edit" && (
          <div className="flow-screen flow-jars-screen flow-jars-edit">
            <div className="flow-content">
              <p className="flow-question">{script.steps.jars.question}</p>
              <div className="flow-jar-edit-grid">
                {flowJars.map((jar) => (
                  <label key={jar.kind}>
                    {jar.kind === "dream" && editingDreamLabel
                      ? <input autoFocus className="flow-jar-name-input" value={draft.dreamLabel} onChange={(event) => patchDraft({ dreamLabel: event.target.value })} onBlur={() => setEditingDreamLabel(false)} />
                      : <span>{jar.kind === "dream" ? draft.dreamLabel : jar.label}{jar.kind === "dream" && <button type="button" onClick={() => setEditingDreamLabel(true)}>改名字</button>}</span>}
                    <input
                      className="flow-input"
                      value={formatCentsInput(jarAmount(jar.kind))}
                      onChange={(event) => { if (jar.kind !== "comfort") updateJar(jar.kind, event.target.value); }}
                      inputMode="decimal"
                      readOnly={jar.kind === "comfort"}
                      aria-readonly={jar.kind === "comfort"}
                    />
                  </label>
                ))}
              </div>
              {preview && preview.plan.shortfall > 0 && <p className="flow-balance-status">多出 {formatCents(preview.plan.shortfall)} 元</p>}
              <section className="future-question" aria-label="未来罐选择">
                <p>{script.steps.jars.futureQuestion}</p>
                <div className="flow-inline-actions future-options">
                  {script.steps.jars.futureOptions.map((option, index) => <button key={option} className="flow-option-action" type="button" onClick={() => chooseFuture(index === 0 ? "none" : "save")}>{option}</button>)}
                </div>
              </section>
            </div>
            <footer className="flow-footer flow-jar-edit-footer">
              <button className="flow-back-action" type="button" onClick={() => setJarPage("view")}>{script.flow.back}</button>
              <button className="flow-primary-action" type="button" onClick={continueFromJars}>{script.steps.jars.editDone}</button>
            </footer>
          </div>
        )}

        {draft.screen === 7 && <div className="flow-screen flow-confirm-screen"><div className="flow-content"><p className="flow-question">{script.steps.jars.bottom}</p><div className="flow-plan-summary">{flowJars.map((jar) => <p key={jar.kind}><span>{jar.kind === "dream" ? draft.dreamLabel : jar.label}</span><strong>{formatCents(jarAmount(jar.kind))} 元</strong></p>)}</div>{preview && <p className="flow-message">{preview.note}</p>}{submitError && <p className="decision-dog-bubble flow-submit-error">{submitError}</p>}<p>{script.principleIntro}</p><div className="flow-record"><strong>{withAlias(script.firstRecord.title, alias)}</strong><p>{script.firstRecord.body}</p></div></div><footer className="flow-footer"><p className="flow-hint">{withAlias(script.steps.jars.afterHint, alias)}</p><div className="flow-confirm-actions"><button className="flow-primary-action" type="button" onClick={confirmPlan}>{withAlias(script.steps.jars.confirm, alias)}</button><button className="flow-back-action" type="button" onClick={goBack}>{script.flow.back}</button></div></footer></div>}
      </section>
    </main>
  );
}
