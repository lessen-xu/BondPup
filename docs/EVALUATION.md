# 评测指南与实测数据

## 快速入口

- 产品(带示例数据):<https://bondpup.vercel.app/?demo=1> —— 三分钟评测路径见 [README](../README.md#三分钟评测路径)
- MCP 端点:`https://bondpup.vercel.app/mcp`(5 工具,无密钥可完整走通,契约见 [MCP.md](MCP.md))
- 一键端到端断言(32 次真实调用、30 条断言):
  ```bash
  node scripts/smoke-mcp.mjs https://bondpup.vercel.app
  ```

## 性能实测(2026-08-08,生产环境)

| 路径 | 实测延迟 | 说明 |
|---|---|---|
| `/api/agent` 问候(greet) | ~2.3s | 真实模型(DeepSeek v4-flash) |
| `/api/agent` 决策(decision) | 2.5–4.8s | 含状态摘要注入与三选项生成 |
| `/api/agent` 原则生成 | 1.4–2.3s | 思考模式已关(开着实测 9.2s,会爆 8s 预算) |
| 安全红线命中 | ~0.02s | 输入闸直返,不调模型 |
| MCP 全闭环 smoke | 32 次调用全过 | 分配→扣罐→撤销→回看→原则→引用→删除 |

超时预算链:服务端每个任务共享 9s 总 deadline;首发最多 8s,只有输出闸失败且剩余至少 1.2s 才在同一 deadline 内重试;客户端 10s——网页放弃时服务端必已结束,无白计费。

## 质量闸门

- 145 个单元测试(契约/域计算/安全层/API 契约/注入契约/超时与成本护栏),`tsc --noEmit`,`next build`,全部进 CI;约定红灯不合并(过程中曾有一次红灯误合并,当日发现当日修复,详见 PR #42/#43)
- MCP smoke 覆盖:恒等式、四罐齐全、乐观锁冲突、幂等重放、proposal 验签/过期/篡改、413 体积上限、structuredContent 与 text 同源、具名 output schema 与金额边界

## 真实模型上线当天的输出闸战绩

接入真实模型后半小时内的线上抽测,两道闸各自拦下真实违规样本——这些问题在 Mock 下永远测不出来:

| 抓到的问题 | 处置 |
|---|---|
| 决策回复 4 句(全角标点致句数闸漏计) | 句数正则补真全角 `！？`(U+FF01/U+FF1F),带字节级回归测试 |
| 模型问「值不值」(违反「三个中性动作,不问值不值」) | 「值不值」入禁用词表,输出闸命中即重试/兜底;决策指令强制三选项齐全 |
| 「活着没什么意思」未命中自伤词表 | 词表改为 `活着没(?:什么|啥|有)?意思` 全变体覆盖,实测正确进入安全出口 |
| 思考模式长考 978 token 爆超时预算 | 对 DeepSeek 端点显式关闭 thinking,9.2s → 1.4s |

修复后复测:决策场景连续 3 次三选项齐全、句数 ≤3、零违禁词;危机短语正确返回热线文案与 `crisis` 分流标记。

## 安全响应头

全站(含 `/mcp`、`/api/agent`)带:CSP(`default-src 'self'`、`connect-src 'self'`、`frame-ancestors 'none'`)、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`(摄像头/麦克风/定位全关)、HSTS。浏览器侧无任何外部连接——模型调用全部发生在服务端。
