# Apple Store 风格商城

移动端优先的商品展示与选购网站，视觉对标 Apple Store（苹果官网商店）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 14（App Router） |
| 样式 | Tailwind CSS（自定义 Apple 设计 Tokens） |
| 数据库 | Supabase（PostgreSQL + Storage 图片） |
| 后端 | Next.js API Routes（Netlify 上自动转为 Functions） |
| 图标 | Lucide React（SF Symbols 风格线性图标） |
| 部署 | Netlify |

## 目录结构

```
apple-store-site/
├─ netlify.toml                    # Netlify 构建/部署配置
├─ .env.local.example              # 环境变量模板（复制为 .env.local）
├─ supabase/
│  └─ schema.sql                   # 建表 + 索引 + RLS + Storage 初始化脚本
└─ src/
   ├─ app/
   │  ├─ layout.tsx                # 根布局（字体/背景/metadata）
   │  ├─ globals.css               # Tailwind 入口 + 全局基础样式
   │  ├─ icon.svg                  # 站点图标
   │  ├─ (store)/                  # 前台路由组（带底部 TabBar）
   │  │  ├─ layout.tsx             #   TabBar 布局容器
   │  │  ├─ page.tsx               #   Tab 1 · 选购        /
   │  │  ├─ wishlist/page.tsx      #   Tab 2 · 愿望单      /wishlist
   │  │  ├─ activities/page.tsx    #   Tab 3 · 活动        /activities
   │  │  └─ subscription/page.tsx  #   Tab 4 · 订阅        /subscription
   │  ├─ admin/                    # 后台（无 TabBar）
   │  │  ├─ layout.tsx
   │  │  └─ page.tsx               #   /admin 占位 + API 列表
   │  └─ api/                      # API Routes（CRUD）
   │     ├─ major-units/           #   GET列表 POST新建 / [id] GET PUT DELETE
   │     ├─ sub-units/             #   同上，GET 支持 ?major_unit_id= 过滤
   │     ├─ activities/            #   同上
   │     ├─ subscriptions/         #   同上
   │     └─ upload/                #   POST 图片上传 → Supabase Storage
   ├─ components/
   │  ├─ layout/TabBar.tsx         # 底部毛玻璃导航栏（4 Tab）
   │  └─ ui/EmptyState.tsx         # 空态占位组件
   └─ lib/
      ├─ types.ts                  # 4 张表的 TypeScript 类型
      ├─ api.ts                    # 路由响应工具（ok/fail/parseBody）
      └─ supabase/
         ├─ client.ts              # 浏览器端（anon key，只读）
         └─ admin.ts               # 服务端（service_role，写入用）
```

## 本地启动

```bash
npm install
copy .env.local.example .env.local   # 填入 Supabase 三个环境变量
npm run dev                          # http://localhost:3000
```

## 环境变量说明

| 变量 | 位置 | 用途 |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API | 项目地址 |
| `SUPABASE_ANON_KEY` | 同上（`anon` `public`） | 前台只读查询，可暴露给浏览器 |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上（`service_role` `secret`） | 服务端写入，**严禁进前端** |

本地写在 `.env.local`（已被 gitignore）；生产环境在
**Netlify → Site → Environment variables** 中逐一添加同名变量。

## Supabase 初始化（一次性）

1. 创建 Supabase 项目
2. 打开 **SQL Editor**，粘贴 `supabase/schema.sql` 全部内容并运行
   （建 4 张表 + 索引 + RLS 公开读策略 + `images` 公开图桶）
3. 验证：Table Editor 中可见 major_units / sub_units / activities / subscriptions；
   Storage 中可见 `images` 桶（Public）

**安全模型**：4 张表只开放匿名 SELECT；增删改一律走本站 API
（使用 service_role key，绕过 RLS），数据库层面无匿名写入口。

## 图片上传方案

- 桶：`images`（公开读）
- 上传：`POST /api/upload`（multipart/form-data，字段名 `file`，≤ 5MB）
  → 服务端用 service_role 写入 `images/products/时间戳-随机.ext`
  → 返回 `{ path, url }`，`url` 即商品图 `image_url` 直接入库
- 展示：`next/image` 已配置 `**.supabase.co` remotePatterns

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/major-units` | 大单元列表（sort_order 升序） |
| POST | `/api/major-units` | 新建大单元 `{name, image_url?, link_url?, sort_order?}` |
| GET/PUT/DELETE | `/api/major-units/:id` | 单条查询 / 局部更新 / 删除（级联删小单元） |
| GET | `/api/sub-units?major_unit_id=` | 小单元列表（可按大单元过滤） |
| POST | `/api/sub-units` | `{major_unit_id, name, sort_order?, price?, payment_url?}` |
| GET/PUT/DELETE | `/api/sub-units/:id` | 同上 |
| GET/POST | `/api/activities` · `/api/subscriptions` | 同构 |
| POST | `/api/upload` | 图片上传 |

## Netlify 部署

1. 仓库推送到 GitHub/GitLab → Netlify **Add new site → Import**
2. 构建设置会被 `netlify.toml` 自动接管（`npm run build`，发布 `.next`）
3. 添加 3 个环境变量（见上表）→ Deploy
4. `@netlify/plugin-nextjs` 会自动把 SSR 页面与 API Routes 转为 Netlify Functions

## 后续路线

- [ ] 选购页：大单元卡片网格 + 小单元价格列表（接 major_units / sub_units）
- [ ] 愿望单：localStorage 收藏 + 心形交互
- [ ] 活动页：activities 卡片流
- [ ] 订阅页：subscriptions 套餐卡 + payment_url 跳转
- [ ] /admin 管理界面：CRUD 表单 + 图片上传
