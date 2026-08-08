# 小狗慢慢 · BondPup

第一份工资陪伴 Agent

## 入口
- 体验链接:https://bondpup.vercel.app
- 演示入口(评审推荐):https://bondpup.vercel.app/?demo=1
- MCP Endpoint:`https://bondpup.vercel.app/mcp`
- 健康检查:https://bondpup.vercel.app/health

## 一句话 Agent 核心
模型负责理解语言和选择动作,程序负责计算金额、校验和保存。
任何改变状态的操作都需要用户确认。

## 快速验证

```bash
npm ci
npm run verify
```

## 三分钟评测路径
1. 打开 `/?demo=1`,已载入合成示例数据,页面常驻「示例数据」标识
2. 点小狗 → 帮我看看要不要买 → 输入一个金额
   → 只读安心罐余额 → 三个中性动作
3. 首页回看卡 → 走完回看 → 出现候选金钱原则
4. 回到决策,看到「参考了 1 条你确认过的原则」

## MCP

- 端点:`https://bondpup.vercel.app/mcp`(Streamable HTTP;兼容 2026-07-28 与 2025-era 两代协议;无需鉴权与模型密钥)

### 工具(共 5 个)

| 工具 | 作用 |
|---|---|
| `create_money_session` | 创建会话,返回 `sessionId` 与初始 `moneyState`(可传 `displayName`) |
| `plan_jars` | 四罐分配:默认只预览;`confirm:true` 才写入 |
| `record_money_moment` | 说一笔想花的钱 → 返回带签名的 proposal(只预览,不写状态) |
| `confirm_action` | 用户确认后的写入:扣罐 / 撤销 / 只记录 / 完成回看 / 采纳原则 / 周期确认 / 挪结余 |
| `get_money_overview` | 总览:四罐、待回看、候选原则、周期回顾、结余历史 |

### 调用契约

- 服务端不持久化状态:每个响应回传完整 `moneyState`,下一次调用原样链回即可(`sessionId` 仅单实例缓存)
- 写操作一律要求 `expectedStateVersion` + `idempotencyKey`;版本不符拒绝,重放幂等
- `confirm_action` 只接受 `record_money_moment` 签发的 proposal,状态版本变过即过期,伪造签名会被拒绝
- 风险输入(自伤/借贷/投资/泛化情绪)返回安全回应而非罐子建议,审计事件不含用户原文

### 最小示例(复制即可运行)

```bash
curl -sS https://bondpup.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"probe","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

2026-07-28 代协议要求 `Mcp-Method` 头与 body 方法一致(`tools/call` 另加 `Mcp-Name: <工具名>`),缺失返回 -32020。

- 图形化:`npx @modelcontextprotocol/inspector@latest` → Streamable HTTP → 上述端点
- 端到端闭环(24 条断言:分配→扣罐→撤销→回看→原则→引用,含 structuredContent 结构化输出):`node scripts/smoke-mcp.mjs https://bondpup.vercel.app`

## 核心闭环
分罐子 → 做决定 → 回看结果 → 长出一条你确认过的原则 → 下次被引用

## 快速验证(开发调试)

```bash
npm ci
npm test                     # 单元测试
npm run dev                  # http://localhost:3000
bash scripts/verify-mcp.sh   # MCP 传输层验证(两代协议)
node scripts/smoke-mcp.mjs   # MCP 端到端闭环断言(决定→回看→原则→引用)
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

## 文档

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 分层、三条不变式、provider 降级、两道安全闸、状态模型
- [EVALUATION.md](docs/EVALUATION.md) —— 评测入口、生产实测性能数字、质量闸门
- [MCP.md](docs/MCP.md) —— 工具契约、会话模型、写操作与签名、双协议、错误码
- [PRIVACY.md](docs/PRIVACY.md) —— 数据只在本机、最小化模型调用、可导出可清空
- [USER_VALIDATION.md](docs/USER_VALIDATION.md) —— 核心假设与验证记录
- [LICENSE](LICENSE) —— 代码 MIT;美术素材版权保留

## 环境变量

见 [.env.example](.env.example),密钥只进部署平台环境变量。
