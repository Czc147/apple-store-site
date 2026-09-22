import ShareExchangesManager from '@/components/admin/ShareExchangesManager';

export const metadata = {
  title: '共享审核',
};

/** 共享审核：用户用资源换小单元，通过前只看得到参考图 */
export default function ShareExchangesAdminPage() {
  return <ShareExchangesManager />;
}
