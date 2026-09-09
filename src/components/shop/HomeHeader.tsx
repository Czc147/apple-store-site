import { getAppSettings } from '@/lib/app-settings';
import PageHeader from '@/components/ui/PageHeader';

/** 选购页大标题：文案来自后台「全局配置」，留空回退默认（页头统一走 PageHeader primitive） */
export default async function HomeHeader() {
  const settings = await getAppSettings();
  const greeting = settings.home_greeting?.trim() || '选购';
  const subtitle =
    settings.home_subtitle?.trim() ||
    '轻点卡片展开选项，看到心仪的小单元就点亮爱心收藏';

  return <PageHeader title={greeting} subtitle={subtitle} />;
}
