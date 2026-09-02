/** 订阅页骨架屏：模拟两列套餐卡片布局（徽章 + 名称 + 价格） */
export default function SubscriptionsSkeleton() {
  return (
    <div className="px-4 sm:px-5" aria-busy="true" aria-live="polite" aria-label="订阅加载中">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
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
