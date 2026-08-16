/** 订阅页骨架屏：模拟套餐卡片布局（徽章 + 名称 + 价格 + 按钮） */
export default function SubscriptionsSkeleton() {
  return (
    <div className="px-5" aria-busy="true" aria-live="polite" aria-label="订阅加载中">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col rounded-card border border-apple-border bg-apple-card p-5 shadow-card"
          >
            <div className="skeleton h-6 w-14 rounded-full" />
            <div className="skeleton mt-4 h-5 w-2/3 rounded-md" />
            <div className="skeleton mt-3 h-8 w-28 rounded-md" />
            <div className="min-h-6 flex-1" />
            <div className="skeleton mt-6 h-11 w-full rounded-btn" />
          </div>
        ))}
      </div>
    </div>
  );
}
