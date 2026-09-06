-- ============================================================
-- 迁移 016：order_items 增加 line_index（行号，确定性排序）
--
-- 订单确认派发时，每行用 card_delivery 的 order_id = "order_no:line_index"
-- 作为幂等键调 deliver_card_keys。line_index 保证「行项 ↔ 派发单」
-- 的确定性一一对应，避免依赖 created_at 排序的不稳定。
--
-- 幂等：add column if not exists；已有行回填按 order_id 内原始插入顺序编号。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等）
-- ============================================================
alter table public.order_items
  add column if not exists line_index integer not null default 0;

comment on column public.order_items.line_index
  is '行号（0 起）：与 card_deliveries.order_id="order_no:line_index" 一一对应，确认派发时确定性寻址';

-- 回填：仅当列为新建（全部为 0）且无重复冲突时，按 order 内 created_at,id 顺序编号
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'order_items'
       and column_name  = 'line_index'
  ) then
    update public.order_items oi
       set line_index = t.rn
      from (
        select id, row_number() over (partition by order_id order by created_at, id) - 1 as rn
          from public.order_items
      ) t
     where oi.id = t.id
       and oi.line_index = 0;
  end if;
end $$;
