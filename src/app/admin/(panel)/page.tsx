import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** /admin 首页：直接进入第一个管理模块 */
export default function AdminIndexPage() {
  redirect('/admin/major-units');
}
