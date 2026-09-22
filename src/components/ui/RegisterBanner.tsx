import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface RegisterBannerProps {
  href?: string;
  className?: string;
}

/**
 * 游客注册引导横幅（audit 收敛：LibraryClient 游客视图与 RedeemClient
 * 兑换结果两处近似复制——圆角/图标碟/字号三重微差——统一为共享组件）。
 */
export default function RegisterBanner({ href = '/login', className }: RegisterBannerProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-start gap-3 rounded-card-lg border border-apple-blue/25 bg-apple-blue-soft/60 p-4',
        'pressable hover:bg-apple-blue-soft',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
        className,
      )}
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-apple-blue/10">
        <UserPlus className="h-5 w-5 text-apple-blue" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-md font-semibold text-apple-text">
          注册账号，永久保存你的权益
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-apple-text-2">
          当前为游客，兑换记录只存在本机，换设备会丢失。注册 / 登录后即可同步到「我的库」。
        </span>
      </span>
    </Link>
  );
}
