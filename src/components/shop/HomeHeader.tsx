import { getAppSettings } from '@/lib/app-settings';

/** 选购页大标题：文案来自后台「全局配置」，留空回退默认 */
export default async function HomeHeader() {
  const settings = await getAppSettings();
  const greeting = settings.home_greeting?.trim() || '选购';
  const subtitle =
    settings.home_subtitle?.trim() ||
    '轻点卡片展开选项，看到心仪的小单元就点亮爱心收藏';

  return (
    <header className="px-5 pb-6 pt-14">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
        {greeting}
      </h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
        {subtitle}
      </p>
    </header>
  );
}
