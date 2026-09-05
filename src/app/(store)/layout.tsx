import TabBar from '@/components/layout/TabBar';
import PageFade from '@/components/ui/PageFade';
import { AuthProvider } from '@/lib/auth-context';

/**
 * 前台路由组布局：认证上下文 + 内容区 + 固定底部 TabBar。
 * main 预留 TabBar 高度 + iOS 上下安全区（刘海屏/底部横条）。
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <main className="mx-auto min-h-dvh max-w-page pb-[calc(72px+env(safe-area-inset-bottom))] pt-safe">
        <PageFade>{children}</PageFade>
      </main>
      <TabBar />
    </AuthProvider>
  );
}
