/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
import type { Jar as MoneyJar, JarKind } from "@/contracts";
import { JAR_LABEL_SLOTS } from "@/config/jar-slots";
import { script } from "@/mock/script";
import { Jar } from "./Jar";

type JarGroupProps = {
  jars: MoneyJar[];
  selectedKind: JarKind | null;
  onSelect: (kind: JarKind) => void;
};

const descriptions: Record<JarKind, string> = {
  living: script.steps.jars.living.note,
  comfort: script.steps.jars.comfort.note,
  dream: script.steps.jars.dream.note,
  future: script.steps.jars.future.empty,
};

export function JarGroup({ jars, selectedKind, onSelect }: JarGroupProps) {
  return (
    <div className="jar-group" aria-label="储蓄罐">
      <img className="jars-on-table-art" src="/assets/jars-on-table.png" alt="" aria-hidden="true" />
      {jars.map((jar) => (
        <Jar
          key={jar.kind}
          {...jar}
          slotLeft={JAR_LABEL_SLOTS[jar.kind].left}
          description={descriptions[jar.kind]}
          selected={selectedKind === jar.kind}
          onSelect={() => onSelect(jar.kind)}
        />
      ))}
    </div>
  );
}
