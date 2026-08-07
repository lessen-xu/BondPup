export type DogState = "idle" | "think" | "lying" | "reading" | "box" | "ears" | "jump";

export const 页面主体 = {
  首页: "idle",
  对话: "idle",
  回看: "idle",
  原则卡: "idle",
  装扮: "idle",
} as const satisfies Record<string, DogState>;

export const 互动触发 = {
  等待模型: "think",
  开始对话: "lying",
  记录完成: "ears",
  安排完成: "jump",
  进入回看: "reading",
} as const satisfies Record<string, DogState>;

export const 互动姿态 = ["think", "ears", "idle"] as const satisfies readonly DogState[];

export const DOG_STATE_ASSETS: Record<DogState, string> = {
  idle: "/assets/dog-idle.png",
  think: "/assets/dog-think.png",
  lying: "/assets/dog-lying.png",
  reading: "/assets/dog-reading.png",
  box: "/assets/dog-box.png",
  ears: "/assets/dog-ears.png",
  jump: "/assets/dog-jump.png",
};
