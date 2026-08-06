import type { Jar } from "@/contracts";
import { mockMoneyState } from "@/lib/mock/money-state";

function yuan(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const KIND_SUB: Record<string, string> = {
  living: "这个月必须承担的",
  comfort: "可以不愧疚地用在当下的",
  dream: "为哪件具体的事攒钱",
};

function JarCard({ jar }: { jar: Jar }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
      <div className="text-sm text-[#8a8577]">{KIND_SUB[jar.kind]}</div>
      <div className="mt-1 text-base font-medium text-[#4a4a44]">{jar.label}</div>
      <div className="mt-2 text-xl font-semibold text-[#4a4a44]">¥{yuan(jar.planned)}</div>
      {jar.goal ? (
        <div className="mt-1 text-xs text-[#8a8577]">
          还差 ¥{yuan(jar.goal.amount - jar.goal.saved)}
        </div>
      ) : (
        <div className="mt-1 text-xs text-[#8a8577]">已用 ¥{yuan(jar.actual)}</div>
      )}
    </div>
  );
}

export default function Home() {
  const state = mockMoneyState;
  return (
    <div className="flex flex-1 justify-center bg-[#faf6ef] font-sans">
      <main className="flex w-full max-w-md flex-col gap-5 px-5 py-8">
        {state.demo && (
          <div className="self-center rounded-full bg-[#e3c58a]/30 px-3 py-1 text-xs text-[#8a7440]">
            合成示例数据 · 正在与 AI 互动
          </div>
        )}

        {/* 第一视线:小狗 + 主动开场 */}
        <section className="flex flex-col items-center gap-3">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#f0e6d4] text-6xl">
            🐶
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-[#4a4a44] shadow-sm">
            今天想聊聊钱,还是就坐一会儿?
          </div>
        </section>

        {/* 第二视线:罐子状态(首屏只有三个;未来罐为 0 → 可点入口) */}
        <section className="grid grid-cols-2 gap-3">
          {state.jars.map((jar) => (
            <JarCard key={jar.id} jar={jar} />
          ))}
          <button className="rounded-2xl border-2 border-dashed border-[#d8cfba] p-4 text-left text-sm text-[#8a8577]">
            未来罐
            <span className="mt-1 block text-xs">暂时不准备花的,想放再放 →</span>
          </button>
        </section>

        {/* 第三视线:结余碎钻(为 0 不显示) */}
        {state.leftover.amount > 0 && (
          <section className="text-sm text-[#8a8577]">💎 还没安排的:¥{yuan(state.leftover.amount)}</section>
        )}

        {/* 第四视线:两个气泡 + 直接输入 */}
        <section className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button className="flex-1 rounded-full bg-[#e8927c]/15 px-4 py-2.5 text-sm text-[#b05e46]">
              帮我看看要不要买
            </button>
            <button className="flex-1 rounded-full bg-[#a8bca1]/20 px-4 py-2.5 text-sm text-[#5f7357]">
              有笔钱想说说
            </button>
          </div>
          <input
            className="w-full rounded-full border border-[#e5ddc9] bg-white px-4 py-2.5 text-sm text-[#4a4a44] placeholder:text-[#b3ac9a] focus:outline-none"
            placeholder="也可以直接打字…"
            disabled
          />
        </section>

        <footer className="mt-auto pt-6 text-center text-xs text-[#b3ac9a]">
          小狗慢慢 · 不替你决定,但会记住你如何做决定
        </footer>
      </main>
    </div>
  );
}
