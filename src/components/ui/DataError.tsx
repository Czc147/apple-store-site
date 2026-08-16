'use client';

import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';

/** 通用数据加载失败态：提示 + 重试（router.refresh 重新执行服务端取数） */
export default function DataError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center px-8 pb-16 pt-20 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-apple-card shadow-card">
        <WifiOff className="h-7 w-7 text-apple-text-3" strokeWidth={1.6} aria-hidden />
      </div>
      <h2 className="text-[19px] font-semibold tracking-tight">加载失败</h2>
      <p className="mt-2 max-w-[300px] break-all text-[13px] leading-relaxed text-apple-text-2">
        {message}
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-6 rounded-btn bg-apple-blue px-6 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-colors duration-200 ease-apple hover:bg-apple-blue-hover active:bg-apple-blue-active"
      >
        重试
      </button>
    </div>
  );
}
