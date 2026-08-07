# 给 AI 助手的常驻规则

## 工具链
- 本项目用 npm,不用 pnpm。仓库里只有 package-lock.json
- 装依赖用 npm ci,起服务用 npm run dev,构建用 npm run build
- 不要生成 pnpm-lock.yaml,如果出现要删掉
- 验证必须包含 build,不能只跑 lint 和 tsc

## 省 token
- 只读明确提到的文件，不要扫整个项目
- 回复只说改了哪个文件哪一处，不贴大段代码
- 一次只做一件事，做完停下等确认
- 不要复述我的需求，直接动手

## 已冻结不可违反
- 生活罐没有水位线，就是一个数字
- 决策只读安心罐，生活罐永不计入「可以买」
- 四个罐子始终显示名称和金额，为 0 时显示「0 元」，不隐藏文字
- 决策是三个中性动作，不问「值不值」
- 三个动作样式完全一致，不预选不推荐
- 余数在计算时落在安心罐，不落未来罐（避免预设「存钱=好」）
- 四罐方案只是候选，用户改过并确认才写库
- 未来罐永不自动接收任何钱，只能用户主动填
- 周期内改动永不自动级联
- 金额全部走后端确定性函数，前端不算
- 所有写状态操作都是确认后才写
- 不出现进度条、百分比、完成度、红色、警告图标
- 不在渲染时调 Date.now / Math.random
- 禁用词：超支 不够 应该 必须 建议你 加油 你真棒 月光族

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
