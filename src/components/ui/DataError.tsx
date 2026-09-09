'use client';

import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import EmptyState from './EmptyState';
import Button from './Button';

interface DataErrorProps {
  message: string;
  /** 客户端自取数的场景传入自己的重载函数；缺省 router.refresh()（服务端取数） */
  onRetry?: () => void;
  size?: 'page' | 'inline' | 'panel';
}

/**
 * 数据加载失败态：EmptyState(error 语义) + 重试按钮。
 * audit 修复：社区/我的库取数失败曾静默伪装成空态（用户无从重试），
 * 此组件开放 onRetry 供客户端 fetch 场景使用。
 */
export default function DataError({ message, onRetry, size = 'page' }: DataErrorProps) {
  const router = useRouter();
  return (
    <EmptyState
      icon={WifiOff}
      title="加载失败"
      description={message}
      descriptionClassName="break-all"
      size={size}
      action={
        <Button variant="primary" size="md" onClick={onRetry ?? (() => router.refresh())}>
          重试
        </Button>
      }
    />
  );
}
