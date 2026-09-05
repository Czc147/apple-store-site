import type { Activity, DailyPick, MajorUnit, SubUnit, Subscription } from './types';
import { todayDateCN } from './daily';

/**
 * 演示数据 —— 仅在 Supabase 环境变量未配置时兜底使用，
 * 让页面在本地/预览时始终可交互；配置好 .env.local 后自动切换为真实数据。
 * （页面上会以浅色提示条明确标注「演示数据」）
 */
export const DEMO_MAJOR_UNITS: MajorUnit[] = [
  {
    id: 'demo-m1',
    name: '基础套装',
    image_url: 'https://picsum.photos/seed/shop-starter/960/540',
    link_url: 'https://example.com/catalog/starter',
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-m2',
    name: '进阶套装',
    image_url: 'https://picsum.photos/seed/shop-pro/960/540',
    link_url: null,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-m3',
    name: '定制服务',
    image_url: 'https://picsum.photos/seed/shop-custom/960/540',
    link_url: 'https://example.com/catalog/custom',
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
  },
];

export const DEMO_SUB_UNITS: SubUnit[] = [
  { id: 'demo-s1', major_unit_id: 'demo-m1', name: '入门版', sort_order: 1, price: 39, payment_url: null, redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s2', major_unit_id: 'demo-m1', name: '进阶版', sort_order: 2, price: 69, payment_url: null, redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s3', major_unit_id: 'demo-m1', name: '完整版（含全部更新）', sort_order: 3, price: 99, payment_url: 'https://example.com/pay/s3', redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s4', major_unit_id: 'demo-m2', name: '标准版', sort_order: 1, price: 129, payment_url: null, redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s5', major_unit_id: 'demo-m2', name: '旗舰版', sort_order: 2, price: 199, payment_url: 'https://example.com/pay/s5', redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s6', major_unit_id: 'demo-m3', name: '定制咨询定金', sort_order: 1, price: 50, payment_url: null, redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s7', major_unit_id: 'demo-m3', name: '全包定制（尾款）', sort_order: 2, price: 500, payment_url: null, redeem_image_url: null, created_at: '2026-01-01T00:00:00Z' },
];

export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: 'demo-a1',
    title: '新人限时专享',
    image_url: 'https://picsum.photos/seed/act-newuser/960/540',
    description:
      '首次下单即享专属折扣，叠加愿望单商品还有额外惊喜。活动限时开放，先到先得，快去选购页挑选你心仪的第一件商品吧。',
    link_url: 'https://example.com/activity/new-user',
    redeem_image_url: null,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-a2',
    title: '秋季新品抢先看',
    image_url: 'https://picsum.photos/seed/act-autumn/960/540',
    description:
      '本季全新系列提前亮相，抢先加入愿望单，开售当天第一时间通知你。更多搭配灵感与细节图陆续放出，敬请期待。',
    link_url: 'https://example.com/activity/autumn-preview',
    redeem_image_url: null,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-a3',
    title: '好友邀请计划',
    image_url: 'https://picsum.photos/seed/act-invite/960/540',
    description:
      '邀请一位好友完成首单，双方都能获得优惠券奖励。邀请越多奖励越多，详情见活动规则页。',
    link_url: null,
    redeem_image_url: null,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
  },
];

export const DEMO_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'demo-sub1',
    name: '月度订阅',
    price: 18,
    duration: '月付',
    description: '每月更新精选内容，随时取消，适合先体验再决定的朋友。',
    payment_url: 'https://example.com/pay/monthly',
    redeem_image_url: null,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-sub2',
    name: '季度订阅',
    price: 48,
    duration: '季付',
    description: '按季付费更划算，含全部季度更新与优先客服支持。',
    payment_url: 'https://example.com/pay/quarterly',
    redeem_image_url: null,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-sub3',
    name: '年度订阅',
    price: 158,
    duration: '年付',
    description: '一次订阅全年畅用，含所有更新、专属内容与年度权益包。',
    payment_url: 'https://example.com/pay/yearly',
    redeem_image_url: null,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
  },
];

/**
 * 每日推荐演示数据：「今日」按北京时区现算（函数形式，避免模块缓存跨天不更新）。
 * 演示模式下 media_path 一律置空（无真实私有桶内容），仅展示区块/列表外观。
 */
export function getDemoDailyPicks(): DailyPick[] {
  const today = todayDateCN();
  const yesterday = todayDateCN(new Date(Date.now() - 24 * 3600 * 1000));
  return [
    {
      id: 'demo-d1',
      pick_date: today,
      title: '今日推荐 · 精选内容演示',
      description: '这是演示数据：配置 Supabase 环境变量并在后台上传后将显示真实内容。',
      cover_url: 'https://picsum.photos/seed/daily-today/960/540',
      media_path: null,
      link_url: 'https://example.com/daily/today',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'demo-d2',
      pick_date: yesterday,
      title: '往期推荐 · 历史仓库演示',
      description: '解锁每日计划后可查看全部历史内容。',
      cover_url: 'https://picsum.photos/seed/daily-past/960/540',
      media_path: null,
      link_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
}
