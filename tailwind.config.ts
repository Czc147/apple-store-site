import type { Config } from 'tailwindcss';

/**
 * Apple 设计语言 Tokens（Phase 2 改版扩展版）
 * 对标 apple.com/store 与 Apple Store App：
 * - 雾灰白底 #F5F5F7 + 纯白卡片 + 近黑文字 #1D1D1F
 * - 全站唯一交互强调色：Apple 蓝 #0071E3（CTA / 选中态 / 链接）
 * - indigo→violet（premium/premium-2）仅用于 Hero / 订阅主卡等 premium 材质区域，
 *   禁止用于普通按钮/链接/选中态 —— 这是 CCC 自己的身份色，与 Apple 蓝分工明确
 * - 按钮为 980px 胶囊圆角；卡片 20px；大画报/弹层 28px
 * - SF Pro 字体栈（macOS/iOS 命中系统字，中文回退苹方/思源）
 *
 * 使用规约（audit 2026-09-09 后确立，新代码必须遵守）：
 * - 字号只用 text-micro/2xs/xs/sm/base/md/lg/xl/2xl 九档，禁止 text-[Npx] 任意值
 * - 成功一律 apple-success(#1D8A3E)，危险一律 apple-danger(#D70015)，
 *   禁止 #1B7F3B / #FF3B30 / red-500 等私有色值
 * - 小元素（气泡/pill/芯片）圆角用 rounded-chip 或 rounded-full，禁用 rounded-card
 * - 遮罩一律 scrim-sheet / scrim-lightbox 两档，禁止 black/25、black/45 等散装浓度
 * - 按压反馈统一 active:scale-[0.97]；动效时长只用 duration-fast/base/slow
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
          success: '#1D8A3E', // 成功绿 · 全站唯一绿（禁止再用 #1B7F3B/#E8F5E9）
          'success-soft': '#E8F5EC',
          danger: '#D70015', // 危险红 · 全站唯一红（禁止 #FF3B30/red-500）
          'danger-soft': '#FBEAE9',
          'pay-wechat': '#07C160', // 微信品牌色（仅支付按钮）
          'pay-alipay': '#1677FF', // 支付宝品牌色（仅支付按钮）
          scrim: 'rgba(0,0,0,0.4)', // 统一遮罩浓度（弹层）
          'scrim-deep': 'rgba(0,0,0,0.8)', // 深遮罩（仅 lightbox）
          // ---- CCC 身份色：premium 渐变（indigo→violet），仅限 Hero/订阅主卡/玻璃材质区 ----
          premium: '#4F46E5',
          'premium-2': '#A855F7',
          'premium-soft': '#EEF2FF', // premium 浅底（标签/占位渐变起点）
        },
      },
      /**
       * Type scale · 九档（audit 前全站 15 档任意值收敛而来）
       * 归并规则：10→micro · 11/11.5→2xs · 12/12.5→xs · 13/13.5→sm
       *           14/14.5→base · 15→md · 17/18/19→lg · 20/22/24→xl · 28→2xl
       */
      fontSize: {
        micro: ['10px', '14px'], // 角标/badge 专用
        '2xs': ['11px', '15px'], // 辅助说明/时间戳
        xs: ['12px', '16px'], // 次要信息
        sm: ['13px', '18px'], // 正文辅助/按钮小字
        base: ['14px', '20px'], // 正文
        md: ['15px', '22px'], // 强调正文/列表标题
        lg: ['17px', '24px'], // 区块标题（iOS headline）
        xl: ['22px', '28px'], // 页面二级大标题/价格
        '2xl': ['28px', '34px'], // 页面大标题（iOS large title）
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
        chip: '10px', // 小元素：图标芯片/输入框内件/小按钮（替代散装 rounded-lg/md）
        input: '12px', // 输入框统一档（替代散装 rounded-xl）
        card: '20px', // 商品卡（大单元卡片）
        'card-lg': '24px', // 活动大卡（Apple Store Today 风格）
        hero: '28px', // 大画报卡 / 弹层容器
      },
      maxWidth: {
        page: '1024px', // 页面内容最大宽（移动端优先，桌面收拢）
        dialog: '360px', // 居中弹层（ActionSheet）
        sheet: '480px', // 底部弹层面板统一宽（原 360/420/480/560 四档收敛）
        bar: '560px', // 悬浮结算条
      },
      /**
       * z 轴层级刻度（原 z-40/50/[60]/[70] 散装收敛）：
       * panel(40) 页内浮层/通知面板/FAB < overlay(50) TabBar/居中弹层
       * < sheet(60) 底部弹层 < lightbox(70) 全屏预览 < toast(80) 全局提示
       */
      zIndex: {
        panel: '40',
        overlay: '50',
        sheet: '60',
        lightbox: '70',
        toast: '80',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.05)',
        'card-hover': '0 12px 32px rgba(0,0,0,0.10)',
        popover: '0 16px 48px rgba(0,0,0,0.14)',
        tabbar: '0 -1px 0 rgba(0,0,0,0.06)',
        'btn-blue': '0 1px 2px rgba(0,113,227,0.3)', // 主按钮投影（原手写 ×12 收敛）
        badge: '0 2px 6px rgba(0,113,227,0.4)', // TabBar 角标投影
        // premium 玻璃卡投影（配方来自素材库 frosted-glass-card：双层扩散+内高光）
        premium:
          '0 44px 88px -32px rgba(67,56,202,0.30), 0 16px 40px -20px rgba(67,56,202,0.16), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(255,255,255,0.18)',
      },
      /** 动效时长三档（原 100/150/200/250/300ms 混用收敛；弹层统一走 slow） */
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.4, 0, 0.2, 1)', // 克制快速 150–250ms
        'apple-pop': 'cubic-bezier(0.34, 1.56, 0.64, 1)', // 角标轻微过冲（全站唯一例外）
        'apple-sheet': 'cubic-bezier(0.32, 0.72, 0, 1)', // 弹层滑入（iOS sheet 曲线，原只活在 keyframe 里）
      },
    },
  },
  plugins: [],
};

export default config;
