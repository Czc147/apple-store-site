import { Suspense } from 'react';
import ShopServer from '@/components/shop/ShopServer';
import ShopSkeleton from '@/components/shop/ShopSkeleton';
import ServiceButton from '@/components/shop/ServiceButton';

export const metadata = {
  title: '选购',
  description:
    '浏览精选商品分组，轻点卡片展开详细选项，收藏心仪商品到愿望单一键结算。',
};

// 商品数据实时读取，禁止构建时静态化（Netlify 上每次请求即时渲染）
export const dynamic = 'force-dynamic';

/** Tab 1 · 选购：Apple 式大标题 + 大单元卡片流 + 客服悬浮入口 */
export default function ShopPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          选购
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          轻点卡片展开选项，看到心仪的小单元就点亮爱心收藏
        </p>
      </header>

      <Suspense fallback={<ShopSkeleton />}>
        <ShopServer />
      </Suspense>

      <ServiceButton />
    </>
  );
}
