import type { HomeJar, HomeJarKind } from "@/types/home";
import { JAR_LABEL_SLOTS } from "@/config/jar-slots";
import { script } from "@/mock/script";
import { Jar } from "./Jar";

type JarGroupProps = {
  jars: HomeJar[];
  selectedKind: HomeJarKind | null;
  onSelect: (kind: HomeJarKind) => void;
};

const descriptions: Record<HomeJarKind, string> = {
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
