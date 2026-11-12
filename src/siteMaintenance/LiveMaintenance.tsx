'use client';
import MaintenancePage from './MaintenancePage';
import type { MaintenanceConfig } from './logic';
/** Site adapter; reusable component has no routing or network dependency. */
export default function LiveMaintenance({ config, serverNow }: { config: MaintenanceConfig; serverNow: number }) {
  const check = async () => {
    const res = await fetch('/api/maintenance', { cache: 'no-store' });
    if (!res.ok) throw new Error('状态查询失败');
    const state = await res.json();
    if (state.enabled === false) {
      if (window.location.pathname === '/maintenance') window.location.assign('/');
      else window.location.reload();
      return true;
    }
    return false;
  };
  return <MaintenancePage {...config} serverNow={serverNow} onCheckStatus={check} />;
}
