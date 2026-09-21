import { Megaphone } from 'lucide-react';
import { getAppSettings } from '@/lib/app-settings';

/** 顶部公告条：文案来自后台「全局配置」，留空则整条隐藏 */
export default async function AnnouncementBar() {
  const settings = await getAppSettings();
  const text = settings.announcement?.trim();
  if (!text) return null;

  return (
    // Gallery 口径（§8.1 公告条）：Studio Mist 底 + 中性文字，
    // 蓝色只留给转化动作与链接，不做全宽蓝底条
    <div className="border-b border-apple-hairline bg-apple-bg px-page py-2 text-center">
      <p className="inline-flex items-center justify-center gap-1.5 text-xs font-medium leading-relaxed text-apple-text-2">
        <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{text}</span>
      </p>
    </div>
  );
}
