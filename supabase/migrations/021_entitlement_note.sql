-- ============================================================
-- 迁移 021：用户权益加「备注」独立列
--
-- 背景：后台推送服务（/api/admin/push）只有一个「统一备注」输入，
-- 服务端把它当作逐条 description 的兜底写入（description = item.description ?? note）。
-- 结果是备注没有独立身份：一条推送里「逐条说明」与「本次推送的统一备注」
-- 混在同一列，前端（我的内容）也只能显示其一，图片网格里两条都看不到。
--
-- 本迁移只加列，不做数据搬迁（历史行无法区分「本来就是逐条说明」与
-- 「备注兜底写进来的」，强行拆分只会更乱；旧数据显示为说明，语义仍成立）：
--   note：本次推送/发放的统一备注，与逐条 description 各自独立展示
--
-- 幂等：add column if not exists。
-- 使用方法：node scripts/apply-migration.mjs supabase/migrations/021_entitlement_note.sql
-- ============================================================

alter table public.user_entitlements
  add column if not exists note text;

comment on column public.user_entitlements.note
  is '统一备注（后台推送的全局备注等）：与逐条 description 分开存储、前端各自展示';
