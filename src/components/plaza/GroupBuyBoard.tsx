'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Loader2,
  Plus,
  ShoppingBasket,
  UserMinus,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CoverImage from '@/components/ui/CoverImage';
import DataError from '@/components/ui/DataError';
import EmptyState from '@/components/ui/EmptyState';
import RegisterBanner from '@/components/ui/RegisterBanner';
import {
  GROUP_BUY_STATUS_LABEL,
  createGroupBuy,
  fetchGroupBuys,
  joinGroupBuy,
  leaveGroupBuy,
  pushGroupBuyOrder,
  type GroupBuy,
} from '@/lib/group-buy';
import { fetchPickableSubUnits } from '@/lib/share';
import MajorSubPicker from './MajorSubPicker';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';

/** 发起时可选的成团人数 */
const COUNT_OPTIONS = [2, 3, 4, 5, 6, 8, 10];

/**
 * 一起买（拼单）。
 *
 * 用户描述的玩法：选 4 个人结算，满 4 人后每人只付四分之一；
 * 等每个人都推送订单后即可付款。到期没满自动关闭（用户拍板）。
 *
 * 分摊价由**服务端现算**（原价 ÷ 人数），这里只负责显示 ——
 * 客户端算出来的价格永远只是展示，下单时以后端为准。
 */
export default function GroupBuyBoard() {
  const { user, loading, getAuthHeaders } = useAuth();
  const [items, setItems] = useState<GroupBuy[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchGroupBuys(getAuthHeaders);
    if (list === null) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems(list);
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setItems(null);
      return;
    }
    void load();
  }, [loading, user?.id, load]);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3000);
    return () => window.clearTimeout(t);
  }, [msg]);

  /**
   * 滚到 hash 指向的那条拼单并闪一下高亮（个人主页的拼单卡点进来用）。
   *
   * 与交流板块的 `#post-<id>` 同一套机制，两处都是自己做的，原因也一样：
   * 卡片是**取数之后**才渲染的，浏览器自带的 hash 定位在加载那一刻就执行了、
   * 元素还不存在，直接扑空；而广场内部再点一次只变 hash 属同文档导航、
   * 整页不重载，所以还要挂 hashchange（切板块那步在 PlazaClient 里）。
   *
   * 高亮的结束帧写 **#FFFFFF 而不是 transparent**：卡片自身是白底，
   * 淡到 transparent 会在动画结束的一瞬间露出页面灰底、像闪了一下。
   */
  const scrollToHash = useCallback(() => {
    const m = window.location.hash.match(/^#group-(.+)$/);
    if (!m) return;
    const el = document.getElementById(`group-${m[1]}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate(
      [
        { backgroundColor: 'rgba(0, 113, 227, 0.12)' },
        { backgroundColor: '#FFFFFF' },
      ],
      { duration: 1800, easing: 'ease-out' },
    );
  }, []);

  useEffect(() => {
    if (!items || items.length === 0) return;
    scrollToHash();
  }, [items, scrollToHash]);

  useEffect(() => {
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, [scrollToHash]);

  const act = async (
    id: string,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) => {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    await load();
  };

  const handlePush = async (gb: GroupBuy) => {
    setBusyId(gb.id);
    const res = await pushGroupBuyOrder(
      getAuthHeaders,
      gb.id,
      gb.product.id,
      // 走已有收款方式：微信扫码（与愿望单结算一致）
      'wechat',
    );
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(`已推送订单 ${res.data.order_no}，实付 ${formatPrice(res.data.payable)}`);
    await load();
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-apple-text-3">加载中…</p>;
  }
  if (!user) return <RegisterBanner className="mx-auto max-w-wide" />;
  if (failed && items === null) {
    return (
      <DataError
        message="拼单列表加载失败，请检查网络后重试"
        onRetry={() => void load()}
        size="inline"
      />
    );
  }

  return (
    <div className="mx-auto max-w-wide space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-apple-text-3">
          满员后每人按分摊价推单，到期没满自动关闭
        </p>
        <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          发起拼单
        </Button>
      </div>

      {msg && (
        <p
          className="rounded-card bg-apple-blue-soft px-3.5 py-2.5 text-sm text-apple-text"
          role="status"
        >
          {msg}
        </p>
      )}

      {items === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="拼单加载中">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-32 w-full rounded-card-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="还没有拼单"
          description="选一个小单元、定个成团人数，发起来等人一起买。"
          size="inline"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((gb) => (
            <GroupBuyCard
              key={gb.id}
              gb={gb}
              busy={busyId === gb.id}
              onJoin={() => void act(gb.id, () => joinGroupBuy(getAuthHeaders, gb.id))}
              onLeave={() => void act(gb.id, () => leaveGroupBuy(getAuthHeaders, gb.id))}
              onPush={() => void handlePush(gb)}
            />
          ))}
        </ul>
      )}

      <CreateSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        getAuthHeaders={getAuthHeaders}
        onCreated={() => {
          setFormOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function GroupBuyCard({
  gb,
  busy,
  onJoin,
  onLeave,
  onPush,
}: {
  gb: GroupBuy;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onPush: () => void;
}) {
  const remaining = Math.max(0, gb.target_count - gb.member_count);
  const saved = Math.max(0, gb.unit_price - gb.per_price);
  const pushedCount = gb.members.filter((m) => m.pushed).length;
  const myPushed = gb.members.find((m) => m.is_me)?.pushed ?? false;

  return (
    // id 供「跳转到这条拼单」用（个人主页的拼单卡 → /community/plaza#group-<id>）
    <li id={`group-${gb.id}`} className="rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card">
      <div className="flex gap-3">
        {gb.product.cover_url && (
          <div className="w-16 flex-none">
            <CoverImage
              src={gb.product.cover_url}
              alt={gb.product.name}
              ratio="album"
              sizes="64px"
              className="rounded-input"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={gb.status === 'full' ? 'success' : 'blue'} size="sm">
              {GROUP_BUY_STATUS_LABEL[gb.status]}
            </Badge>
            {gb.is_initiator && (
              <Badge tone="neutral" size="sm">
                我发起的
              </Badge>
            )}
            {gb.status === 'open' && (
              <span className="inline-flex items-center gap-1 text-2xs text-apple-text-3">
                <Clock className="h-3 w-3" aria-hidden />
                {expiryText(gb.expires_at)}
              </span>
            )}
          </div>

          <p className="mt-1.5 truncate text-md font-medium text-apple-text">
            {gb.product.name}
          </p>

          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-apple-text">
              每人 {formatPrice(gb.per_price)}
            </span>
            <span className="text-xs text-apple-text-3 line-through">
              原价 {formatPrice(gb.unit_price)}
            </span>
            {saved > 0 && (
              <span className="text-xs text-apple-success">
                省 {formatPrice(saved)}
              </span>
            )}
          </p>

          {/* 进度：已加入 / 目标人数 */}
          <div className="mt-2">
            <div className="flex items-center gap-1.5 text-xs text-apple-text-2">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {gb.member_count}/{gb.target_count}
              {remaining > 0 && <span className="text-apple-text-3">· 还差 {remaining} 人</span>}
              {gb.status === 'full' && (
                <span className="text-apple-success">
                  · 已推单 {pushedCount}/{gb.member_count}
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-apple-bg">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-slow ease-apple',
                  gb.status === 'full' ? 'bg-apple-success' : 'bg-apple-blue',
                )}
                style={{
                  width: `${Math.min(100, (gb.member_count / gb.target_count) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* 操作 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {!gb.is_member && gb.status === 'open' && (
              <Button variant="primary" size="sm" onClick={onJoin} disabled={busy}>
                加入拼单
              </Button>
            )}

            {gb.is_member && gb.status === 'full' && !myPushed && (
              <Button variant="primary" size="sm" onClick={onPush} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                )}
                按 {formatPrice(gb.per_price)} 推送订单
              </Button>
            )}

            {gb.is_member && gb.status === 'full' && myPushed && (
              <span className="inline-flex items-center gap-1 text-xs text-apple-success">
                <Check className="h-3.5 w-3.5" aria-hidden />
                你已推送订单，等其他成员推完即可付款
              </span>
            )}

            {gb.is_member && gb.status !== 'full' && (
              <button
                type="button"
                onClick={onLeave}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-btn px-2.5 py-1.5 text-xs text-apple-text-3 transition-colors duration-fast hover:text-apple-danger disabled:opacity-40"
              >
                <UserMinus className="h-3.5 w-3.5" aria-hidden />
                {gb.is_initiator ? '关闭拼单' : '退出'}
              </button>
            )}
          </div>

          <p className="mt-2 text-2xs text-apple-text-3">
            {gb.initiator_name} 发起 · 成员：
            {gb.members.map((m) => m.name + (m.pushed ? '✓' : '')).join('、') || '—'}
          </p>
        </div>
      </div>
    </li>
  );
}

/** 剩余时间：紧急（<1h）用红色，其余灰色 */
function expiryText(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return '已到期';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `剩 ${Math.floor(h / 24)} 天`;
  if (h >= 1) return `剩 ${h} 小时`;
  return `剩 ${Math.max(1, Math.floor(ms / 60000))} 分钟`;
}

/** 发起拼单 */
function CreateSheet({
  open,
  onClose,
  getAuthHeaders,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onCreated: () => void;
}) {
  /** 两级选择：先大单元，再小单元（用户需求 #9） */
  const [majorId, setMajorId] = useState('');
  const [subId, setSubId] = useState('');
  /** 选中项的价格——分摊价提示要用；两级选择器只回传 id */
  const [pickedPrice, setPickedPrice] = useState<number | null>(null);
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 选了小单元后查一次它的价格，用于显示"每人应付"预览。
  // 复用 fetchPickableSubUnits（它就是查该大单元下的小单元列表），
  // 不手写 fetch —— 手写那版返回的是 any，还要自己收窄类型。
  // 注意这里只影响**提示文案**；真正的分摊价永远以服务端现算为准。
  useEffect(() => {
    if (!subId || !majorId) {
      setPickedPrice(null);
      return;
    }
    let alive = true;
    void fetchPickableSubUnits(majorId).then((list) => {
      if (!alive) return;
      setPickedPrice(list.find((x) => x.id === subId)?.price ?? null);
    });
    return () => {
      alive = false;
    };
  }, [subId, majorId]);

  const per =
    pickedPrice !== null && count > 0
      ? Math.round((pickedPrice / count) * 100) / 100
      : null;

  const submit = async () => {
    if (!subId) {
      setError('请选择小单元');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createGroupBuy(getAuthHeaders, subId, count);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMajorId('');
    setSubId('');
    onCreated();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="发起拼单">
      <div className="space-y-4 pb-2">
        {/* 先大单元后小单元（用户需求 #9） */}
        <MajorSubPicker
          majorId={majorId}
          subId={subId}
          onMajorChange={setMajorId}
          onSubChange={setSubId}
          disabled={busy}
          majorLabel="大单元"
          subLabel="选择小单元"
        />

        <div>
          <p className="mb-2 text-sm font-medium text-apple-text">成团人数</p>
          <div className="flex flex-wrap gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={cn(
                  'h-10 w-12 rounded-btn text-sm font-medium transition-colors duration-fast ease-apple',
                  count === n
                    ? 'bg-apple-blue text-white'
                    : 'bg-apple-bg text-apple-text-2 hover:text-apple-text',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-apple-text-3">
            含你自己。满 {count} 人后每人只需付 {per !== null ? formatPrice(per) : '原价 ÷ ' + count}。
            到期没满会自动关闭。
          </p>
        </div>

        {error && (
          <p className="text-sm text-apple-danger" role="alert">
            {error}
          </p>
        )}

        <Button variant="primary" fullWidth onClick={() => void submit()} disabled={busy}>
          {busy ? '发起中…' : '发起拼单'}
        </Button>
      </div>
    </BottomSheet>
  );
}
