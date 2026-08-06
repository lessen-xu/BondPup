#!/usr/bin/env bash
# MCP 两代协议验证(Git Bash 运行): bash scripts/verify-mcp.sh [base_url]
# 出口条件:① 与 ③ 都返回工具清单/合法响应,② 返回四罐分配。
# 请求体一律走 stdin(--data-binary @-):Windows 下命令行参数里的中文会被 argv 编码转换弄坏。
set -euo pipefail
BASE="${1:-http://localhost:3000}"
MCP="$BASE/mcp"
META='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"verify-script","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}'

echo "== ① 2026-07-28 代 tools/list =="
curl -sS "$MCP" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  --data-binary @- <<EOF
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{$META}}
EOF
echo; echo

echo "== ② 2026-07-28 代 tools/call plan_jars(工资 6500 元示例)=="
curl -sS "$MCP" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Mcp-Name: plan_jars" \
  --data-binary @- <<EOF
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"plan_jars","arguments":{"disposable":650000,"livingPlanned":220000,"dreamGoal":{"name":"去看海","amount":960000,"saved":0,"monthsRemaining":12}},$META}}
EOF
echo; echo

echo "== ③ 2025-era 回退:initialize =="
curl -sS "$MCP" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data-binary @- <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify-script","version":"0"}}}
EOF
echo; echo

echo "== ④ /health =="
curl -sS "$BASE/health"
echo
