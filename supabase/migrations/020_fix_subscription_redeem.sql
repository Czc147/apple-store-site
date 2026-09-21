-- ============================================================
-- 迁移 020：订正「普通订阅」被错写成 content 的存量权益
--
-- 背景（bug）：/api/redeem 与 /api/library/sync 曾把 target_type='subscription'
-- 且订阅非 daily_plan 型的卡密，强制改判为 content 处理 ——
-- 只写 kind='content' 快照（且前置要求订阅配了 redeem_image_url），
-- 不写 subscription_id。结果：用户兑换订阅后「我的库 → 我的订阅」看不到，
-- 也收不到订阅内容更新推送（推送只发给 kind='subscription' 持有者）。
--
-- 代码侧已在同批修复（redeem/sync 走 grant_subscription）；
-- 本迁移只订正存量行：
--   kind='content' 且 target_type='subscription' 且 target_id 指向现存订阅
--     → 无同订阅权益：就地转为 kind='subscription' + subscription_id=target_id
--     → 已有同订阅权益：合并有效期（任一为永久则永久，否则取较晚者）后删冗余行
--       （uq_entitlements_subscription：每用户每订阅唯一，硬转会冲突）
--
-- 不动的情况：
--   - 订阅行已删除（target_id 悬空）的 content 行保持原样（仍可在「我的内容」看到）
--   - daily_plan 订阅的历史数据（走的是 unlock_daily 分支，未受此 bug 影响）
--
-- 幂等：订正后不再满足 where 条件，重复执行无副作用。
-- 使用方法：node scripts/apply-migration.mjs supabase/migrations/020_fix_subscription_redeem.sql
-- ============================================================

do $$
declare
  r          record;
  v_fix      integer := 0;
  v_merge    integer := 0;
begin
  for r in
    select e.id, e.user_id, e.target_id, e.expires_at
    from public.user_entitlements e
    where e.kind = 'content'
      and e.target_type = 'subscription'
      and e.target_id is not null
      and exists (select 1 from public.subscriptions s where s.id = e.target_id)
    order by e.unlocked_at
  loop
    -- 该用户是否已有同订阅的订阅权益（每用户每订阅唯一）
    if exists (
      select 1 from public.user_entitlements x
      where x.user_id = r.user_id
        and x.kind = 'subscription'
        and x.subscription_id = r.target_id
    ) then
      -- 合并：有效期取「更晚/永久」的一方，随后删除冗余的 content 行
      update public.user_entitlements as x
      set expires_at = case
            when x.expires_at is null or r.expires_at is null then null  -- 任一为永久 → 永久
            else greatest(x.expires_at, r.expires_at)
          end
      where x.user_id = r.user_id
        and x.kind = 'subscription'
        and x.subscription_id = r.target_id;

      delete from public.user_entitlements where id = r.id;
      v_merge := v_merge + 1;
    else
      -- 就地订正：content 快照行转为订阅权益行
      update public.user_entitlements
      set kind = 'subscription',
          subscription_id = r.target_id
      where id = r.id;
      v_fix := v_fix + 1;
    end if;
  end loop;

  raise notice '迁移 020：订正 % 行，合并 % 行', v_fix, v_merge;
end $$;

-- 订正结果核对（应为 0 行）：
--   select count(*) from public.user_entitlements
--   where kind = 'content' and target_type = 'subscription'
--     and target_id in (select id from public.subscriptions);
