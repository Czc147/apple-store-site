import TabBar from '@/components/layout/TabBar';
import PageFade from '@/components/ui/PageFade';

/**
 * 前台路由组布局：内容区 + 固定底部 TabBar。
 * main 预留 TabBar 高度 + iOS 上下安全区（刘海屏/底部横条）。
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="mx-auto min-h-dvh max-w-page pb-[calc(72px+env(safe-area-inset-bottom))] pt-safe">
        <PageFade>{children}</PageFade>
      </main>
      <TabBar />
    </>
  );
}
