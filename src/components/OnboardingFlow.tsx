"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/copy/zh";
import { homeData } from "@/mock/home";
import { script, withAlias } from "@/mock/script";
import { useAlias } from "@/lib/state/alias-store";
import { useDogActions } from "@/lib/state/dog-state";
import { useMoneyState } from "@/lib/state/money-store";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";

const screenCount = 11;

const flowJarImages = {
  living: "/assets/jar-living-ui.png",
  comfort: "/assets/jar-comfort-ui.png",
  dream: "/assets/jar-dream-ui.png",
  future: "/assets/jar-future-ui.png",
} as const;

function money(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, value));
}

export function OnboardingFlow() {
  const router = useRouter();
  const { alias, setAlias } = useAlias();
  const { triggerAction } = useDogActions();
  const { state, commit } = useMoneyState();
  const [screen, setScreen] = useState(0);
  const [aliasDraft, setAliasDraft] = useState(alias);
  const [recentChoice, setRecentChoice] = useState<string | null>(null);
  const [recentText, setRecentText] = useState("");
  const [farChoice, setFarChoice] = useState<string | null>(null);
  const [goalField, setGoalField] = useState(0);
  const [goalValues, setGoalValues] = useState(["", "", ""]);
  const [wishes, setWishes] = useState<string[]>([...script.steps.wishes.items]);
  const [wishSelected, setWishSelected] = useState<boolean[]>(script.steps.wishes.items.map(() => true));
  const [editingWish, setEditingWish] = useState<number | null>(null);
  const [amounts, setAmounts] = useState(["", "", ""]);
  const [unsure, setUnsure] = useState<number | null>(null);
  const [fixedCosts, setFixedCosts] = useState(["", "", "", "", "", ""]);
  const [showCalculator, setShowCalculator] = useState(false);
  const [editingCost, setEditingCost] = useState(0);
  const [jarValues, setJarValues] = useState(homeData.jars.map((jar) => Math.round(jar.planned / 100)));
  const [editingJar, setEditingJar] = useState<number | null>(null);
  const [futureChoice, setFutureChoice] = useState<"none" | "save" | null>(null);

  const fixedTotal = useMemo(() => fixedCosts.reduce((total, value) => total + (Number(value) || 0), 0), [fixedCosts]);
  const livingAmount = Number(amounts[1]) || fixedTotal;
  const reserve = Math.max(0, (Number(amounts[0]) || 0) - livingAmount);
  const reverseText = script.steps.reverse.message.replace(script.flow.placeholder, money(Math.round(reserve * 0.2)));
  const defaultAvailable = useMemo(() => homeData.jars.reduce((total, jar) => total + Math.round(jar.planned / 100), 0), []);
  const availableToArrange = Number(amounts[0]) || defaultAvailable;
  const futureAmount = jarValues[3] || 0;
  const comfortAmount = jarValues[1] || 0;
  const futureSummary = script.steps.jars.futureSummary
    .replace(script.flow.placeholder, money(futureAmount))
    .replace(script.flow.placeholder, money(comfortAmount));
  const futureLow = script.steps.jars.futureLow.replace(script.flow.placeholder, money(comfortAmount));

  useEffect(() => setAliasDraft(alias), [alias]);

  function goNext() {
    if (screen === 0) setAlias(aliasDraft);
    if (screen === 2 && !farChoice?.startsWith("A")) {
      setScreen(4);
      return;
    }
    setScreen((current) => Math.min(screenCount - 1, current + 1));
  }

  function goBack() {
    if (screen === 0) {
      router.push("/");
      return;
    }
    if (screen === 4 && !farChoice?.startsWith("A")) {
      setScreen(2);
      return;
    }
    setScreen((current) => Math.max(0, current - 1));
  }

  function updateAmount(index: number, value: string) {
    setAmounts((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  function updateJarValue(index: number, value: string) {
    const numeric = Number(value) || 0;
    setJarValues((current) => {
      const nextValues = current.map((item, itemIndex) => itemIndex === index ? numeric : item);
      if (index === 0 || index === 2 || index === 3) {
        nextValues[1] = availableToArrange - nextValues[0] - nextValues[2] - nextValues[3];
      }
      return nextValues;
    });
  }

  function chooseFuture(value: "none" | "save") {
    setFutureChoice(value);
    if (value === "none") {
      updateJarValue(3, "0");
      setEditingJar(null);
    } else {
      setEditingJar(3);
    }
  }

  function confirmPlan() {
    const availableCents = Math.max(0, Math.round(availableToArrange * 100));
    const result = applyJarPlan({
      baseState: state,
      disposable: availableCents,
      livingPlanned: Math.max(0, Math.round((jarValues[0] || 0) * 100)),
      dreamGoal: { name: goalValues[0].trim() || "梦想罐", amount: Math.max(0, Math.round((jarValues[2] || 0) * 100)), saved: 0, monthsRemaining: 1 },
      futurePlanned: Math.max(0, Math.round((futureAmount || 0) * 100)),
      confirmed: true,
    });
    commit(result.state);
    setAlias(aliasDraft);
    if (result.proposedAction) triggerAction(result.proposedAction);
    router.push("/");
  }

  function gemTier(value: number) {
    const ratio = availableToArrange > 0 ? value / availableToArrange : 0;
    if (ratio === 0) return "none";
    if (ratio < 0.25) return "thin";
    if (ratio <= 0.6) return "half";
    return "full";
  }

  function renderFooter(hint?: string, onNext = goNext) {
    return (
      <footer className="flow-footer">
        {hint && <p className="flow-hint">{hint}</p>}
        <div className="flow-controls">
          <button className="flow-back-action" type="button" onClick={goBack}>{script.flow.back}</button>
          {screen < screenCount - 1 && <button className="flow-primary-action" type="button" onClick={onNext}>{script.flow.next}</button>}
        </div>
      </footer>
    );
  }

  function removeWish(index: number) {
    setWishes((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setWishSelected((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setEditingWish(null);
  }

  function addWish() {
    setWishes((current) => [...current, ""]);
    setWishSelected((current) => [...current, true]);
    setEditingWish(wishes.length);
  }

  return (
    <main className="flow-shell">
      <section className="flow-page" aria-label={`小狗${aliasDraft || copy.默认小名}起点流程`}>
        {screen === 0 && (
          <div className="flow-screen flow-welcome">
            <div className="flow-content">
              <p className="flow-welcome-title">{withAlias(script.welcome.greeting, aliasDraft || copy.默认小名)}</p>
              <p>{script.welcome.body}</p>
              <p>{script.welcome.closing}</p>
              <p className="flow-question">{script.nickname.prompt}</p>
              <input className="flow-input" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder={copy.默认小名} aria-label={script.nickname.prompt} />
              <p className="flow-message">{withAlias(script.nickname.closing, aliasDraft || copy.默认小名)}</p>
            </div>
            <button className="flow-primary" type="button" onClick={goNext}>{script.flow.start}</button>
          </div>
        )}

        {screen === 1 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.recent.question}</p>
              <div className="flow-options">{script.steps.recent.options.map((option) => <button key={option} type="button" className={recentChoice === option ? "is-selected" : ""} onClick={() => setRecentChoice(option)}>{option}</button>)}</div>
              <input className="flow-input" value={recentText} onChange={(event) => setRecentText(event.target.value)} placeholder={script.steps.recent.freeInputHint} aria-label={script.steps.recent.freeInputHint} />
            </div>
            {renderFooter(script.steps.recent.stepHint)}
          </div>
        )}

        {screen === 2 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.far.question}</p>
              <div className="flow-options">{script.steps.far.options.map((option) => <button key={option} type="button" className={farChoice === option ? "is-selected" : ""} onClick={() => setFarChoice(option)}>{option}</button>)}</div>
            </div>
            {renderFooter(script.steps.far.stepHint)}
          </div>
        )}

        {screen === 3 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.far.subQuestions[goalField]}</p>
              <input
                className="flow-input"
                value={goalValues[goalField]}
                onChange={(event) => setGoalValues((current) => current.map((value, index) => index === goalField ? event.target.value : value))}
                placeholder={goalField === 0 ? script.steps.far.firstPlaceholder : undefined}
                inputMode={goalField === 1 ? "decimal" : "text"}
              />
              <div className="flow-field-trail">
                {goalValues.map((value, index) => index < goalField && value ? <button key={index} type="button" onClick={() => setGoalField(index)}>{value}</button> : null)}
              </div>
            </div>
            <footer className="flow-footer">
              <p className="flow-hint">{script.steps.far.stepHint}</p>
              <div className="flow-controls">
                <button className="flow-back-action" type="button" onClick={() => goalField > 0 ? setGoalField((current) => current - 1) : goBack()}>{script.flow.back}</button>
                <button className="flow-primary-action" type="button" onClick={() => goalField < 2 ? setGoalField((current) => current + 1) : goNext()}>{script.flow.next}</button>
              </div>
            </footer>
          </div>
        )}

        {screen === 4 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.wishes.question}</p>
              <div className="wish-list">{wishes.map((wish, index) => (
                <div className="wish-row" key={index}>
                  <button className="wish-check" type="button" aria-label={wishSelected[index] ? "已选" : "未选"} onClick={() => setWishSelected((current) => current.map((item, itemIndex) => itemIndex === index ? !item : item))}><img src={wishSelected[index] ? "/assets/勾选框-已选.png" : "/assets/勾选框-未选.png"} alt="" /></button>
                  {editingWish === index ? <input autoFocus value={wish} onChange={(event) => setWishes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /> : <button className="wish-text-action" type="button" onClick={() => setEditingWish(index)}>{wish || script.flow.edit}</button>}
                  <button className="wish-remove" type="button" onClick={() => removeWish(index)}>{script.flow.remove}</button>
                </div>
              ))}</div>
              <div className="flow-inline-actions"><button className="flow-option-action" type="button" onClick={addWish}>{script.steps.wishes.add}</button><button className="flow-primary-action" type="button" onClick={() => setEditingWish(null)}>{script.flow.done}</button></div>
            </div>
            {renderFooter(script.steps.wishes.stepHint)}
          </div>
        )}

        {screen === 5 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.numbers.inputs[0]}</p>
              <span className="input-line"><input className="flow-input" value={amounts[0]} onChange={(event) => updateAmount(0, event.target.value)} inputMode="decimal" /><button type="button" onClick={() => setUnsure(0)}>{script.steps.numbers.unsure}</button></span>
              {unsure === 0 && <p className="flow-message">{withAlias(script.steps.numbers.unsureResponse, aliasDraft || copy.默认小名)}</p>}
            </div>
            {renderFooter(script.steps.numbers.stepHint)}
          </div>
        )}

        {screen === 6 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.numbers.inputs[1]}</p>
              {!showCalculator ? (
                <>
                  <span className="input-line"><input className="flow-input" value={amounts[1]} onChange={(event) => updateAmount(1, event.target.value)} inputMode="decimal" /><button type="button" onClick={() => setUnsure(1)}>{script.steps.numbers.unsure}</button></span>
                  <button className="flow-calculate-action" type="button" onClick={() => setShowCalculator(true)}>{script.steps.numbers.calculate}</button>
                  {unsure === 1 && <p className="flow-message">{withAlias(script.steps.numbers.unsureResponse, aliasDraft || copy.默认小名)}</p>}
                </>
              ) : (
                <div className="cost-list">
                  <div className="cost-tabs">{script.steps.numbers.fixedCosts.map((name, index) => <button key={name} type="button" className={editingCost === index ? "is-active" : ""} onClick={() => setEditingCost(index)}>{name}{fixedCosts[index] ? ` ${fixedCosts[index]}` : ""}</button>)}</div>
                  <label>{script.steps.numbers.fixedCosts[editingCost]}<input className="flow-input" value={fixedCosts[editingCost]} onChange={(event) => setFixedCosts((current) => current.map((item, index) => index === editingCost ? event.target.value : item))} inputMode="decimal" /></label>
                  <p className="cost-total">{money(fixedTotal)} 元</p>
                  <button className="flow-option-action" type="button" onClick={() => { updateAmount(1, String(fixedTotal)); setShowCalculator(false); }}>{script.flow.save}</button>
                </div>
              )}
            </div>
            {renderFooter(script.steps.numbers.stepHint)}
          </div>
        )}

        {screen === 7 && (
          <div className="flow-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.numbers.inputs[2]}</p>
              <span className="input-line"><input className="flow-input" value={amounts[2]} onChange={(event) => updateAmount(2, event.target.value)} inputMode="decimal" /><button type="button" onClick={() => setUnsure(2)}>{script.steps.numbers.unsure}</button></span>
              {unsure === 2 && <p className="flow-message">{withAlias(script.steps.numbers.unsureResponse, aliasDraft || copy.默认小名)}</p>}
            </div>
            {renderFooter(script.steps.numbers.stepHint)}
          </div>
        )}

        {screen === 8 && (
          <div className="flow-screen">
            <div className="flow-content flow-reverse-copy">
              <p className="flow-question">{withAlias(reverseText, aliasDraft || copy.默认小名)}</p>
              <p>{script.steps.reverse.dogMore}</p>
              {reserve < (Number(amounts[0]) || 0) * 0.25 && <p>{script.steps.reverse.pressure}</p>}
            </div>
            {renderFooter(script.steps.reverse.stepHint)}
          </div>
        )}

        {screen === 9 && (
          <div className="flow-screen flow-jars-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.jars.question}</p>
              <div className="flow-jar-grid">{homeData.jars.map((jar, index) => <button key={jar.kind} type="button" className={`flow-jar-choice ${jar.kind === "future" && jarValues[index] === 0 ? "flow-future-jar" : ""}`} onClick={() => setEditingJar(index)}>
                <span className="flow-jar-art">
                  {jar.kind === "future" && jarValues[index] === 0 ? <img className="flow-future-image" src="/assets/jar-future-empty-ui.png" alt="" /> : <>
                    {gemTier(jarValues[index]) !== "none" && <img className="flow-jar-gems" src={`/assets/gems-tier-${gemTier(jarValues[index])}.png?v=3`} alt="" />}
                    <img className="flow-jar-image" src={flowJarImages[jar.kind]} alt="" />
                  </>}
                </span>
                <span>{jar.label}{jar.kind === "future" && <img className="flow-edit-pencil" src="/assets/编辑铅笔.png" alt="" aria-hidden="true" />}</span>
                <strong>{money(jarValues[index])} 元</strong>
              </button>)}</div>
              {editingJar !== null && <label className="flow-jar-edit">{homeData.jars[editingJar].label}<input autoFocus className="flow-input" value={jarValues[editingJar] || ""} onChange={(event) => updateJarValue(editingJar, event.target.value)} inputMode="decimal" /></label>}
              <section className="future-question" aria-label="未来罐选择">
                <p>{script.steps.jars.futureQuestion}</p>
                <p className="flow-message">{script.steps.jars.futureDetail}</p>
                <div className="flow-inline-actions future-options">{script.steps.jars.futureOptions.map((option, index) => <button key={option} className="flow-option-action" type="button" onClick={() => chooseFuture(index === 0 ? "none" : "save")}>{option}</button>)}</div>
                {futureChoice === "save" && <div className="future-input-line"><span>{futureSummary}</span>{comfortAmount < 500 && <span className="future-low">{futureLow} <button type="button" onClick={() => updateJarValue(3, "0")}>{script.steps.jars.futureReduce}</button></span>}</div>}
              </section>
            </div>
            {renderFooter(script.steps.jars.stepHint)}
          </div>
        )}

        {screen === 10 && (
          <div className="flow-screen flow-confirm-screen">
            <div className="flow-content">
              <p className="flow-question">{script.steps.jars.bottom}</p>
              <div className="flow-plan-summary">{homeData.jars.map((jar, index) => <p key={jar.kind}><span>{jar.label}</span><strong>{money(jarValues[index])} 元</strong></p>)}</div>
              <p>{script.principleIntro}</p>
              <p className="flow-message">{script.principleIntroMore}</p>
              <div className="flow-record">
                <strong>{withAlias(script.firstRecord.title, aliasDraft || copy.默认小名)}</strong>
                <p>{script.firstRecord.body}</p>
              </div>
            </div>
            <footer className="flow-footer">
              <p className="flow-hint">{withAlias(script.steps.jars.afterHint, aliasDraft || copy.默认小名)}</p>
              <div className="flow-confirm-actions">
                <button className="flow-primary-action" type="button" onClick={confirmPlan}>{withAlias(script.steps.jars.confirm, aliasDraft || copy.默认小名)}</button>
                <button className="flow-back-action" type="button" onClick={goBack}>{withAlias(script.steps.jars.back, aliasDraft || copy.默认小名)}</button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </main>
  );
}
