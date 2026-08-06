# 小狗慢慢 · BondPup

**不替你决定、但会记住你如何做决定的钱包陪伴 Agent。**

慢慢是一只可以聊钱的小狗:四种罐子(生活/安心/梦想/未来)记住当下安排,真实回看形成经你确认的「金钱原则」,让下一次回应真正属于你。

- 体验 URL:https://bondpup.vercel.app
- MCP URL:`https://bondpup.vercel.app/mcp`(Streamable HTTP;2026-07-28 规范原生 + 2025-era 回退,同一端点两代兼容)

## Quick Verify(评审推荐路径)

```bash
npm install
npm test              # 确定性计算单元测试(四罐恒等式、月供公式)
npm run dev           # http://localhost:3000 → Mock 首页(合成示例数据,无需密钥)
curl http://localhost:3000/health
bash scripts/verify-mcp.sh   # MCP 两代协议验证:tools/list + plan_jars + initialize 回退
```

MCP 图形化验收:`npx @modelcontextprotocol/inspector@latest` → Streamable HTTP → `http://localhost:3000/mcp`。

## 架构一览

| 目录 | 职责 |
|---|---|
| `src/contracts/` | ★合同冻结区(2026-08-06 冻结):全部数据对象 zod schema、状态机九态、错误契约。改动走契约变更单 |
| `src/server/domain/` | 确定性工具层(纯函数):四罐恒等式、月供公式、加法清单、扣罐(计划 8/8) |
| `src/server/mcp/` | MCP 工具面(≤5 个,直接包装确定性工具层,无需模型密钥可走通) |
| `src/server/safety/` | 禁用词表与安全校验(校验逻辑计划 8/9) |
| `src/server/agent/` | 模型适配层(计划 8/7:Claude 原生 /v1/messages + 国产兼容端点) |
| `src/app/` | 页面与路由:`/`(首页)、`/health`、`/mcp` |

**核心原则**:金额一律整数分(展示 ÷100);**金额=代码算,理由=模型写,结果=用户改并确认**;跨罐永不自动级联;余数进安心罐,未来罐永不自动接收。

## MCP 工具面

`create_money_session` → `plan_jars`(真) → `record_money_moment` → `confirm_jar_action`(8/8 转真) → `get_money_overview`。写操作带 `expectedStateVersion` + `idempotencyKey`;每个响应回传完整 `moneyState`,客户端链回即可(服务端不持久化状态)。

## 环境变量

见 [.env.example](.env.example)。真实密钥只进 Vercel 环境变量,绝不提交仓库。今日骨架无需任何密钥。

