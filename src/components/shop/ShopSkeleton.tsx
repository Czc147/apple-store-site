/** 加载骨架屏：模拟大单元卡片布局（shimmer 1.4s，见 globals.css） */
export default function ShopSkeleton() {
  return (
    <div className="px-5" aria-busy="true" aria-live="polite" aria-label="商品加载中">
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card"
          >
            <div className="skeleton aspect-video w-full" />
            <div className="space-y-2.5 p-5">
              <div className="skeleton h-5 w-2/5 rounded-md" />
              <div className="skeleton h-4 w-1/4 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
