'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchLibrary } from '@/lib/library-client';
import EmptyState from '@/components/ui/EmptyState';
import Message from '@/components/ui/Message';
import SectionHeader from '@/components/ui/SectionHeader';
import type { Subscription } from '@/lib/types';
import SubscriptionMegaCard from './SubscriptionMegaCard';
import SubscriptionCard from './SubscriptionCard';

interface SubscriptionsClientProps {
  subscriptions: Subscription[];
  isDemo: boolean;
}

/**
 * 订阅页主体（Brief §13.4 转化结构；UI 升级 §8.3）：
 * 价值叙述 → 主方案长条大卡（Premium Glass，「推荐」标签）
 * → 更多套餐（安静两列网格，白底，不用玻璃）。
 * 只有一个订阅时只显示主卡；空列表显示 Intentional Empty State。
 *
 * 「已拥有」状态（§6.9 当前方案）：登录用户额外查一次 /api/library，
 * 命中的方案在卡上打「已拥有」并把 CTA 换成「续费 / 延长」——
 * 只是展示层判断，不改动下单与权益逻辑。
 */
export default function SubscriptionsClient({
  subscriptions,
  isDemo,
}: SubscriptionsClientProps) {
  const { user, loading, getAuthHeaders } = useAuth();
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (loading || !user) {
      setOwnedIds(new Set());
      return;
    }
    let alive = true;
    void fetchLibrary(getAuthHeaders).then((data) => {
      if (!alive || !data) return;
      setOwnedIds(new Set(data.subscriptions.map((s) => s.entitlement.subscription_id ?? '')));
    });
    return () => {
      alive = false;
    };
  }, [loading, user, getAuthHeaders]);

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="暂无订阅方案"
        description="订阅方案上线后会第一时间展示在这里，敬请期待。"
      />
    );
  }

  const [primary, ...rest] = subscriptions;

  return (
    <div>
      <div className="px-page">
        <div className="mx-auto max-w-wide">
          {isDemo && (
            <Message tone="info" className="mb-5">
              当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实订阅方案
            </Message>
          )}

          <SubscriptionMegaCard
            subscription={primary}
            owned={ownedIds.has(primary.id)}
          />
        </div>
      </div>

      {rest.length > 0 && (
        // 更多套餐：Studio Mist 带 + 白色安静卡片（玻璃只留给主推方案）
        <section className="mt-10 bg-apple-bg py-9 sm:py-12">
          <div className="mx-auto max-w-wide px-page">
            <SectionHeader title="更多套餐" count={rest.length} />
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {rest.map((subscription) => (
                <SubscriptionCard
                  key={subscription.id}
                  subscription={subscription}
                  owned={ownedIds.has(subscription.id)}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
