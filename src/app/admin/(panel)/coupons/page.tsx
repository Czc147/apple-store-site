import CouponsManager from '@/components/admin/CouponsManager';

export const metadata = { title: '优惠券' };

export const dynamic = 'force-dynamic';

/** 后台 · 优惠券管理 */
export default function AdminCouponsPage() {
  return <CouponsManager />;
}
