-- 迁移 047：修复 create_order 的 order_id 歧义（部分用户「推送订单」必报错）
--
-- 现象：前台结算点「推送订单」，部分请求返回
--       column reference "order_id" is ambiguous
--       且与机型无关——**用了券或拼团的订单必现，普通订单正常**，
--       所以曾被误判成「部分移动端问题」。
--
-- 根因：函数声明为 returns table(order_id uuid, order_no text)。
--       plpgsql 会把 RETURNS TABLE 的列当成函数体内的**变量**，
--       于是下面几条语句里未限定的 order_id 同时匹配「变量」和
--       「coupon_claims / group_buy_members 的列」→ 解析期直接报歧义。
--       普通订单走不到这些分支，语句不被规划，因此不报错。
--
-- 修法：把这 4 处引用显式限定到表名（不动 OUT 列名，避免改 RPC 返回结构，
--       /api/orders 仍按 order_id / order_no 取数）。
-- 幂等：create or replace function，可重复执行。

create or replace function public.create_order(
  p_order_no               text,
  p_user_id                uuid,
  p_user_email             text,
  p_total                  numeric,
  p_order_type             text,
  p_payment_method         text,
  p_coupon_code            text,
  p_discount_amount        numeric,
  p_discount_source        text,
  p_items                  jsonb,
  p_coupon_claim_id        uuid,
  p_coupon_holder_order_id uuid,
  p_group_buy_id           uuid
)
returns table(order_id uuid, order_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item  jsonb;
  v_index integer;
  v_group public.group_buys;
  v_claim public.coupon_claims;
begin
  if p_order_type not in ('sub_unit', 'subscription') then
    raise exception 'INVALID_ORDER_TYPE';
  end if;
  if p_payment_method not in ('wechat', 'alipay') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ORDER_ITEMS';
  end if;
  if p_coupon_claim_id is null and p_coupon_holder_order_id is not null then
    raise exception 'INVALID_COUPON_LOCK_TARGET';
  end if;

  if p_group_buy_id is not null then
    select * into v_group from public.group_buys where id = p_group_buy_id for update;
    if not found or v_group.status <> 'full' then
      raise exception 'GROUP_BUY_NOT_FULL';
    end if;
  end if;

  insert into public.orders (
    order_no, user_id, user_email, total, type, payment_method, status,
    coupon_code, discount_amount, discount_source
  )
  values (
    p_order_no, p_user_id, p_user_email, p_total, p_order_type,
    p_payment_method, 'pending', p_coupon_code, p_discount_amount, p_discount_source
  )
  returning * into v_order;

  for v_index in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_index;

    insert into public.order_items (
      order_id, line_index, line_type, ref_id, name, price, quantity, card_product_id
    )
    values (
      v_order.id,
      (v_item ->> 'line_index')::integer,
      v_item ->> 'line_type',
      (v_item ->> 'ref_id')::uuid,
      v_item ->> 'name',
      (v_item ->> 'price')::numeric,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'card_product_id')::uuid
    );

    insert into public.card_deliveries (
      order_id, card_product_id, quantity, claim_token
    )
    values (
      p_order_no || ':' || v_index,
      (v_item ->> 'card_product_id')::uuid,
      (v_item ->> 'quantity')::integer,
      v_item ->> 'claim_token'
    );
  end loop;

  if p_coupon_claim_id is not null then
    update public.coupon_claims
       set order_id = v_order.id
     where id = p_coupon_claim_id
       and coupon_claims.order_id is null
       and used_at is null;
    if not found then raise exception 'COUPON_LOCK_FAILED'; end if;
  elsif p_coupon_holder_order_id is not null then
    select * into v_claim
      from public.coupon_claims
     where id = p_coupon_claim_id
       and coupon_claims.order_id = p_coupon_holder_order_id
       and used_at is null
     for update;
    if not found then raise exception 'COUPON_LOCK_FAILED'; end if;

    update public.group_buy_members
       set order_id = null
     where group_buy_members.order_id = p_coupon_holder_order_id;

    update public.orders
       set status = 'canceled', updated_at = now()
     where id = p_coupon_holder_order_id
       and user_id = p_user_id
       and status = 'pending';
    if not found then raise exception 'COUPON_LOCK_FAILED'; end if;

    update public.coupon_claims
       set order_id = v_order.id
     where id = p_coupon_claim_id;
  end if;

  if p_group_buy_id is not null then
    update public.group_buy_members
       set order_id = v_order.id
     where group_buy_id = p_group_buy_id
       and user_id = p_user_id
       and group_buy_members.order_id is null;
    if not found then raise exception 'GROUP_BUY_ALREADY_ORDERED'; end if;
  end if;

  return query select v_order.id, v_order.order_no;
end;
$$;

revoke execute on function public.create_order(
  text, uuid, text, numeric, text, text, text, numeric, text, jsonb, uuid, uuid, uuid
) from public, anon;
grant execute on function public.create_order(
  text, uuid, text, numeric, text, text, text, numeric, text, jsonb, uuid, uuid, uuid
) to service_role;
