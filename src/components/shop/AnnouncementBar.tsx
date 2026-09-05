import { Megaphone } from 'lucide-react';
import { getAppSettings } from '@/lib/app-settings';

/** 顶部公告条：文案来自后台「全局配置」，留空则整条隐藏 */
export default async function AnnouncementBar() {
  const settings = await getAppSettings();
  const text = settings.announcement?.trim();
  if (!text) return null;

  return (
    <div className="border-b border-apple-hairline bg-apple-blue-soft px-4 py-2 text-center">
      <p className="inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium leading-relaxed text-apple-blue">
        <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{text}</span>
      </p>
    </div>
  );
}
