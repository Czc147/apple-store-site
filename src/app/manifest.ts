import type { MetadataRoute } from 'next';

/**
 * PWA manifest（Phase 10 补齐，Brief §15 iOS PWA 适配）：
 * iOS「添加到主屏幕」/ Android Chrome 安装为独立窗口应用。
 * 图标复用现有品牌资产：icon.svg（蓝底购物袋，矢量任意尺寸）+
 * apple-icon.png（180×180，iOS 主屏标准尺寸，Next 已自动挂 apple-touch-icon）。
 * theme/background 与雾灰白页面底色一致，冷启动无白闪。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zorvin',
    short_name: 'Zorvin',
    description: '浏览精选内容，订阅每日更新，兑换记录永久保存',
    lang: 'zh-CN',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F5F7',
    theme_color: '#F5F5F7',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
