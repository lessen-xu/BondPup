#!/usr/bin/env node
/**
 * 用户可见文案禁词扫描(进 CI):模型输出有 validateReplyText 闸,写死的 UI 文案从来没人管——
 * 曾在剧本文件里漏过「应该」。只扫 UI 文案所在目录(components/app/mock/config)、
 * 只看去掉注释后的内容(注释和开发者错误信息不是慢慢对用户说的话)。
 *
 * 豁免:__tests__;行尾 `// copy-ok`(确认过对用户不可见,或语境合规)。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");

const words = readFileSync(join(SRC, "server/safety/forbidden-words.ts"), "utf8")
  .match(/"([^"]+)"/g)
  .map((w) => w.slice(1, -1));

const COPY_DIRS = ["components", "app", "mock", "config"].map((d) => join(SRC, d));

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
    // 去块注释后逐行;行内再去 // 注释(粗糙但对文案文件足够,误杀有 copy-ok 兜底)
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
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
