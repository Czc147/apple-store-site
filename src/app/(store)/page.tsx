import { Suspense } from 'react';
import ShopServer from '@/components/shop/ShopServer';
import ShopSkeleton from '@/components/shop/ShopSkeleton';
import DailyPickServer from '@/components/shop/DailyPickServer';
import ServiceButton from '@/components/shop/ServiceButton';
import HomeHeader from '@/components/shop/HomeHeader';
import AnnouncementBar from '@/components/shop/AnnouncementBar';
import { getAppSettings } from '@/lib/app-settings';

export async function generateMetadata() {
  const settings = await getAppSettings();
  return {
    title: settings.site_title?.trim() || '选购',
    description:
      '浏览精选商品分组，轻点卡片展开详细选项，收藏心仪商品到愿望单一键结算。',
  };
}

// 商品数据实时读取，禁止构建时静态化（Netlify 上每次请求即时渲染）
export const dynamic = 'force-dynamic';

/** 每日推荐区块的服务端取数骨架（客户端还会再校验解锁态） */
function DailyPickFallback() {
  return (
    <div className="px-4 sm:px-5">
      <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
        <div className="skeleton aspect-[16/9] sm:aspect-[21/9]" />
        <div className="space-y-2 p-4 sm:p-5">
          <div className="skeleton h-4 w-1/3 rounded-md" />
          <div className="skeleton h-5 w-2/3 rounded-md" />
          <div className="skeleton h-10 w-full rounded-btn" />
        </div>
      </div>
    </div>
  );
}

/** Tab 1 · 选购：公告条 + Apple 式大标题 + 每日推荐区块 + 板块卡片流 + 客服悬浮入口 */
export default function ShopPage() {
  return (
    <>
      <AnnouncementBar />

      <HomeHeader />

      <Suspense fallback={<DailyPickFallback />}>
        <DailyPickServer />
      </Suspense>

      <div className="h-4" aria-hidden />

      <Suspense fallback={<ShopSkeleton />}>
        <ShopServer />
      </Suspense>

      <ServiceButton />
    </>
  );
}
