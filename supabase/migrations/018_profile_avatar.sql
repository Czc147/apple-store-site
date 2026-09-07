-- ============================================================
-- 迁移 018：自定义头像上传
--
-- 「编辑资料」新增「从相册上传自定义头像」：profiles 加 avatar_url 列
-- （有值时优先于 avatar_key 预置渐变头像展示），新建公开桶 avatars
-- 存放头像图（固定路径 avatars/{user_id}.jpg，upsert 覆盖，服务端写）。
--
-- RLS/policy：与 daily/images 桶同模式——不建 storage.objects policy，
-- 读写全部走本站 API（service_role 绕过 RLS），公开桶只是让 <img> 能
-- 直接跨域渲染，不代表允许客户端直接写。
-- ============================================================

alter table public.profiles add column if not exists avatar_url text;

comment on column public.profiles.avatar_url
  is '自定义头像图片 public URL（avatars 桶，avatars/{user_id}.jpg）；为空则用 avatar_key 预置渐变头像';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;
