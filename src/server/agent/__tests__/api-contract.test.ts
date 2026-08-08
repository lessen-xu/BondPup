import { describe, expect, it } from "vitest";
import { runAgentTask } from "@/server/agent";
import { validateReplyText } from "@/server/safety/validate";

/**
 * API→组件契约测试:锁定 /api/agent 响应里页面依赖的安全字段。
 * 页面读 safetyFlags 做分流(crisis→SAFETY_EXIT,offTopic→想聊聊分支),
 * 审计写入读 safetyEvent;字段名改动必须先改这里。
 */
describe("/api/agent 安全字段契约(防漂移)", () => {
  it("自伤输入 → safetyFlags=[crisis] + safetyEvent(self_harm),回应过语气闸", async () => {
    const out = await runAgentTask({
      task: "companion_reply",
      scene: "note",
      userText: "最近觉得活着没意思",
    });
    expect(out.task).toBe("companion_reply");
    expect(out.safetyFlags).toEqual(["crisis"]);
    expect(out.safetyEvent?.riskType).toBe("self_harm");
    if (out.task === "companion_reply") {
      expect(out.result.text.length).toBeGreaterThan(0);
      expect(validateReplyText(out.result.text)).toEqual([]);
    }
  });

  it("借贷 → debt;投资 → invest;泛化情绪 → offTopic", async () => {
    const debt = await runAgentTask({ task: "companion_reply", scene: "note", userText: "花呗还不上了" });
    expect(debt.safetyFlags).toEqual(["debt"]);
    const invest = await runAgentTask({ task: "companion_reply", scene: "note", userText: "想去炒股翻倍" });
    expect(invest.safetyFlags).toEqual(["invest"]);
    const emo = await runAgentTask({ task: "companion_reply", scene: "note", userText: "压力好大想哭" });
    expect(emo.safetyFlags).toEqual(["offTopic"]);
    expect(emo.safetyEvent?.riskType).toBe("generic_emotion");
  });

  it("普通输入无 safetyFlags,带 provider 标记", async () => {
    const out = await runAgentTask({ task: "companion_reply", scene: "greet" });
    expect(out.safetyFlags).toBeUndefined();
    expect(out.safetyEvent).toBeUndefined();
    expect(out.provider).toBe("mock");
  });
});
