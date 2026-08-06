import { createMcpHandler } from "mcp-handler";
import { registerBondPupTools } from "./tools";

/**
 * /mcp 端点处理器。
 * mcp-handler v2:原生伺服 MCP 2026-07-28(无 session、仅 POST、镜像头、server/discover),
 * 并对 2025-era Streamable HTTP 客户端自动 stateless 回退——同一端点两代通吃。
 */
export const mcpHandler = createMcpHandler(registerBondPupTools, {
  serverInfo: { name: "bondpup-mcp", version: "0.1.0" },
});
