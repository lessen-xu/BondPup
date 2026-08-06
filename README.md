# 小狗慢慢 · BondPup

不替你决定、但会记住你如何做决定的钱包陪伴 Agent。

- 体验:https://bondpup.vercel.app
- MCP:`https://bondpup.vercel.app/mcp`(Streamable HTTP,兼容 2026-07-28 与 2025-era 两代协议)

## 快速验证

```bash
npm install
npm test                     # 单元测试
npm run dev                  # http://localhost:3000
bash scripts/verify-mcp.sh   # MCP 链路验证
```

图形化调试:`npx @modelcontextprotocol/inspector@latest` → Streamable HTTP → `http://localhost:3000/mcp`。全程无需模型密钥。

## 目录结构

| 目录 | 职责 |
|---|---|
| `src/contracts/` | 数据对象 zod schema、状态机、错误契约 |
| `src/server/domain/` | 确定性计算:四罐恒等式、月供、扣罐/撤销、周期切换、结余、原则 |
| `src/server/safety/` | 安全红线分流、禁用词与回应校验 |
| `src/server/agent/` | 模型任务层(愿望拆解、陪伴回应、原则生成),无密钥时走确定性 Mock |
| `src/server/mcp/` | MCP 工具面,包装确定性计算层 |
| `src/app/` | 页面与 API 路由:`/`、`/api/agent`、`/health`、`/mcp` |

核心原则:金额一律整数分;金额由代码计算,理由由模型生成,改变状态必须用户确认;跨罐永不自动级联。

## MCP 工具

`create_money_session` / `plan_jars` / `record_money_moment` / `confirm_jar_action` / `get_money_overview`

- 预览与写入分离:`plan_jars` 默认预览,`confirm:true` 才写入;扣罐必须经 `confirm_jar_action`,可撤销
- 写操作支持 `expectedStateVersion` 乐观锁与 `idempotencyKey` 幂等
- 服务端不持久化状态:每个响应回传完整 `moneyState`,客户端链回即可
- 风险输入(自伤/借贷/投资)返回安全回应而非罐子建议,审计不含原文

## 环境变量

见 [.env.example](.env.example),密钥只进部署平台环境变量。
