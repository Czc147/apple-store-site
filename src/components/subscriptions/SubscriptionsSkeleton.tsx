/** 订阅页骨架屏：主卡（premium 大卡占位）+ 两列常规卡占位，与真实布局同构避免跳变 */
export default function SubscriptionsSkeleton() {
  return (
    <div className="px-page" aria-busy="true" aria-live="polite" aria-label="订阅加载中">
      {/* 主套餐大卡占位 */}
      <div className="skeleton h-72 rounded-hero" />

      {/* 更多套餐网格占位 */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col rounded-card border border-apple-border bg-apple-card p-4 shadow-card"
          >
            <div className="skeleton h-6 w-14 rounded-full" />
            <div className="skeleton mt-3 h-4 w-3/4 rounded-md" />
            <div className="skeleton mt-3 h-7 w-20 rounded-md" />
            <div className="skeleton mt-4 h-3.5 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
