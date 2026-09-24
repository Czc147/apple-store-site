import Badge from '@/components/ui/Badge';
import { formatDiscountRate } from '@/lib/format';
import {
  CARD_STYLE_LABEL,
  DISCOUNT_SCOPE,
  DISCOUNT_SCOPE_LABEL,
  type Subscription,
} from '@/lib/types';

/**
 * 订阅卡片上的会员权益徽章（迁移 023）。
 *
 * 存在的意义是**购前可见**：折扣和会员卡配在后台，如果订阅页一个字都不提，
 * 用户只有买完进了「我的库」才知道自己得到了什么。主推大卡与普通卡共用本组件。
 *
 * ⚠️ 徽章**必须写明适用范围**（2026-09-24 补）。后台的「折扣范围」是两个复选框
 * （选购页商品 / 订阅套餐），服务端按 `scope.includes(订单范围)` 判定是否生效。
 * 只勾了「选购页商品」时，用户在订阅页照样看到「会员价 8 折」，去买订阅却**静默 0 折扣**
 * —— 这正是用户报的「银卡金卡黑金那个板块的优惠有问题」。不写范围就是在骗人。
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
  const scope = subscription.discount_scope ?? [];
  const hasDiscount =
    Number.isFinite(percent) &&
    percent > 0 &&
    percent < 100 &&
    scope.length > 0;
  const cardStyle = subscription.card_style;

  if (!hasDiscount && !cardStyle) return null;

  // 两个范围都勾了 = 全场通用；只勾一个就照实说
  const scopeText =
    scope.length >= 2
      ? '全场'
      : scope[0] === DISCOUNT_SCOPE.SUBSCRIPTION
        ? DISCOUNT_SCOPE_LABEL.subscription
        : DISCOUNT_SCOPE_LABEL.unit;

  return (
    <>
      {cardStyle && (
        <Badge tone="neutral">{CARD_STYLE_LABEL[cardStyle]}会员</Badge>
      )}
      {hasDiscount && (
        <Badge tone="success">
          会员价 {formatDiscountRate(percent)} · {scopeText}
        </Badge>
      )}
    </>
  );
}
