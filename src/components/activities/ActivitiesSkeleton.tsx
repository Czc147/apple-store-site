/** 活动页骨架屏：模拟两列卡片布局（shimmer 1.4s，见 globals.css） */
export default function ActivitiesSkeleton() {
  return (
    <div className="px-4 sm:px-5" aria-busy="true" aria-live="polite" aria-label="活动加载中">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
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
