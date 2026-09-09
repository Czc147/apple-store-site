import PageHeader from '@/components/ui/PageHeader';
import WishlistPageClient from '@/components/wishlist/WishlistPageClient';

export const metadata = {
  title: '愿望单',
  description:
    '管理收藏的商品：调整数量、左滑删除、合计金额，一键推送订单完成支付。',
};

/**
 * Tab 2 · 愿望单：收藏的商品 + 数量调整 + 结算推送订单。
 * 文案修正：原「结算时跳转至发卡平台完成支付」是酷发卡时代残留——
 * 现为本站订单闭环（收款码 + 推送订单），不再外跳。
 */
export default function WishlistPage() {
  return (
    <>
      <PageHeader
        title="愿望单"
        subtitle="收藏的商品都在这里，确认清单后推送订单即可完成支付"
      />
      <WishlistPageClient />
    </>
  );
}
