import { Suspense } from 'react';
import ShopServer from '@/components/shop/ShopServer';
import ShopSkeleton from '@/components/shop/ShopSkeleton';
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

/** Tab 1 · 选购：公告条 + Apple 式大标题 + 板块卡片流 + 客服悬浮入口 */
export default function ShopPage() {
  return (
    <>
      <AnnouncementBar />

      <HomeHeader />

      <div className="h-4" aria-hidden />

      <Suspense fallback={<ShopSkeleton />}>
        <ShopServer />
      </Suspense>

      <ServiceButton />
    </>
  );
}
