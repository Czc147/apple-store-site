/**
 * 订阅页骨架屏：与真实布局同构（§9.5：骨架结构必须与最终结构一致，避免加载跳变）——
 * 主方案长条大卡（玻璃卡：标签行 / 方案名 / 大价格 / CTA / 权益行）
 * + Studio Mist 带里的更多套餐网格。
 */
export default function SubscriptionsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="订阅加载中">
      <div className="px-page">
        <div className="mx-auto max-w-wide">
          {/* 主方案大卡占位（与 SubscriptionMegaCard 同构：左列信息 + 右列权益） */}
          <div className="rounded-premium bg-apple-card p-6 shadow-card sm:p-8 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
            <div>
              <div className="skeleton h-6 w-24 rounded-full" />
              <div className="skeleton mt-3 h-8 w-2/3 rounded-md" />
              <div className="skeleton mt-4 h-10 w-40 rounded-md" />
              <div className="skeleton mt-5 h-11 w-full rounded-btn lg:w-52" />
              <div className="skeleton mt-3 h-3.5 w-4/5 rounded-md" />
            </div>
            <div className="mt-6 space-y-2.5 lg:mt-0">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="skeleton h-5 w-5 flex-none rounded-full" />
                  <div className="skeleton h-4 w-3/4 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 更多套餐带（Studio Mist，与真实板块同构） */}
      <div className="mt-10 bg-apple-bg py-9 sm:py-12">
        <div className="mx-auto max-w-wide px-page">
          <div className="skeleton h-6 w-32 rounded-md" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col rounded-card bg-apple-card p-4">
                <div className="skeleton h-6 w-14 rounded-full" />
                <div className="skeleton mt-3 h-4 w-3/4 rounded-md" />
                <div className="skeleton mt-3 h-7 w-20 rounded-md" />
                <div className="skeleton mt-4 h-3.5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
