# 部署文档 · Netlify + Supabase

移动端优先的商品展示与选购网站（视觉对标 Apple Store）。
技术栈：Next.js 14（App Router）· Tailwind CSS · Supabase（PostgreSQL + Storage）· Netlify。

---

## 1. 架构说明

```
浏览器
 ├─ 前台页面  /  /wishlist  /activities  /subscription  /redeem  /library  /daily  /login
 │                                                              → Next.js SSR（每次请求实时渲染）
 ├─ 后台      /admin/**                                           → Next.js SSR + Cookie 鉴权
 ├─ API       /api/*                                              → Netlify Functions（插件自动转换）
 └─ 静态资源  /_next/static/*、icon.svg、apple-icon.png           → Netlify CDN 长缓存
          ↓
 Supabase（PostgreSQL + Storage + Auth）
   - service_role 仅存在于服务端（API Routes / SSR 组件）
   - RLS 策略：四张商品表与 images 桶公开只读，写入只走本站 API；
     发卡管理三表（card_*）、daily_picks、user_entitlements 零 policy，仅服务端可访问
   - Storage：images 公开桶；daily 私有桶（每日内容，服务端现签 1h 签名 URL）
   - Auth：用户邮箱+密码登录（浏览器端 supabase-js，anon key）
```

### 为什么没有 `_redirects` / SPA 回退

本项目是 **SSR 架构而非 SPA**：`@netlify/plugin-nextjs` 会把页面渲染成
Netlify Functions 并自动接管全部路由（含深链、404、API）。
若按 SPA 思路配置 `/* → /index.html`，会把本该 SSR 的请求短路到不存在
的静态文件，导致全站不可用。**请勿添加任何 SPA 回退规则**；
`netlify.toml` 中只需声明构建命令、发布目录与插件，其余全部自动。

---

## 2. 环境变量（Netlify Dashboard 配置）

路径：`Site settings → Environment variables`（配置后重新触发构建）。

| 变量 | 必填 | 用途 | 获取方式 |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | 服务端读写数据库/Storage | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 服务端密钥（绕 RLS，严禁泄露） | 同上 |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 浏览器端邮箱登录（supabase-js），与 SUPABASE_URL 同值 | 同上 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 匿名公钥（构建期内联，改后必须重新部署） | 同上 |
| `ADMIN_PASSWORD` | ✅ | 后台登录密码 + 会话签名密钥，设为强密码 | 自拟 |

> 本地开发：复制 `.env.local.example` 为 `.env.local` 填入即可，互不影响。
> 未配置 Supabase 时前台自动降级为演示数据；后台 CRUD/上传会提示 503。

---

## 3. 部署步骤

### 首次部署
1. Supabase 控制台建项目，SQL Editor 中执行 `supabase/schema.sql`
   （建表、RLS、images 公开桶），再依次执行增量迁移：
   - `supabase/migrations/002_card_management.sql`（发卡管理三表 + 发放 RPC）
   - `supabase/migrations/003_redeem.sql`（兑换图片列 + 卡密商品多态化）
   - `supabase/migrations/004_subscription_description.sql`（订阅详细介绍列 + 兑换商品注释）
   - `supabase/migrations/005_daily_plan.sql`（每日推荐 + 用户权益 +
     `grant_daily_plan` RPC + `daily` 私有桶）
   （001 已并入 schema.sql；所有迁移幂等，可安全重跑。）
2. **邮箱登录设置**：Supabase Dashboard → Authentication → Providers → Email，
   关闭 **Confirm email**（否则注册需邮件确认，默认 SMTP 限 2 封/小时）；
   「忘记密码」邮件如需稳定收发可另配自定义 SMTP（可后补）。
3. 把本仓库推送到 GitHub/GitLab。
4. Netlify → `Add new site → Import an existing project` → 选择仓库。
5. 构建配置会自动读取 `netlify.toml`
   （`npm run build` / publish `.next` / 插件自动安装），无需改动。
6. 按上表配置环境变量（含两个 `NEXT_PUBLIC_*`，浏览器端登录必需）→ `Deploy site`。
7. 构建成功后访问站点；`/admin` 用 `ADMIN_PASSWORD` 登录开始维护数据。

### 每日计划上线配置顺序（后台按序操作）
1. 订阅管理 → 新建「每日计划」订阅（前台解锁入口与展示名取自这里）。
2. 卡密商品 → 新建关联该订阅的商品，**兑换类型选「解锁每日计划」**，
   填有效天数（留空 = 永久）。
3. 批量导入该商品下的卡密 → 在第三方平台售卖。
4. 每日推荐 → 上传当天内容（封面 + 内容文件 / 跳转链接）。

### 日常迭代
- `git push` → Netlify 自动构建发布（约 1-3 分钟），可在
  `Deploys` 页查看日志；失败日志里 90% 的常见问题：
  - 缺少环境变量（新变量需手动触发 `Trigger deploy → Clear cache and deploy`）
  - Node 版本（已在 `netlify.toml` 固定 NODE_VERSION=20）

### 本地预检（与线上构建等价）
```bash
npm run build     # 等价于 Netlify 构建步骤，必须零报错
npm run dev       # 本地联调
```

---

## 4. 性能与缓存策略

| 项 | 实现 |
|---|---|
| 图片懒加载 | 全部内容图 `<img loading="lazy" decoding="async">` + 骨架屏占位防抖 |
| 代码分割 | App Router 按路由自动分包，各 Tab/后台模块独立 chunk |
| 查询精简 | 前台 SSR 只 select 渲染必需字段；`order` 仍按 sort_order + created_at |
| 静态资源 | `netlify.toml` 对 `/_next/static/*` 设置 1 年 immutable（文件名带 hash） |
| 动态页面 | 业务页 `force-dynamic`（数据实时性优先，不走 CDN 缓存） |

---

## 5. SEO 与 Meta

- 每个页面均有独立 `title` + `description`（模板 `%s · Zorvin`）。
- `viewport`：`width=device-width, initialScale=1, viewportFit=cover`，
  配合 `env(safe-area-inset-*)` 适配刘海屏。
- 图标：`src/app/icon.svg`（favicon）+ `src/app/apple-icon.png`
  （180×180，由 `node scripts/generate-icons.mjs` 零依赖生成）。
- `src/app/robots.ts`：前台允许收录，`/admin/`、`/api/` 禁止；
  后台布局额外 `robots: noindex`。

---

## 6. 最终检查清单（已逐项实测）

1. ✅ 选购页：大单元卡片展开小单元、爱心加愿望单、客服悬浮按钮
2. ✅ 愿望单：数量步进、左滑删除、合计金额、单件直跳/多件确认、清空
3. ✅ 活动页：Today 大卡片、图+标题叠加、介绍三行截断、点击跳转
4. ✅ 订阅页：套餐卡片、¥xx.xx 大价格、时长徽章、按钮新标签页跳支付
5. ✅ 后台：密码登录（7 天 cookie）、四模块 CRUD、图片上传（进度/拖拽/预览）、排序生效、级联删除警示、三类商品「兑换商品」上传（图片/视频/文档）
6. ✅ 发卡管理：概览 / 卡密商品（多态关联小单元·活动·订阅）/ 库存状态机 / 批量导入 / 取卡登记 / 卡密批量清空与商品连带删除
7. ✅ 兑换链路：`/redeem` 输入未用卡密 → 核销 + 弹出兑换商品（图片/视频/文档按类型渲染）；重复输入 → 已兑换提示；错码/作废码统一 403；未配置兑换商品 409 且不核销
8. ✅ Tab Bar：六 Tab 高亮、图标、愿望单角标实时计数
9. ✅ 移动端：设计基准 375-428px，`px-5` + 圆角卡片 + 底部安全区适配
10. ✅ 数据流：后台录入 → 前台 force-dynamic 实时可见 → 跳转酷发卡支付 → 卡密搬运回本站兑换
11. ✅ 每日计划：后台每日推荐上传（封面/内容文件/链接）→ 解锁类卡密商品设有效期 → 游客输码解锁（选购页区块锁定→解锁）→ `/daily` 今日内容 + 历史仓库（签名 URL 1h）→ 过期回到锁定态
12. ✅ 账号链路：邮箱注册/登录（关闭 Confirm email）→ 我的库同步本机码（逐条结果）→ 退出重登权益仍在；忘记密码邮件重置
13. ✅ 权益管理：后台 `/admin/library` 延长（叠加/置永久）→ 生效；撤销 → `/api/daily-access` 回到未解锁且该码重输/同步不复活（关联码已作废）
14. ✅ 部署：`npm run build` 本地零报错（= Netlify 构建步骤）；
   路由/鉴权/上传/兑换经 curl 全量回归
