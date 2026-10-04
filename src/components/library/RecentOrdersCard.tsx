'use client';

import { useCallback, useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/format';
import SectionHeader from '@/components/ui/SectionHeader';
import Surface from '@/components/ui/Surface';
import DataError from '@/components/ui/DataError';

interface AccountSummary {
  recent_orders: Array<{
    id: string;
    order_no: string;
    status: string;
    payable: number;
    created_at: string;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  paid: '已确认',
  canceled: '已取消',
};

export default function RecentOrdersCard({
  getAuthHeaders,
}: {
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [data, setData] = useState<AccountSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setData(null);
        setFailed(false);
        return;
      }
      const res = await fetch('/api/account', { headers });
      if (!res.ok) {
        setData(null);
        setFailed(true);
        return;
      }
      setData((await res.json()) as AccountSummary);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <section id="orders" className="mb-8">
        <SectionHeader title="订单" />
        <DataError message="加载订单失败" onRetry={() => void load()} size="inline" />
      </section>
    );
  }

  const orders = data?.recent_orders ?? [];
  if (orders.length === 0) return null;

  return (
    <section id="orders" className="mb-8">
      <SectionHeader title="订单" count={orders.length} />
      <Surface radius="card-lg" className="p-2">
        {orders.map((order, index) => (
          <div
            key={order.id}
            className={`flex items-center justify-between gap-3 px-2 py-3 ${
              index > 0 ? 'border-t border-apple-hairline' : ''
            } ${loading ? 'opacity-60' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apple-bg">
                <Receipt className="h-4 w-4 text-apple-text-2" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs text-apple-text-2">
                  {order.order_no}
                </span>
                <span className="block text-2xs text-apple-text-3">
                  {formatDateTime(order.created_at)} · {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </span>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatPrice(order.payable)}
            </span>
          </div>
        ))}
      </Surface>
    </section>
  );
}
