import Badge from '@/components/ui/Badge';
import { formatDiscountRate } from '@/lib/format';
import { CARD_STYLE_LABEL, type Subscription } from '@/lib/types';

/**
 * 订阅卡片上的会员权益徽章（迁移 023）。
 *
 * 存在的意义是**购前可见**：折扣和会员卡配在后台，如果订阅页一个字都不提，
 * 用户只有买完进了「我的库」才知道自己得到了什么。主推大卡与普通卡共用本组件。
 *
 * 两项都没有时返回 null，不占版面。
 */
export default function VipBenefitBadges({
  subscription,
}: {
  subscription: Pick<
    Subscription,
    'card_style' | 'discount_percent' | 'discount_scope'
  >;
}) {
  const percent = Number(subscription.discount_percent);
  const hasDiscount =
    Number.isFinite(percent) &&
    percent > 0 &&
    percent < 100 &&
    (subscription.discount_scope?.length ?? 0) > 0;
  const cardStyle = subscription.card_style;

  if (!hasDiscount && !cardStyle) return null;

  return (
    <>
      {cardStyle && (
        <Badge tone="neutral">{CARD_STYLE_LABEL[cardStyle]}会员</Badge>
      )}
      {hasDiscount && (
        <Badge tone="success">会员价 {formatDiscountRate(percent)}</Badge>
      )}
    </>
  );
}
