/** 活动页骨架屏：与真实布局同构（移动单列大卡 / sm 两列），shimmer 1.4s */
export default function ActivitiesSkeleton() {
  return (
    <div className="px-page" aria-busy="true" aria-live="polite" aria-label="活动加载中">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card"
          >
            <div className="skeleton aspect-[4/3] w-full" />
            <div className="space-y-2 p-3.5">
              <div className="skeleton h-3.5 w-full rounded-md" />
              <div className="skeleton h-3.5 w-3/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
