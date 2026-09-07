-- ============================================================
-- 迁移 019：默认头像池去重（单一事实来源）
--
-- 此前 017 的注册触发器把「默认头像 key 列表」硬编码成一个 text[] 内联数组，
-- 与前端 src/lib/avatars.ts 的 AVATAR_PRESETS 各存一份，改一边必须手动同步另一边，
-- 否则新用户被分到前端渲染不出的 key。
--
-- 这里把 DB 侧的默认头像池收拢为一张表 public.avatar_presets，注册触发器从此表
-- 取值（不再内联数组），DB 侧的「合法默认 key 集合」只有一个存放地点。
--
-- 说明：前端 avatars.ts 仍负责「渲染」——它内置各 key 的渐变配色 + 编辑资料里的
-- 头像选择器。DB 这张表只负责「注册时的默认指派」。两者仍共享同一批 key，属于
-- 「指派 vs 渲染」两个不同职责的协同；key 需保持一致（新增预置时两处一起补）。
-- avatars.ts 的 getAvatarPreset 对未知 key 会兜底回第一个渐变，故即便一时不同步
-- 也不会渲染出坏头像（只会落到默认渐变）。
--
-- RLS/权限：与其它表同模式，读写全走本站 API（service_role 绕过 RLS），
-- 不建 policy。触发器用 security definer + search_path = public。
-- ============================================================

create table if not exists public.avatar_presets (
  key text primary key
);

comment on table public.avatar_presets
  is '默认头像 key 池（注册触发器随机指派用）。key 须与 src/lib/avatars.ts 的 AVATAR_PRESETS 保持一致';
alter table public.avatar_presets enable row level security;

insert into public.avatar_presets (key) values
  ('aurora'),('citrus'),('mint'),('coral'),('indigo'),('sunset'),
  ('sky'),('rose'),('sand'),('forest'),('lilac'),('steel')
on conflict (key) do nothing;


-- 注册触发器：从 avatar_presets 随机取一个 key 作默认头像
--   - 不再内联数组；表空/异常时 coalesce 兜底回 'aurora'，保证 NOT NULL 不被破坏
--   - 与之前行为一致（等概率随机），只是默认池来源从内联数组换成表
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected text;
begin
  select key into selected
  from public.avatar_presets
  order by random()
  limit 1;

  insert into public.profiles (user_id, display_name, avatar_key)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), '用户'),
    coalesce(selected, 'aurora')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
