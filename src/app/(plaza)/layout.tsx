import { AuthProvider } from '@/lib/auth-context';
import PageFade from '@/components/ui/PageFade';

/**
 * 探究广场独立布局。
 *
 * 为什么单开一个路由组而不是塞进 `(store)`：广场有**自己的底部板块栏**
 * （交流/共享/一起买/对话/搜索），跟主 TabBar 是两套导航。塞进 (store) 的话
 * 会同时出现两条底栏，还得靠 pathname 判断隐藏 TabBar、再抵消 main 的
 * `--tabbar-h` 底部留白 —— 与其打这种补丁，不如让广场有自己的布局。
 *
 * 路由组不影响 URL：广场对外仍是 `/community/plaza`。
 */
export default function PlazaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <main className="mx-auto min-h-dvh max-w-page pb-[calc(var(--plaza-bar-h)+env(safe-area-inset-bottom))] pt-safe">
        <PageFade>{children}</PageFade>
      </main>
    </AuthProvider>
  );
}
