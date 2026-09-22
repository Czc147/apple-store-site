import { Megaphone } from 'lucide-react';
import { getAppSettings } from '@/lib/app-settings';

/**
 * 顶部公告：文案来自后台「全局配置」，留空则整块隐藏。
 *
 * 2026-09-22 用户点名改版：原来是通栏「雾灰底 + 发丝下边线」的一条，
 * 现改为**玻璃卡片**承载 —— 与底部导航同一套玻璃语言，浮在页面画布之上。
 * 公告文案可能很长（含使用指南链接会折行），所以用 items-start 顶对齐，
 * 图标不参与折行（shrink-0）。
 */
export default async function AnnouncementBar() {
  const settings = await getAppSettings();
  const text = settings.announcement?.trim();
  if (!text) return null;

  return (
    <div className="px-page pt-3">
      <div className="mx-auto max-w-wide">
        <div className="glass rounded-card-lg border border-white/60 px-4 py-3 shadow-card">
          <p className="flex items-start justify-center gap-1.5 text-xs font-medium leading-relaxed text-apple-text-2">
            <Megaphone className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{text}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
