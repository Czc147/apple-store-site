import { getAppSettings } from '@/lib/app-settings';

/**
 * 选购页大标题（UI 升级 §8.1 · 首页大标题/副标题）：
 * 文案来自后台「全局配置」；走编辑叙事字阶（移动 28 → 平板 32 → 桌面 48），
 * 容器与 Hero 同宽（max-w-wide），不套页头卡片。
 */
export default async function HomeHeader() {
  const settings = await getAppSettings();
  const greeting = settings.home_greeting?.trim() || '选购';
  const subtitle =
    settings.home_subtitle?.trim() ||
    '轻点卡片展开选项，看到心仪的小单元就点亮爱心收藏';

  return (
    <header className="px-page pb-7 pt-2">
      <div className="mx-auto max-w-wide">
        <h1 className="text-2xl font-semibold leading-[1.15] text-apple-text sm:text-editorial-title lg:text-editorial-display">
          {greeting}
        </h1>
        <p className="mt-2 max-w-[640px] text-md leading-relaxed text-apple-text-2">
          {subtitle}
        </p>
      </div>
    </header>
  );
}
