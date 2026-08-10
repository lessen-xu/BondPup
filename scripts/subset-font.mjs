import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
const charsPath = resolve(root, "chars.txt");
const textExtensions = new Set([".js", ".jsx", ".json", ".md", ".mdx", ".ts", ".tsx"]);

const required = new Set(
  "，。、；：！？“”‘’（）【】「」——…～·¥0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ",
);

function isHan(character) {
  const codePoint = character.codePointAt(0);
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff)
  );
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(path)));
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function gb2312LevelOne() {
  const decoder = new TextDecoder("gb18030", { fatal: true });
  const characters = new Set();
  for (let high = 0xb0; high <= 0xd7; high += 1) {
    for (let low = 0xa1; low <= 0xfe; low += 1) {
      const character = decoder.decode(Uint8Array.of(high, low));
      // The final five byte positions decode to private-use placeholders, not level-one Han characters.
      if (isHan(character)) characters.add(character);
    }
  }
  if (characters.size !== 3755) {
    throw new Error(`GB2312 一级字库应为 3755 字，实际得到 ${characters.size} 字`);
  }
  return characters;
}

const sourceFiles = (await collectSourceFiles(srcDir)).sort();
const sourceText = (await Promise.all(sourceFiles.map((path) => readFile(path, "utf8")))).join("\n");
const sourceCharacters = new Set([...sourceText].filter((character) => isHan(character)));
const allCharacters = new Set([...required, ...gb2312LevelOne(), ...sourceCharacters]);
const sortedCharacters = [...allCharacters].sort((left, right) => left.codePointAt(0) - right.codePointAt(0));

await writeFile(charsPath, `${sortedCharacters.join("")}\n`, "utf8");

console.log(`扫描文件：${sourceFiles.length}`);
console.log(`源码汉字：${sourceCharacters.size}`);
console.log("GB2312 一级字库：3755");
console.log(`chars.txt 收录字符：${sortedCharacters.length}`);
console.log(`chars.txt：${relative(root, charsPath)}`);
console.log("请执行：");
console.log(
  "pyftsubset raw-fonts/ZCOOLXiaoWei-Regular.ttf --output-file=public/fonts/manman-hand.woff2 --flavor=woff2 --text-file=chars.txt --layout-features='*' --notdef-glyph --notdef-outline",
);
