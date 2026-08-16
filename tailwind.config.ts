import type { Config } from 'tailwindcss';

/**
 * Apple 设计语言 Tokens
 * 对标 apple.com/store 与 Apple Store App：
 * - 雾灰白底 #F5F5F7 + 纯白卡片 + 近黑文字 #1D1D1F
 * - 全站唯一强调色：Apple 蓝 #0071E3（CTA / 选中态 / 链接）
 * - 按钮为 980px 胶囊圆角；卡片 18px；大画报 28px
 * - SF Pro 字体栈（macOS/iOS 命中系统字，中文回退苹方/思源）
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        apple: {
          bg: '#F5F5F7', // 页面背景 · 雾灰白
          surface: '#FBFBFD', // 次级区块背景
          card: '#FFFFFF', // 卡片 · 纯白
          text: '#1D1D1F', // 主文字 · 近黑（价格同色）
          'text-2': '#6E6E73', // 次级文字 · 中灰
          'text-3': '#86868B', // 弱化文字 / TabBar 未选中
          blue: '#0071E3', // 品牌蓝 · 唯一强调色
          'blue-hover': '#0077ED',
          'blue-active': '#0066CC',
          'blue-soft': '#E8F1FB', // 品牌蓝浅底（标签/选中底）
          border: '#D2D2D7', // 描边 · 浅灰
          hairline: 'rgba(0,0,0,0.08)', // 发丝线（TabBar 顶边）
          success: '#1D8A3E', // 成功绿（极少量使用）
          'success-soft': '#E8F5EC',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Helvetica Neue',
          'Arial',
          'Noto Sans SC',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
      borderRadius: {
        btn: '980px', // Apple 按钮标志性胶囊圆角
        card: '20px', // 商品卡（大单元卡片）
        'card-lg': '24px', // 活动大卡（Apple Store Today 风格）
        hero: '28px', // 大画报卡 / 弹层容器
      },
      maxWidth: {
        page: '1024px', // 页面内容最大宽（移动端优先，桌面收拢）
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.05)',
        'card-hover': '0 12px 32px rgba(0,0,0,0.10)',
        popover: '0 16px 48px rgba(0,0,0,0.14)',
        tabbar: '0 -1px 0 rgba(0,0,0,0.06)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.4, 0, 0.2, 1)', // 克制快速 150–250ms
        'apple-pop': 'cubic-bezier(0.34, 1.56, 0.64, 1)', // 角标轻微过冲
      },
    },
  },
  plugins: [],
};

export default config;
