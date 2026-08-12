"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OUTFIT_ITEMS } from "@/lib/outfit-items";
import { useMoneyState } from "@/lib/state/money-store";
import { OUTFIT_PAGE } from "@/mock/剧本";

/** 换装展示版:七件配饰自由穿脱,同槽位互斥;equipped 直接 commit 进状态。
 *  没有分罐子也能玩(本地试穿,不持久化)——装扮不该被起点流程挡住。 */
export default function OutfitPage() {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const [localEquipped, setLocalEquipped] = useState<string[]>([]);
  const equipped = state ? state.outfit.equipped : localEquipped;
  const alias = state?.profile.dogName?.trim() || "慢慢";

  function toggle(id: string) {
    const item = OUTFIT_ITEMS.find((candidate) => candidate.id === id);
    if (!item) return;
    const next = equipped.includes(id)
      ? equipped.filter((equippedId) => equippedId !== id)
      : [...equipped.filter((equippedId) => OUTFIT_ITEMS.find((candidate) => candidate.id === equippedId)?.slot !== item.slot), id];
    if (state) {
      commit({ ...state, stateVersion: state.stateVersion + 1, outfit: { ...state.outfit, owned: OUTFIT_ITEMS.map((candidate) => candidate.id), equipped: next } });
    } else {
      setLocalEquipped(next);
    }
  }

  if (!ready) return null;
  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page outfit-page" aria-label={`给${alias}装扮`}>
        <button className="simple-back" type="button" onClick={() => router.push("/")}>{OUTFIT_PAGE.back}</button>
        <div className="outfit-stage" aria-label={alias}>
          <img className="outfit-dog-image" src="/assets/dog-idle.png" alt="" />
          {OUTFIT_ITEMS.filter((item) => equipped.includes(item.id)).map((item) => (
            <img
              key={item.id}
              className="outfit-item-overlay"
              src={item.image}
              alt={item.label}
              style={{ top: item.pos.top, left: item.pos.left, width: item.pos.width, transform: item.pos.rotate ? `rotate(${item.pos.rotate})` : undefined }}
            />
          ))}
        </div>
        <p className="outfit-hint">{OUTFIT_PAGE.hint}</p>
        <div className="outfit-shelf" role="group" aria-label="配饰">
          {OUTFIT_ITEMS.map((item) => {
            const on = equipped.includes(item.id);
            return (
              <button key={item.id} type="button" className={`outfit-shelf-item ${on ? "is-selected" : ""}`} aria-pressed={on} onClick={() => toggle(item.id)}>
                <img src={item.image} alt="" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
