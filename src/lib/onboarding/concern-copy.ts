/** 分配屏「安心罐这些就是留给它们的」引用的 concern 列表:
 *  已经变成梦想罐目标的那条要排除——它的钱在梦想罐,不在安心罐。
 *  concern 与目标没有结构化关联(concern 来自拆解,目标另填),只能按文本判断。
 *  实测陷阱:目标「买一件 hcb」对 concern「买那件hcb」,量词不同导致纯包含匹配失效,
 *  所以除包含外还看归一化后的最长公共子串(≥3 才算同一件事,避免「想买」这类通用词误伤)。 */

const norm = (s: string) => s.toLowerCase().replace(/[\s，。、「」『』！？!?.,·~〜]/g, "");

function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev[j - 1] + 1;
        if (row[j] > best) best = row[j];
      }
    }
    prev = row;
  }
  return best;
}

/** goalNames 里长度 ≥2 的名字,与 concern 互相包含、或公共子串 ≥3,即认为同一件事 */
export function concernMentionsGoal(concern: string, goalNames: string[]): boolean {
  const c = norm(concern);
  if (!c) return false;
  return goalNames.some((name) => {
    const n = norm(name);
    if (n.length < 2) return false;
    if (c.includes(n) || n.includes(c)) return true;
    return longestCommonSubstring(c, n) >= 3;
  });
}

/** 给安心罐归属文案用的 concern 子集;存库的 expressionPrefs 不经过这里 */
export function concernsForComfortCopy(
  concerns: string[],
  hasGoal: boolean,
  goalName: string,
  dreamLabel: string,
): string[] {
  if (!hasGoal) return concerns;
  const goalNames = [goalName, dreamLabel === "梦想罐" ? "" : dreamLabel];
  return concerns.filter((concern) => !concernMentionsGoal(concern, goalNames));
}
