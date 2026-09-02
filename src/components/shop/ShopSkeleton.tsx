/** 加载骨架屏：模拟两列大单元卡片布局（shimmer 1.4s，见 globals.css） */
export default function ShopSkeleton() {
  return (
    <div className="px-4 sm:px-5" aria-busy="true" aria-live="polite" aria-label="商品加载中">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card"
          >
            <div className="skeleton aspect-square w-full" />
            <div className="space-y-2 p-3.5">
              <div className="skeleton h-4 w-4/5 rounded-md" />
              <div className="skeleton h-3 w-2/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
