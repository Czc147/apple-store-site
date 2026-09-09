import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Zorvin',
    template: '%s · Zorvin',
  },
  description: '移动端优先的商品展示与选购网站 · 视觉对标 Apple Store',
  // PWA（Phase 10）：iOS 添加到主屏幕后以独立窗口运行，状态栏用默认样式
  // （页面已有 pt-safe/pb-safe 安全区处理，无需 black-translucent 沉浸）。
  // 注：Next 14 的 appleWebApp 挂在 Metadata 上（Next 15 才移入 Viewport）
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Zorvin',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // 用户拍板保留（不放开双指缩放）
  viewportFit: 'cover', // 配合 env(safe-area-inset-*) 处理刘海屏
  themeColor: '#F5F5F7',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-apple-bg font-sans text-apple-text antialiased">
        {children}
      </body>
    </html>
  );
}
