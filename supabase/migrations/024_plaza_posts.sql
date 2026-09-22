-- 024 探究广场 · 交流板块的帖子配图
--
-- 背景（用户 2026-09-22 需求）：帖子流整个搬到探究广场的「交流」板块，
-- 并且该板块的帖子要**支持上传图片和文本**。原 community_posts 只有纯文本正文
-- （012 迁移的注释里明确写了「帖子暂无图片字段」），所以在这里补上。
--
-- 表名保持 community_posts 不改：改名只是文案层面的事，动表名要连带改
-- 5 个 API 目录、4 个组件目录和 lib/community.ts 的 7 个取数函数，不值当。
--
-- images 存 public images bucket 的**公开 URL**（不是私有路径）：
-- 帖子图是给人看的公开内容，跟订阅商品图同性质；私有桶那套签名链接是给
-- 付费内容用的，别混。最多 9 张，由 API 层限制，库里只做上限兜底。
--
-- 幂等：可重复执行。

alter table public.community_posts
  add column if not exists images text[];

comment on column public.community_posts.images is
  '帖子配图：public images bucket 的公开 URL 数组，最多 9 张；null / 空数组 = 纯文本帖';

-- 上限兜底：API 已限 9 张，这里再卡一道，防止历史数据或直连写库绕过
alter table public.community_posts drop constraint if exists community_posts_images_max;
alter table public.community_posts add constraint community_posts_images_max
  check (images is null or array_length(images, 1) is null or array_length(images, 1) <= 9);
