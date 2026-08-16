import WishlistPageClient from '@/components/wishlist/WishlistPageClient';

export const metadata = {
  title: '愿望单',
  description:
    '管理收藏的商品：调整数量、左滑删除、合计金额，一键跳转发卡平台完成支付。',
};

/** Tab 2 · 愿望单：收藏的商品 + 数量调整 + 结算跳转发卡平台 */
export default function WishlistPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          愿望单
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          收藏的商品都在这里，结算时跳转至发卡平台完成支付
        </p>
      </header>
      <WishlistPageClient />
    </>
  );
}
