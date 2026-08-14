#!/usr/bin/env node
/**
 * 用户可见文案禁词扫描(进 CI):模型输出有 validateReplyText 闸,写死的 UI 文案从来没人管——
 * 曾在剧本文件里漏过「应该」。只看去掉注释后的内容(注释不是慢慢对用户说的话)。
 *
 * 扫描范围含 lib/server:服务端抛的 DomainError message 会经 /api/agent 响应体与
 * MCP 透给用户,曾漏过「这次先不提炼原则,证据还不够」(含禁用词「不够」)——
 * 模型闸和文案闸当时双双够不着它。
 *
 * 豁免:__tests__;行尾 `// copy-ok`(确认过对用户不可见,或语境合规);
 * 以及 EXEMPT_FILES——按定义必须原样包含这些词的两个文件,逐行加 copy-ok 只是噪音。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");

const words = readFileSync(join(SRC, "server/safety/forbidden-words.ts"), "utf8")
  .match(/"([^"]+)"/g)
  .map((w) => w.slice(1, -1));

const COPY_DIRS = ["components", "app", "mock", "config", "lib", "server"].map((d) => join(SRC, d));

/**
 * 按定义必须原样包含禁用词的文件:
 * - forbidden-words.ts 就是这张词表本身
 * - prompts.ts 的「永远不说:…」是给模型的反面指令,把词删掉等于把闸拆了
 * 这两个文件里的命中 100% 是自指,不是对用户说的话。
 */
const EXEMPT_FILES = ["server/safety/forbidden-words.ts", "server/agent/prompts.ts"];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

let hits = 0;
for (const dir of COPY_DIRS) {
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file);
    if (rel.includes("__tests__")) continue;
    const posix = rel.split(sep).join("/");
    if (EXEMPT_FILES.some((f) => posix.endsWith(f))) continue;
    // 去块注释后逐行;行内再去 // 注释(粗糙但对文案文件足够,误杀有 copy-ok 兜底)。
    // 块注释要换成等量换行:直接删会把后续行号整体前移,报出来的位置对不上原文件
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) =>
      m.replace(/[^\n]/g, "")
    );
    source.split("\n").forEach((line, i) => {
      if (line.includes("copy-ok")) return;
      const code = line.replace(/\/\/.*$/, "");
      for (const w of words) {
        if (code.includes(w)) {
          console.error(`${rel}:${i + 1}: 禁用词「${w}」`);
          hits++;
        }
      }
    });
  }
}

if (hits > 0) {
  console.error(`\n共 ${hits} 处。改写文案,或确认对用户不可见后行尾加 // copy-ok`);
  process.exit(1);
}
console.log(`文案扫描通过(${words.length} 个禁用词,0 命中)`);
