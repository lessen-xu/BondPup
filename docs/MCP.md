# MCP 接入文档

端点:`https://bondpup.vercel.app/mcp`(Streamable HTTP,无需鉴权,无密钥可完整走通)

## 工具(共 5 个,读写分明)

| 工具 | 读/写 | 作用 |
|---|---|---|
| `create_money_session` | 写(新建) | 新会话,返回 `sessionId` 与初始 `moneyState` |
| `plan_jars` | 预览只读 / confirm 写 | 四罐恒等式分配;默认只预览,`confirm:true` 才写入 |
| `record_money_moment` | 只读 | 说一笔钱:返回候选动作 `proposal`(HMAC 签名),不改余额 |
| `confirm_action` | 写 | 所有确认动作:扣罐/撤销/决定/回看/原则/周期/碎钻,按 `action` 区分 |
| `get_money_overview` | 只读 | 周期、四罐、结余、到期回看、候选原则、已确认原则引用 |

完整闭环:`create_money_session → plan_jars(confirm) → record_money_moment → confirm_action → get_money_overview`。

## 会话模型(无状态服务化)

每个响应都回传完整 `moneyState`。**主路径是把上一步返回的 `moneyState` 原样链回下一次调用**;`sessionId` 只是同实例内存缓存的句柄,跨实例(Vercel 多实例)必须链 `moneyState`。未知 `sessionId` 返回 `not_found`,不会静默伪装成新用户。

## 写操作契约(冻结)

所有写操作必须带:

- `expectedStateVersion`:当前 `moneyState.stateVersion`,不匹配 → `state_conflict`(HTTP 409 语义)
- `idempotencyKey`:客户端生成的唯一串;重放返回首次结果,不重复写入

`confirm_action(confirm_debit)` 还必须带 `record_money_moment` 返回的完整 `proposal`:内容由服务端 HMAC-SHA256 签发,签名同时绑定签发时刻的 moneyState 摘要——改金额、换罐子、伪造签名、拿其他会话(即使版本号相同)的 proposal 来确认,都会被拒;`proposal.stateVersion` 落后于当前状态 → `state_conflict`(候选动作过期)。

`confirm_action` 各 action 的专属必填字段(如 `note_only`→`intent`、`undo`→`undoToken`)以 `allOf`/`if-then` 形式写在公开 `inputSchema` 里,自动调用器可静态推导;运行时缺失同样返回统一 `{code:"validation_error", message}` 并点名缺什么。

## 协议版本

同一端点支持两代协议:

- **2026-07-28**:必须带 `Mcp-Method` 头且与 body 的 `method` 一致(否则 `-32020`);`tools/call` 还需 `Mcp-Name` 头;`params._meta` 带 `io.modelcontextprotocol/protocolVersion` 等字段
- **2025 世代**:标准 JSON-RPC,无上述头要求

工具全部声明 `outputSchema`,成功结果同时给 `content[0].text`(JSON 字符串)与 `structuredContent`(同源结构化对象)——按 schema 读结构化即可,无需解析 text。`moneyState` 在 schema 中以 unknown 承接(运行时仍严格 zod 校验),避免 tools/list 膨胀。

## 错误码

`validation_error`(参数/签名/契约违反)、`state_conflict`(乐观锁)、`not_found`(会话/故事不存在)、`rate_limited`、`internal_error`。错误统一 `isError:true` + `{code, message}`。请求体上限 128KB(超出 413)。

## 最小示例

```bash
curl -s https://bondpup.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Mcp-Name: create_money_session" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_money_session","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"demo","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

## 端到端验证

```bash
node scripts/smoke-mcp.mjs https://bondpup.vercel.app   # 32 次调用、30 条断言
npx @modelcontextprotocol/inspector                      # 或用 Inspector 交互式连
```

安全红线在 MCP 面同样生效:`record_money_moment` 的描述命中风险关键词时不给罐子建议,返回安全回应与审计草稿(不含原文)。
