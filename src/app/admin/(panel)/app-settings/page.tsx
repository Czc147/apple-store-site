import AppSettingsManager from '@/components/admin/AppSettingsManager';

export const metadata = { title: '全局配置' };

export const dynamic = 'force-dynamic';

/** 后台 · 首页全局配置（站点标题 / 首页文案 / 公告条） */
export default function AdminAppSettingsPage() {
  return <AppSettingsManager />;
}
