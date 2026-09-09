/**
 * 加载骨架屏（shimmer 1.4s，见 globals.css）。
 * audit 修复结构失配：真实内容多为「板块标题 + 卡片流」，旧骨架永远两列网格，
 * 加载完成时布局跳变。现按 editorial 近似：板块一（大标题 + 横滑露 peek）+
 * 板块二（标题 + 两列网格）。
 */
function SkelCard() {
  return (
    <div className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card">
      <div className="skeleton aspect-square w-full" />
      <div className="space-y-2 p-3.5">
        <div className="skeleton h-4 w-4/5 rounded-md" />
        <div className="skeleton h-3 w-2/5 rounded-md" />
      </div>
    </div>
  );
}

export default function ShopSkeleton() {
  return (
    <div className="px-page" aria-busy="true" aria-live="polite" aria-label="商品加载中">
      {/* 板块一：大标题 + 副标 + 横滑卡片（露出下一张的 peek） */}
      <div className="skeleton h-6 w-40 rounded-md" />
      <div className="skeleton mt-1.5 h-3.5 w-64 rounded-md" />
      <div className="mt-3 flex gap-3 overflow-hidden">
        <div className="w-[78%] shrink-0 sm:w-[42%]">
          <SkelCard />
        </div>
        <div className="w-[78%] shrink-0 sm:w-[42%]">
          <SkelCard />
        </div>
      </div>

      {/* 板块二：标题 + 两列网格 */}
      <div className="mt-10">
        <div className="skeleton h-6 w-32 rounded-md" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
          <SkelCard />
          <SkelCard />
        </div>
      </div>
    </div>
  );
}
