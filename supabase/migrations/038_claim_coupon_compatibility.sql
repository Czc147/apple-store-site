-- 038: temporary compatibility for the currently deployed coupon claim code
-- The live site still calls the old 3-argument claim_coupon RPC, while 037
-- introduced the 5-argument version used by the updated local code. Keep a
-- thin wrapper so coupon claiming keeps working until the next deployment.

create or replace function public.claim_coupon(
  p_coupon_id uuid,
  p_user_id   uuid,
  p_code      text
)
returns public.coupon_claims
language sql
security definer
set search_path = public
as $$
  select public.claim_coupon(
    p_coupon_id,
    p_user_id,
    p_code,
    null::text,
    null::text
  );
$$;

revoke execute on function public.claim_coupon(uuid, uuid, text)
  from public, anon;
grant execute on function public.claim_coupon(uuid, uuid, text)
  to service_role;
