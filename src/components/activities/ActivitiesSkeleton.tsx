/**
 * 活动页骨架屏：与真实布局同构（UI 升级 §9.5），避免加载完成跳变——
 * 主推大卡（封面 + 信息列，lg 起左右分栏）+ 「更多活动」安静白卡行。
 * shimmer 1.4s 循环。
 */
export default function ActivitiesSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="活动加载中">
      <div className="px-page">
        <div className="mx-auto max-w-wide">
          {/* 主推卡 */}
          <div className="overflow-hidden rounded-premium border border-apple-border bg-apple-card p-5 shadow-card sm:p-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-9 lg:p-8">
            <div className="skeleton aspect-[4/3] w-full rounded-hero" />
            <div className="mt-5 lg:mt-0">
              <div className="skeleton h-5 w-24 rounded-full" />
              <div className="skeleton mt-3 h-7 w-4/5 rounded-input" />
              <div className="skeleton mt-3 h-4 w-1/3 rounded-full" />
              <div className="skeleton mt-3 h-4 w-full rounded-full" />
              <div className="skeleton mt-2 h-4 w-2/3 rounded-full" />
              <div className="skeleton mt-5 h-11 w-full rounded-btn sm:w-44" />
            </div>
          </div>
        </div>
      </div>

      {/* 更多活动 */}
      <div className="mt-8 px-page sm:mt-10">
        <div className="mx-auto max-w-wide">
          <div className="skeleton mb-3 h-5 w-28 rounded-full" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-start gap-3.5 rounded-card-lg border border-apple-border bg-apple-card p-3 shadow-card"
              >
                <div className="skeleton h-24 w-24 shrink-0 rounded-card sm:h-28 sm:w-28" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-4 w-4/5 rounded-full" />
                  <div className="skeleton h-3.5 w-full rounded-full" />
                  <div className="skeleton h-3 w-2/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
