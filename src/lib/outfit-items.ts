/**
 * 换装展示版配饰配置(复赛 P2-10):七件全部可自由穿脱,不做解锁体系
 * (解锁体系与「不庆祝不打分」冻结规则冲突,总决赛再议)。
 * pos 是相对 .outfit-stage(狗立绘容器)的百分比定位;同 slot 互斥,一次戴一件。
 */
export type OutfitSlot = "hat" | "face" | "clip" | "bag";

export type OutfitItem = {
  id: string;
  label: string;
  slot: OutfitSlot;
  image: string;
  pos: { top: string; left: string; width: string; rotate?: string };
};

export const OUTFIT_ITEMS: OutfitItem[] = [
  { id: "beret", label: "贝雷帽", slot: "hat", image: "/assets/outfit-beret.png", pos: { top: "-6%", left: "14%", width: "52%", rotate: "-6deg" } },
  { id: "party-hat", label: "生日帽", slot: "hat", image: "/assets/outfit-party-hat.png", pos: { top: "-17%", left: "33%", width: "30%" } },
  { id: "cap-green", label: "绿帽子", slot: "hat", image: "/assets/outfit-cap-green.png", pos: { top: "-10%", left: "17%", width: "50%" } },
  { id: "glasses", label: "圆眼镜", slot: "face", image: "/assets/outfit-glasses.png", pos: { top: "30%", left: "21%", width: "50%" } },
  { id: "bow", label: "蝴蝶结", slot: "clip", image: "/assets/outfit-bow.png", pos: { top: "1%", left: "58%", width: "26%", rotate: "14deg" } },
  { id: "flower-clip", label: "小花夹", slot: "clip", image: "/assets/outfit-flower-clip.png", pos: { top: "9%", left: "7%", width: "22%", rotate: "-12deg" } },
  { id: "bear-bag", label: "小熊包", slot: "bag", image: "/assets/outfit-bear-bag.png", pos: { top: "44%", left: "61%", width: "32%" } },
];
