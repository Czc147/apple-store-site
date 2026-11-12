import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DEFAULT_MAINTENANCE, type MaintenanceConfig } from '@/siteMaintenance/logic';
import { readMaintenance } from '@/siteMaintenance/server';
import LiveMaintenance from '@/siteMaintenance/LiveMaintenance';

type Props = { config: MaintenanceConfig; serverNow: number };

// A Pages Router document is intentional: Next 14 App Router streaming resets
// rewrite status to 200. getServerSideProps can preserve a real maintenance 503.
export const getServerSideProps: GetServerSideProps<Props> = async ({ res }) => {
  let config = { ...DEFAULT_MAINTENANCE, enabled: true };
  try { config = await readMaintenance(); } catch { /* Keep closed with safe copy. */ }
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (!config.enabled) return { redirect: { destination: '/', permanent: false } };
  res.statusCode = 503;
  res.setHeader('Retry-After', '300');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return { props: { config, serverNow: Date.now() } };
};

export default function MaintenanceDocument(props: Props) {
  return <><Head><title>网站维护 · Zorvin</title><meta name="robots" content="noindex,nofollow" /><link rel="icon" href="/icon.svg" type="image/svg+xml" /><style>{'body{margin:0}'}</style></Head><main lang="zh-CN"><LiveMaintenance {...props} /></main></>;
}
