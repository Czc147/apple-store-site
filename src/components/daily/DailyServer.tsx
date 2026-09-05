import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import DataError from '@/components/ui/DataError';
import { getDemoDailyPicks } from '@/lib/demo-data';
import type { DailyPickTeaser } from '@/lib/types';
import DailyClient from './DailyClient';

/**
 * 每日推荐页服务端取数：只查全部日期的 teaser（日期/标题/封面/有无内容），
 * 按日期倒序（首条为最新一期）。正文内容一律由客户端凭凭证经
 * /api/daily-content 获取，SSR HTML 中不出现任何私有内容。
 */
export default async function DailyServer() {
  let teasers: DailyPickTeaser[] = [];
  let isDemo = false;

  if (!isSupabaseConfigured()) {
    teasers = getDemoDailyPicks().map((p) => ({
      pick_date: p.pick_date,
      title: p.title,
      cover_url: p.cover_url,
      has_content: Boolean(p.media_path || p.link_url),
    }));
    isDemo = true;
  } else {
    try {
      const { data, error } = await supabaseAdmin()
        .from('daily_picks')
        .select('pick_date, title, cover_url, media_path, link_url')
        .order('pick_date', { ascending: false });
      if (error) throw new Error(error.message);
      teasers = ((data ?? []) as Array<{
        pick_date: string;
        title: string;
        cover_url: string | null;
        media_path: string | null;
        link_url: string | null;
      }>).map((row) => ({
        pick_date: row.pick_date,
        title: row.title,
        cover_url: row.cover_url,
        has_content: Boolean(row.media_path || row.link_url),
      }));
    } catch (e) {
      return (
        <DataError
          message={e instanceof Error ? e.message : '每日推荐加载失败'}
        />
      );
    }
  }

  return <DailyClient teasers={teasers} isDemo={isDemo} />;
}
