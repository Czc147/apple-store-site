/**
 * 加载骨架屏（shimmer 1.4s，见 globals.css）。
 * audit 修复结构失配：真实内容多为「板块标题 + 卡片流」，旧骨架永远两列网格，
 * 加载完成时布局跳变。现按 editorial 近似：板块一（大标题 + 横滑露 peek）+
 * 板块二（标题 + 两列网格）。
 */
/** 专辑卡骨架：与 AlbumStackCard 同构（4:5 封面 + 后层窄边 + 名称/副标） */
function SkelCard() {
  return (
    <div>
      <div className="relative">
        <div className="absolute inset-x-4 top-0 h-full translate-y-3 rounded-hero bg-apple-card" />
        <div className="absolute inset-x-2 top-0 h-full translate-y-1.5 rounded-hero bg-apple-card" />
        <div className="skeleton relative aspect-[4/5] w-full rounded-hero" />
      </div>
      <div className="mt-5 space-y-2 px-0.5">
        <div className="skeleton h-4 w-4/5 rounded-md" />
        <div className="skeleton h-3 w-2/5 rounded-md" />
      </div>
    </div>
  );
}

export default function ShopSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="商品加载中">
      {/* Studio Mist 板块带（与 HomeSectionBlock 同构） */}
      <div className="bg-apple-bg py-9 sm:py-12">
        <div className="mx-auto max-w-wide px-page">
          <div className="skeleton h-6 w-40 rounded-md" />
          <div className="skeleton mt-1.5 h-3.5 w-64 rounded-md" />
        </div>
        <div className="no-scrollbar mx-auto mt-4 flex max-w-wide gap-3 overflow-hidden px-page sm:gap-5">
          <div className="w-[78%] shrink-0 sm:w-[42%]">
            <SkelCard />
          </div>
          <div className="w-[78%] shrink-0 sm:w-[42%]">
            <SkelCard />
          </div>
        </div>
      </div>

      {/* 第二带：标题 + 两列网格 */}
      <div className="bg-apple-bg py-9 sm:py-12">
        <div className="mx-auto max-w-wide px-page">
          <div className="skeleton h-6 w-32 rounded-md" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5">
            <SkelCard />
            <SkelCard />
          </div>
        </div>
      </div>
    </div>
  );
}
