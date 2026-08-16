import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '臻选商城',
    template: '%s · 臻选商城',
  },
  description: '移动端优先的商品展示与选购网站 · 视觉对标 Apple Store',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
