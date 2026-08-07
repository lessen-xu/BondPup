"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { layout } from "@/config/layout";
import { useAlias } from "@/lib/state/alias-store";
import { useDecisionStore } from "@/lib/state/decision-store";
import { script, withAlias } from "@/mock/script";
import { buyScript, reviewScript } from "@/mock/剧本";
import type { HomeData, HomeJarKind } from "@/types/home";
import { Dog } from "./Dog";
import { JarGroup } from "./JarGroup";
import { Leftover } from "./Leftover";
import { TextEntry } from "./TextEntry";
import { HandDrawnUnderline } from "./HandDrawnUnderline";

type StageProps = { data: HomeData };

const homeComposition = {
  tableGroup: { left: "35%", bottom: "44%", width: "63%" },
  dog: { left: "8%", bottom: "17.5%", width: "54.5%" },
} as const;

export function Stage({ data }: StageProps) {
  const router = useRouter();
  const { alias } = useAlias();
  const { records, ready: decisionsReady } = useDecisionStore();
  const [selectedKind, setSelectedKind] = useState<HomeJarKind | null>(null);
  const hasDueReview = decisionsReady && records.some((record) => (
    record.status === buyScript.pending && new Date(record.reviewAt).getTime() <= Date.now()
  ));
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
          <JarGroup jars={data.jars} selectedKind={selectedKind} onSelect={setSelectedKind} />
        </section>

        <section className="dog-layer" aria-label={alias} onClick={(event) => event.stopPropagation()}>
          <Dog page="首页" message={withAlias(script.home.bubbleHint, alias)} onActivate={() => router.push("/talk")} />
        </section>

        <img className="dog-food-bowl" src="/assets/狗粮盆.jpg" alt="" aria-hidden="true" />

        <Leftover amount={data.leftover.amount} onOpen={() => router.push("/leftover")} />

        <nav className="utility-links" aria-label="页面工具">
          <span className="utility-link">
            <button type="button" onClick={(event) => { event.stopPropagation(); router.push("/settings"); }}>{script.home.settings}</button>
          </span>
          <span className="utility-link">
            <button type="button" onClick={(event) => { event.stopPropagation(); router.push("/cards"); }}>{script.home.cards}</button>
          </span>
        </nav>

        <nav className="talk-entries" aria-label="对话入口" onClick={(event) => event.stopPropagation()}>
          <TextEntry className="talk-entry talk-entry-buy" onClick={() => router.push("/talk?mode=buy")}>{script.home.buyEntry.replace("要不要买", "\n要不要买")}</TextEntry>
          <TextEntry className="talk-entry talk-entry-money" onClick={() => router.push("/talk?topic=money")}>{script.home.moneyEntry.replace("想说说", "\n想说说")}</TextEntry>
        </nav>

        <span className="outfit-entry">
          <button type="button" onClick={(event) => { event.stopPropagation(); router.push("/outfit"); }}>{script.home.outfit}</button>
        </span>

        {hasDueReview && (
          <span className="review-entry">
            <button type="button" onClick={(event) => { event.stopPropagation(); router.push("/reviews"); }}>{reviewScript.homeEntry}</button>
            <HandDrawnUnderline className="entry-underline" />
          </span>
        )}
      </section>
    </main>
  );
}
