import type { Activity, MajorUnit, SubUnit, Subscription } from './types';

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
  { id: 'demo-s1', major_unit_id: 'demo-m1', name: '入门版', sort_order: 1, price: 39, payment_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s2', major_unit_id: 'demo-m1', name: '进阶版', sort_order: 2, price: 69, payment_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s3', major_unit_id: 'demo-m1', name: '完整版（含全部更新）', sort_order: 3, price: 99, payment_url: 'https://example.com/pay/s3', created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s4', major_unit_id: 'demo-m2', name: '标准版', sort_order: 1, price: 129, payment_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s5', major_unit_id: 'demo-m2', name: '旗舰版', sort_order: 2, price: 199, payment_url: 'https://example.com/pay/s5', created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s6', major_unit_id: 'demo-m3', name: '定制咨询定金', sort_order: 1, price: 50, payment_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-s7', major_unit_id: 'demo-m3', name: '全包定制（尾款）', sort_order: 2, price: 500, payment_url: null, created_at: '2026-01-01T00:00:00Z' },
];

export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: 'demo-a1',
    title: '新人限时专享',
    image_url: 'https://picsum.photos/seed/act-newuser/960/540',
    description:
      '首次下单即享专属折扣，叠加愿望单商品还有额外惊喜。活动限时开放，先到先得，快去选购页挑选你心仪的第一件商品吧。',
    link_url: 'https://example.com/activity/new-user',
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
    payment_url: 'https://example.com/pay/monthly',
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-sub2',
    name: '季度订阅',
    price: 48,
    duration: '季付',
    payment_url: 'https://example.com/pay/quarterly',
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-sub3',
    name: '年度订阅',
    price: 158,
    duration: '年付',
    payment_url: 'https://example.com/pay/yearly',
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
  },
];
