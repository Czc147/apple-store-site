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

/** Hero 骨架：与 DailyPickHero 同构（白画廊 + 16:9 封面 + kicker/大标题/CTA） */
function HeroFallback() {
  return (
    <div className="px-page">
      <div className="mx-auto max-w-wide lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
        <div className="skeleton aspect-video w-full rounded-hero lg:order-2" />
        <div className="space-y-3 pt-5 lg:order-1 lg:pt-0">
          <div className="skeleton h-3.5 w-24 rounded-md" />
          <div className="skeleton h-8 w-3/4 rounded-md" />
          <div className="skeleton h-4 w-2/3 rounded-md" />
          <div className="skeleton h-11 w-52 rounded-btn" />
        </div>
      </div>
    </div>
  );
}

/**
 * Tab 1 · 选购（Brief §13.1 Content Discovery Surface；UI 升级 §8.1）：
 * 公告条 → 大标题 → 每日推荐 Hero（Gallery White 编辑焦点）→
 * 专辑合集流（Studio Mist 板块带）→ 客服悬浮入口。
 * 分层：首页画布为 Gallery White（纯白），板块带用 Studio Mist（#f5f5f7），
 * 层级只靠背景差异与圆角表达，不用投影。
 */
export default function ShopPage() {
  return (
    // Gallery White 画布：盖住 body 的雾灰底，让首页从白开始
    <div className="bg-apple-card pb-8">
      <AnnouncementBar />

      <HomeHeader />

      <Suspense fallback={<HeroFallback />}>
        <DailyPickServer />
      </Suspense>

      <div className="h-14" aria-hidden />

      <Suspense fallback={<ShopSkeleton />}>
        <ShopServer />
      </Suspense>

      <ServiceButton />
    </div>
  );
}
