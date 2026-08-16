# 部署文档 · Netlify + Supabase

移动端优先的商品展示与选购网站（视觉对标 Apple Store）。
技术栈：Next.js 14（App Router）· Tailwind CSS · Supabase（PostgreSQL + Storage）· Netlify。

---

## 1. 架构说明

```
浏览器
 ├─ 前台页面  /  /wishlist  /activities  /subscription   → Next.js SSR（每次请求实时渲染）
 ├─ 后台      /admin/**                                  → Next.js SSR + Cookie 鉴权
 ├─ API       /api/*                                     → Netlify Functions（插件自动转换）
 └─ 静态资源  /_next/static/*、icon.svg、apple-icon.png  → Netlify CDN 长缓存
          ↓
 Supabase（PostgreSQL + Storage）
   - service_role 仅存在于服务端（API Routes / SSR 组件）
   - RLS 策略：四张业务表与 images 桶公开只读，写入只走本站 API
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
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 前台浏览器端（本项目仅服务端取值，建议与 SUPABASE_URL 同值） | 同上 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 匿名公钥 | 同上 |
| `ADMIN_PASSWORD` | ✅ | 后台登录密码 + 会话签名密钥，设为强密码 | 自拟 |

> 本地开发：复制 `.env.local.example` 为 `.env.local` 填入即可，互不影响。
> 未配置 Supabase 时前台自动降级为演示数据；后台 CRUD/上传会提示 503。

---

## 3. 部署步骤

### 首次部署
1. Supabase 控制台建项目，SQL Editor 中执行 `supabase/schema.sql`
   （建表、RLS、images 公开桶）。
2. 把本仓库推送到 GitHub/GitLab。
3. Netlify → `Add new site → Import an existing project` → 选择仓库。
4. 构建配置会自动读取 `netlify.toml`
   （`npm run build` / publish `.next` / 插件自动安装），无需改动。
5. 按上表配置环境变量 → `Deploy site`。
6. 构建成功后访问站点；`/admin` 用 `ADMIN_PASSWORD` 登录开始维护数据。

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

- 每个页面均有独立 `title` + `description`（模板 `%s · 臻选商城`）。
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
5. ✅ 后台：密码登录（7 天 cookie）、四模块 CRUD、图片上传（进度/拖拽/预览）、排序生效、级联删除警示
6. ✅ Tab Bar：四 Tab 高亮、图标、愿望单角标实时计数
7. ✅ 移动端：设计基准 375-428px，`px-5` + 圆角卡片 + 底部安全区适配
8. ✅ 数据流：后台录入 → 前台 force-dynamic 实时可见 → 跳转酷发卡支付
9. ✅ 部署：`npm run build` 本地零报错（= Netlify 构建步骤）；
   路由/鉴权/上传经 curl 全量回归
