/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { DecisionStory, JarKind, MoneyState } from "@/contracts";
import { layout } from "@/config/layout";
import { script, withAlias } from "@/mock/script";
import { DEMO } from "@/mock/剧本";
import { useMoneyState } from "@/lib/state/money-store";
import { Dog } from "./Dog";
import { JarGroup } from "./JarGroup";
import { Leftover } from "./Leftover";
import { TextEntry } from "./TextEntry";
import { HandDrawnUnderline } from "./HandDrawnUnderline";

type StageProps = {
  state: MoneyState;
  demoIntro?: boolean;
  onDismissDemoIntro?: () => void;
};

const homeComposition = {
  tableGroup: { left: "35%", bottom: "47%", width: "63%" },
  dog: { left: "8%", bottom: "18.5%", width: "60%" },
} as const;

export function Stage({ state, demoIntro = false, onDismissDemoIntro }: StageProps) {
  const router = useRouter();
  const { reset } = useMoneyState();
  const alias = state.profile.dogName?.trim() || "慢慢";
  const [selectedKind, setSelectedKind] = useState<JarKind | null>(null);
  const [demoExitPending, setDemoExitPending] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const dueReview = useMemo(() => {
    if (now === null) return null;
    return state.stories.reduce<DecisionStory | null>((earliest, record) => {
      if (record.status !== "open" || record.reviewAt === undefined || Date.parse(record.reviewAt) > now) return earliest;
      if (earliest?.reviewAt !== undefined && Date.parse(earliest.reviewAt) <= Date.parse(record.reviewAt)) return earliest;
      return record;
    }, null);
  }, [now, state.stories]);
  const stageStyle = {
    "--table-left": homeComposition.tableGroup.left,
    "--table-bottom": homeComposition.tableGroup.bottom,
    "--table-width": homeComposition.tableGroup.width,
    "--dog-left": homeComposition.dog.left,
    "--dog-bottom": homeComposition.dog.bottom,
    "--dog-width": homeComposition.dog.width,
    "--leftover-left": layout.leftoverMat.left,
    "--leftover-bottom": layout.leftoverMat.bottom,
    "--leftover-width": layout.leftoverMat.width,
  } as CSSProperties;

  return (
    <main className="stage-shell">
      <section className="stage" style={stageStyle} aria-label={`小狗${alias}首页`} onClick={() => setSelectedKind(null)}>
        <section className="jar-layer" aria-label="桌面上的四个罐子" onClick={(event) => event.stopPropagation()}>
          <JarGroup jars={state.jars} selectedKind={selectedKind} onSelect={setSelectedKind} />
        </section>

        <section className="dog-layer" aria-label={alias} onClick={(event) => event.stopPropagation()}>
          <Dog page="首页" alias={alias} message={withAlias(script.home.bubbleHint, alias)} onActivate={() => router.push("/talk")} />
        </section>

        <button className="vault-entry" type="button" onClick={(event) => { event.stopPropagation(); router.push("/vault"); }}>
          <img src="/assets/小金库.png" alt="" aria-hidden="true" />
          <span>{alias}的小金库</span>
        </button>
        <button className="companion-home-entry" type="button" onClick={(event) => { event.stopPropagation(); router.push("/companion"); }}>陪伴</button>

        <Leftover amount={state.leftover.amount} onOpen={() => router.push("/leftover")} />

        {state.demo && <span className="demo-badge">{DEMO.badge}</span>}
        {state.demo && demoIntro && <aside className="demo-intro" aria-live="polite"><p>{DEMO.enterLine}</p><p>{DEMO.enterSub}</p><button type="button" onClick={(event) => { event.stopPropagation(); onDismissDemoIntro?.(); }}>知道了</button></aside>}
        {state.demo && <button className="demo-exit" type="button" onClick={(event) => { event.stopPropagation(); setDemoExitPending(true); }}>{DEMO.exitLabel}</button>}
        {state.demo && demoExitPending && <aside className="demo-confirm" aria-live="polite" onClick={(event) => event.stopPropagation()}><p>{DEMO.exitConfirm}</p><div><button type="button" onClick={() => { reset(); setDemoExitPending(false); router.push("/"); }}>{DEMO.exitYes}</button><button type="button" onClick={() => setDemoExitPending(false)}>{DEMO.exitNo}</button></div></aside>}

        <nav className="utility-links" aria-label="页面工具">
          <span className="utility-link">
            <button type="button" onClick={(event) => { event.stopPropagation(); router.push("/settings"); }}>{script.home.settings}</button>
          </span>
          <span className="utility-link">
            <button type="button" onClick={(event) => { event.stopPropagation(); router.push("/outfit"); }}>{script.home.outfit}</button>
          </span>
        </nav>

        <nav className="talk-entries" aria-label="对话入口" onClick={(event) => event.stopPropagation()}>
          <TextEntry className="talk-entry talk-entry-buy" onClick={() => router.push("/talk?mode=buy")}>{script.home.buyEntry.replace("要不要买", "\n要不要买")}</TextEntry>
          <TextEntry className="talk-entry talk-entry-money" onClick={() => router.push("/talk?topic=money")}>{script.home.moneyEntry.replace("想说说", "\n想说说")}</TextEntry>
        </nav>

        {dueReview && (
          <span className="review-entry">
            <button type="button" onClick={(event) => { event.stopPropagation(); router.push(`/review?id=${encodeURIComponent(dueReview.id)}`); }}>{script.home.review}</button>
            <HandDrawnUnderline className="entry-underline" />
          </span>
        )}
      </section>
    </main>
  );
}
