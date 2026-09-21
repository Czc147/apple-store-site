'use client';

import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Message from '@/components/ui/Message';
import GlassSurface from '@/components/ui/GlassSurface';
import ExternalLinkAction from '@/components/ui/ExternalLinkAction';
import SubscriptionPurchaseSheet from './SubscriptionPurchaseSheet';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';

/**
 * 订阅长条大卡（UI 升级 §6 SubscriptionMegaCard）：
 * 移动端纵向（标签 → 方案名 → 大价格+周期 → 权益 → 主按钮 → 条款）；
 * 平板/桌面分栏（左：方案名/价格/周期/CTA，右：权益矩阵 + 说明）。
 *
 * 视觉：主推方案用 Premium Glass（彩色底斑 + 玻璃层）+ 顶部「推荐」小标签；
 * 价格是第一层级（editorial-title），周期与换算价弱化。
 *
 * 数据降级（§1.4 / §15.6：缺字段不新增后端）：
 * - 权益矩阵：把 description 按行拆分，每行一条权益（后台写成多行即得矩阵）；
 *   单段介绍则整段作为说明展示 —— 不伪造权益条目。
 * - 服务图标区：现有数据无软件/服务列表，整区省略，不占位。
 * - 月付/年付切换：每个订阅本身就是一个方案（sort_order 决定顺序），
 *   页面用方案列表承担切换语义，不另造分段控件。
 *
 * 业务行为不变：CTA 打开 SubscriptionPurchaseSheet（收款码 + 推送订单闭环）。
 */
export default function SubscriptionMegaCard({
  subscription,
  owned = false,
}: {
  subscription: Subscription;
  /** 该账号已拥有此订阅（客户端查 /api/library 得出）：CTA 变「续费」并提示 */
  owned?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pushedOrder, setPushedOrder] = useState<string | null>(null);
  const { name, price, duration, description, link_url, type } = subscription;

  // 权益短句：介绍按行拆分（去掉空行与明显过长的段落行）
  const lines = (description ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const benefitLines = lines.length > 1 ? lines.slice(0, 6) : [];
  const paragraph = benefitLines.length > 0 ? null : lines.join(' ');

  const cta = owned ? '续费 / 延长' : '立即订阅';

  return (
    <section aria-label={`主推套餐：${name}`}>
      <GlassSurface tint="prism" radius="premium">
        <div className="p-6 sm:p-8 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
          {/* ---------- 左列：标签 / 方案名 / 价格 / CTA ---------- */}
          <div className="lg:flex lg:flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">
                <Sparkles className="h-3 w-3" aria-hidden />
                推荐
              </Badge>
              {duration && <Badge tone="neutral">{duration}</Badge>}
              {type === 'daily_plan' && <Badge tone="neutral">每日更新</Badge>}
              {owned && <Badge tone="success">已拥有</Badge>}
            </div>

            <h2 className="mt-3 text-2xl font-semibold leading-tight text-apple-text">
              {name}
            </h2>

            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-editorial-title font-semibold leading-none tabular-nums text-apple-text sm:text-editorial-display">
                {formatPrice(price)}
              </span>
              {duration && (
                <span className="text-base text-apple-text-2">/ {duration}</span>
              )}
            </p>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5 lg:mt-6 lg:w-auto lg:self-start lg:px-10"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
            >
              {cta}
            </Button>

            <p className="mt-3 text-xs leading-relaxed text-apple-text-2">
              确认收款后自动解锁，可在「我的库」随时查看；支持微信 / 支付宝。
            </p>

            {link_url && (
              <div className="mt-3 lg:mt-2">
                <ExternalLinkAction href={link_url}>了解更多</ExternalLinkAction>
              </div>
            )}
          </div>

          {/* ---------- 右列：权益矩阵 / 说明 ---------- */}
          <div className="mt-6 lg:mt-0">
            {benefitLines.length > 0 ? (
              <ul className="space-y-2.5">
                {benefitLines.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 8)}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/70">
                      <Check className="h-3 w-3 text-apple-text" strokeWidth={2.6} aria-hidden />
                    </span>
                    <span className="text-md leading-relaxed text-apple-text">{line}</span>
                  </li>
                ))}
              </ul>
            ) : paragraph ? (
              <p className="whitespace-pre-line text-md leading-relaxed text-apple-text-2">
                {paragraph}
              </p>
            ) : (
              <p className="text-md leading-relaxed text-apple-text-2">
                订阅后即可解锁对应内容，随时在「我的库」查看。
              </p>
            )}
          </div>
        </div>

        {/* 推送成功提示 */}
        {pushedOrder && (
          <div className="px-6 pb-6 sm:px-8 sm:pb-8">
            <Message tone="success" title="订阅已成功推送">
              订单号 {pushedOrder}。我们确认收款后会自动解锁订阅，您可在「我的库」查看。
            </Message>
          </div>
        )}
      </GlassSurface>

      <SubscriptionPurchaseSheet
        subscription={subscription}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPushed={(orderNo) => {
          setSheetOpen(false);
          setPushedOrder(orderNo);
        }}
      />
    </section>
  );
}
