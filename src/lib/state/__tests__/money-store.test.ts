/** 演示/真实数据双键隔离:进演示不销毁真实数据,退出演示回落真实数据。
 *  vitest 跑在 node 环境,先造一个最小 window 再动态 import 模块。 */
import { beforeEach, describe, expect, it } from "vitest";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const local = makeStorage();
const session = makeStorage();
(globalThis as Record<string, unknown>).window = { localStorage: local, sessionStorage: session };

const store = await import("../money-store");
const { mockMoneyState } = await import("@/lib/mock/money-state");
const { createInitialMoneyState } = await import("@/lib/mock/money-state");

const REAL_KEY = "bondpup.moneyState.v1";
const DEMO_KEY = "bondpup.moneyState.demo.v1";

function realState() {
  return createInitialMoneyState("测试");
}

beforeEach(() => {
  local.removeItem(REAL_KEY);
  local.removeItem(DEMO_KEY);
  store.clearMoneyState(); // 复位模块内缓存
  store.clearMoneyState();
});

describe("演示/真实双键隔离", () => {
  it("进入演示不覆盖真实数据;演示态优先加载", () => {
    store.saveMoneyState(realState());
    const savedReal = local.getItem(REAL_KEY);
    expect(savedReal).not.toBeNull();

    store.loadDemoState();
    expect(local.getItem(REAL_KEY)).toBe(savedReal); // 真实键原封不动
    expect(store.loadMoneyState()?.demo).toBe(true); // 加载到的是演示态
  });

  it("退出演示只删演示键,回落到真实数据", () => {
    store.saveMoneyState(realState());
    store.loadDemoState();
    store.clearMoneyState();
    expect(local.getItem(DEMO_KEY)).toBeNull();
    const after = store.loadMoneyState();
    expect(after).not.toBeNull();
    expect(after?.demo).toBe(false);
  });

  it("没有演示数据时清空删的才是真实键", () => {
    store.saveMoneyState(realState());
    store.clearMoneyState();
    expect(local.getItem(REAL_KEY)).toBeNull();
    expect(store.loadMoneyState()).toBeNull();
  });

  it("旧版本把演示数据写在真实键上:加载时搬回演示键,不冒充真实数据", () => {
    local.setItem(REAL_KEY, JSON.stringify(mockMoneyState)); // 模拟同键覆盖时代的遗留
    const loaded = store.loadMoneyState();
    expect(loaded?.demo).toBe(true);
    expect(local.getItem(REAL_KEY)).toBeNull();
    expect(local.getItem(DEMO_KEY)).not.toBeNull();
  });

  it("导入合法 JSON 落真实键;非法 JSON 抛错不写库", () => {
    const real = realState();
    store.importMoneyStateJson(JSON.stringify(real));
    expect(local.getItem(REAL_KEY)).not.toBeNull();
    expect(local.getItem(DEMO_KEY)).toBeNull();

    expect(() => store.importMoneyStateJson("{not json")).toThrow();
    expect(() => store.importMoneyStateJson('{"hello":1}')).toThrow();
  });
});
