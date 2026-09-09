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

/** Hero 骨架：与 DailyPickHero 同构（封面 + eyebrow + 标题 + CTA），避免加载跳变 */
function HeroFallback() {
  return (
    <div className="px-page">
      <div className="overflow-hidden rounded-hero border border-apple-border bg-apple-card shadow-card">
        <div className="skeleton aspect-[16/9] sm:aspect-[21/9]" />
        <div className="space-y-2.5 p-5 sm:p-6">
          <div className="skeleton h-3.5 w-24 rounded-md" />
          <div className="skeleton h-6 w-3/4 rounded-md" />
          <div className="skeleton h-11 w-full rounded-btn" />
        </div>
      </div>
    </div>
  );
}

/**
 * Tab 1 · 选购（Brief §13.1 Content Discovery Surface）：
 * 公告条 → 大标题 → 每日推荐 Hero（editorial 焦点）→ 板块卡片流 → 客服悬浮入口
 */
export default function ShopPage() {
  return (
    <>
      <AnnouncementBar />

      <HomeHeader />

      <Suspense fallback={<HeroFallback />}>
        <DailyPickServer />
      </Suspense>

      <div className="h-10" aria-hidden />

      <Suspense fallback={<ShopSkeleton />}>
        <ShopServer />
      </Suspense>

      <ServiceButton />
    </>
  );
}
