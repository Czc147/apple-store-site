import { cn } from '@/lib/cn';

/**
 * 数量角标（底部导航/板块栏图标右上角）。
 * audit 收敛：愿望单（蓝）· 我的库通知（红）· 对话未读（红）三处同构，
 * 原来每个 TabBar 各写一份 —— 尺寸、位置、动画稍有出入就会看起来像两个东西。
 *
 * 用法：`badge={unread > 0 ? <CountBadge key={unread} count={unread} /> : null}`
 * **key 必须给 count**：数量变化时靠换 key 让 React 重建节点，
 * 重播 badge-pop 动画；不给 key 的话数字会原地跳，没有那一下弹动。
 *
 * 位置：`absolute -right-2.5 -top-1.5` 是相对**图标本体**（22px）算的 ——
 * 调用方要保证图标外面有一层 `relative` 的容器。
 */
export default function CountBadge({
  count,
  tone = 'danger',
  className,
}: {
  count: number;
  /** danger=红（通知/私信未读）· blue=蓝（本机数据，如愿望单） */
  tone?: 'danger' | 'blue';
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'animate-badge-pop absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[4px] text-micro font-semibold leading-none text-white shadow-badge',
        tone === 'blue' ? 'bg-apple-blue' : 'bg-apple-danger',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
