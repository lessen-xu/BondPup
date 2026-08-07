import type { CSSProperties } from "react";
import type { HomeJar } from "@/types/home";
import { script } from "@/mock/script";

export function formatMoney(cents: number) {
  return `¥${new Intl.NumberFormat("zh-CN").format(cents / 100)}`;
}

type JarProps = HomeJar & {
  slotLeft: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
};

function formatAmount(cents: number) {
  return `${new Intl.NumberFormat("zh-CN").format(cents / 100)} 元`;
}

export function Jar({ kind, label, planned, slotLeft, description, selected, onSelect }: JarProps) {
  const isEmpty = kind === "future" && planned === 0;
  return (
    <div className={`jar-slot jar-slot-${kind}`} style={{ "--jar-slot-left": slotLeft } as CSSProperties}>
      <button className="jar" type="button" onClick={onSelect} aria-label={`查看${label}`}>
        <span className="jar-name">{label}{kind === "future" && <img className="jar-edit-pencil" src="/assets/编辑铅笔.png" alt="" aria-hidden="true" />}</span>
        <span className="amount jar-amount">{formatAmount(planned)}</span>
      </button>
      {selected && (
        <aside className="jar-note" onClick={(event) => event.stopPropagation()}>
          <p>{label}</p>
          {!isEmpty && <strong>{formatMoney(planned)}</strong>}
          <small>{isEmpty ? script.steps.jars.future.empty : description}</small>
          <button type="button" onClick={(event) => event.stopPropagation()}>{script.home.edit}</button>
        </aside>
      )}
    </div>
  );
}
