/** 活动页骨架屏：模拟大卡片布局（大图 + 三行文字） */
export default function ActivitiesSkeleton() {
  return (
    <div className="px-5" aria-busy="true" aria-live="polite" aria-label="活动加载中">
      <div className="space-y-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card"
          >
            <div className="skeleton aspect-video w-full" />
            <div className="space-y-2.5 p-5">
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-4/5 rounded-md" />
              <div className="skeleton h-4 w-2/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
