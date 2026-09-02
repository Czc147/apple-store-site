import RedeemClient from '@/components/redeem/RedeemClient';

export const metadata = {
  title: '兑换',
  description: '输入付款后收到的卡密，即可兑换对应商品内容。',
};

// 兑换实时读写卡密状态，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** Tab 5 · 兑换：输入卡密 → 核销并展示商品后台配置的兑换商品（图片 / 视频 / 文档） */
export default function RedeemPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          兑换
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          输入付款后收到的卡密，即可查看兑换内容
        </p>
      </header>

      <RedeemClient />
    </>
  );
}
