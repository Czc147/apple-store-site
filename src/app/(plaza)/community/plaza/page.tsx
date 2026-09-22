import PlazaClient from '@/components/plaza/PlazaClient';
import pkg from '../../../../../package.json';

export const metadata = {
  title: '探究广场',
  description: '交流、共享、一起买、对话与搜索。',
};

export const dynamic = 'force-dynamic';

/**
 * 探究广场：从「探究」页右上角进入的独立界面，结构与首页类似，
 * 但底部换成广场自己的五个板块（交流 / 共享 / 一起买 / 对话 / 搜索）。
 * 板块切换是页内状态，不做成子路由 —— 用户描述的是"一个界面里切板块"。
 *
 * 版本号在这里从 package.json 读出来往下传：总设置的「关于」要显示它，
 * 与其在设置页手抄一个必然过期的字符串，不如让它在编译期定死在一处。
 */
export default function PlazaPage() {
  return <PlazaClient version={pkg.version} />;
}
