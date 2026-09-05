import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { getDemoDailyPicks } from '@/lib/demo-data';
import { todayDateCN } from '@/lib/daily';
import type { DailyPickTeaser } from '@/lib/types';
import DailyPickBlock from './DailyPickBlock';

/**
 * 选购页「每日推荐」区块的服务端取数：
 * 只查最新一条的 teaser 字段（日期/标题/封面/有无内容），
 * 绝不携带私有内容信息——正文一律在客户端凭凭证经 /api/daily-content 获取。
 *
 * 区块是附加入口：查询失败（如旧库未跑迁移 005）时静默隐藏，
 * 绝不拖累主商品流；错误细节只进服务端日志（后台页会正常报错提示）。
 */
export default async function DailyPickServer() {
  let teaser: DailyPickTeaser | null = null;
  let isDemo = false;

  if (!isSupabaseConfigured()) {
    const picks = getDemoDailyPicks();
    teaser = picks.length
      ? {
          pick_date: picks[0].pick_date,
          title: picks[0].title,
          cover_url: picks[0].cover_url,
          has_content: Boolean(picks[0].media_path || picks[0].link_url),
        }
      : null;
    isDemo = true;
  } else {
    try {
      const { data, error } = await supabaseAdmin()
        .from('daily_picks')
        .select('*')
        .order('pick_date', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as
        | {
            pick_date: string;
            title: string;
            cover_url: string | null;
            media_path: string | null;
            link_url: string | null;
            subtitle?: string | null;
            accent_color?: string | null;
          }
        | undefined;
      teaser = row
        ? {
            pick_date: row.pick_date,
            title: row.title,
            cover_url: row.cover_url,
            subtitle: row.subtitle,
            accent_color: row.accent_color,
            has_content: Boolean(row.media_path || row.link_url),
          }
        : null;
    } catch (e) {
      console.warn(
        '[daily-pick] 选购页区块取数失败，已隐藏：',
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  }

  // 后台还没上传过任何内容时不展示区块
  if (!teaser) return null;

  return (
    <DailyPickBlock
      teaser={teaser}
      isToday={teaser.pick_date === todayDateCN()}
      isDemo={isDemo}
    />
  );
}
