# Apple Store 风格商城（apple-store-site）

移动端优先的商品展示与选购网站，视觉对标 Apple Store（苹果官网商店 / Apple Store App）。
站点品牌名 **Zorvin**（`<title>` 模板为 `%s · Zorvin`）。

前台六个 Tab：**选购 / 愿望单 / 活动 / 订阅 / 兑换 / 我的库**；后台 `/admin` 提供密码登录 +
商品四模块、「每日推荐」与「发卡管理」（卡密商品 / 卡密库存 / 批量导入 / 取卡登记）的 CRUD。
数据存 Supabase（PostgreSQL + Storage + Auth），部署在 Netlify。

支付链路为**外跳第三方发卡平台**（酷发卡）：本站不做站内支付。买家在第三方平台
付款后收到卡密，管理员把卡密搬运进本站「发卡管理」，买家到「兑换」Tab 输入卡密，
核销后弹出商品后台预先上传的**兑换商品**（图片 / 视频 / 文档，详见 [发卡管理与兑换](#发卡管理与兑换)）。

卡密另支持**「解锁每日计划」**类型：管理员每天在后台上传 1 条「每日推荐」，
买家凭解锁码解锁后每天可看当日更新 + 全部历史仓库（详见 [每日计划与用户体系](#每日计划与用户体系)）。
用户可注册邮箱账号（Supabase Auth），权益永久存入「我的库」，换设备登录即找回；
游客也允许兑换（记录存本机 + 强提示注册）。

---

## 目录

1. [技术栈](#技术栈)
2. [架构与数据流](#架构与数据流)
3. [目录结构](#目录结构)
4. [数据模型](#数据模型)
5. [前台页面功能](#前台页面功能)
6. [管理后台](#管理后台)
7. [发卡管理与兑换](#发卡管理与兑换)
8. [API 参考](#api-参考)
9. [鉴权机制](#鉴权机制)
10. [愿望单机制](#愿望单机制)
11. [图片上传方案](#图片上传方案)
12. [设计系统（Tailwind Tokens）](#设计系统tailwind-tokens)
13. [环境变量与本地启动](#环境变量与本地启动)
14. [Supabase 初始化](#supabase-初始化)
15. [部署（Netlify）](#部署netlify)
16. [SEO 与性能](#seo-与性能)
17. [每日计划与用户体系](#每日计划与用户体系)
18. [扩展指南：如何加新功能](#扩展指南如何加新功能)
19. [已知约定与坑](#已知约定与坑)

---

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 14（App Router） | 全部页面 `force-dynamic` 实时 SSR |
| UI | React 18 + Tailwind CSS 3 | 自定义 Apple 设计 Tokens（见下文） |
| 图标 | lucide-react | SF Symbols 风格线性图标 |
| 数据库 | Supabase PostgreSQL | 商品 4 表公开只读；发卡/每日推荐/权益表零 policy |
| 文件存储 | Supabase Storage | `images` 公开桶 + `daily` 私有桶（签名 URL 1h） |
| 用户账号 | Supabase Auth | 邮箱 + 密码，浏览器端 supabase-js |
| 后端 | Next.js API Routes | Netlify 上自动转为 Functions |
| 部署 | Netlify | `@netlify/plugin-nextjs`，Node 20 |
| 状态管理 | 自研极简外部 store | `useSyncExternalStore` + localStorage，未引入 Zustand |

Node 要求 `>=18.17`（`engines`），Netlify 固定 `NODE_VERSION=20`。
项目**未集成 ESLint**，`next.config.mjs` 中 `eslint.ignoreDuringBuilds: true`。

---

## 架构与数据流

```
浏览器
 ├─ 前台  /  /wishlist  /activities  /subscription → Next.js SSR（force-dynamic，每请求实时渲染）
 ├─ 后台  /admin/**                                → SSR + Cookie 会话鉴权（服务端校验后渲染）
 ├─ API   /api/*                                   → Netlify Functions（插件自动转换）
 └─ 静态  /_next/static/*、icon.svg、apple-icon.png → Netlify CDN（1 年 immutable）
          ↓
 Supabase（PostgreSQL + Storage）
   - service_role 只存在于服务端（API Routes / Server Components）
   - RLS：四张业务表 + images 桶「公开只读」，写入只走本站 API（绕过 RLS）
```

关键链路：

- **前台读**：Server Component 用 `supabaseAdmin()`（service_role）实时查询 →
  `<Suspense>` 流式渲染骨架屏 → 客户端组件接管交互。
- **降级**：未配置 Supabase 环境变量时，前台自动使用 `lib/demo-data.ts` 演示数据
  （页面显示蓝色提示条）；后台与 API 写操作返回 503 `SUPABASE_NOT_CONFIGURED`。
- **出错**：查询失败渲染 `DataError`（带「重试」按钮，调 `router.refresh()` 重跑取数）。
- **写**：只经 `/api/*` 路由，且必须带有效管理员会话（见 [鉴权机制](#鉴权机制)）。
- **缓存**：`supabaseAdmin` 全局 `fetch: cache:'no-store'`，保证后台改动前台立即可见。

---

## 目录结构

```
apple-store-site/
├─ netlify.toml                      # Netlify 构建/部署：npm run build → publish .next，插件 + 静态缓存头
├─ next.config.mjs                   # 跳过构建 lint；next/image 允许 **.supabase.co 图域
├─ tailwind.config.ts                # Apple 设计 Tokens（颜色/圆角/阴影/字体/动画曲线）
├─ postcss.config.mjs
├─ package.json
├─ tsconfig.json                     # 路径别名 @/* → src/*
├─ .env.local.example                # 环境变量模板（复制为 .env.local）
├─ DEPLOY.md                         # 部署详解 + 上线检查清单
├─ scripts/
│  └─ generate-icons.mjs             # 零依赖生成 apple-icon.png（180×180，手写 PNG 编码）
├─ supabase/
│  ├─ schema.sql                     # 初始化：4 表 + 索引 + RLS 只读策略 + images 公开桶（含 001）
│  └─ migrations/
│     ├─ 001_activities_add_title.sql# activities 补 title 列（schema.sql 已包含）
│     ├─ 002_card_management.sql     # 发卡管理三表：card_products / card_keys / card_deliveries
│     ├─ 003_redeem.sql              # 三商品表补 redeem_image_url；card_products 多态化
│     ├─ 004_subscription_description.sql # 订阅详细介绍列 + 兑换商品注释统一
│     └─ 005_daily_plan.sql          # 每日推荐 + 权益：daily_picks / daily 私有桶 /
│                                    #   card_products 兑换类型 / card_keys 绑定 /
│                                    #   user_entitlements / grant_daily_plan RPC
└─ src/
   ├─ app/
   │  ├─ layout.tsx                  # 根布局：metadata、viewport（viewportFit=cover）、背景色
   │  ├─ globals.css                 # Tailwind 入口 + 安全区/毛玻璃/动画/骨架屏工具类
   │  ├─ icon.svg / apple-icon.png   # favicon 与 iOS 桌面图标
   │  ├─ robots.ts                   # 允许收录前台，禁止 /admin/ 与 /api/
   │  ├─ (store)/                    # 前台路由组（共享底部 TabBar + AuthProvider）
   │  │  ├─ layout.tsx               #   内容区 + TabBar + 安全区留白 + PageFade 过场
   │  │  ├─ page.tsx                 #   Tab 1 选购        /（含每日推荐区块）
   │  │  ├─ wishlist/page.tsx        #   Tab 2 愿望单      /wishlist
   │  │  ├─ activities/page.tsx      #   Tab 3 活动        /activities
   │  │  ├─ subscription/page.tsx    #   Tab 4 订阅        /subscription
   │  │  ├─ redeem/page.tsx          #   Tab 5 兑换        /redeem
   │  │  ├─ library/page.tsx         #   Tab 6 我的库      /library（登录/游客双视图）
   │  │  ├─ daily/page.tsx           #   每日推荐          /daily（今日更新 + 历史仓库）
   │  │  └─ login/page.tsx           #   账号              /login（登录/注册/忘记密码）
   │  ├─ admin/
   │  │  ├─ login/page.tsx           #   登录页（已登录自动回 /admin）
   │  │  └─ (panel)/
   │  │     ├─ layout.tsx            #   服务端校验会话，未登录 → 重定向 /admin/login；noindex
   │  │     ├─ page.tsx              #   /admin → redirect /admin/major-units
   │  │     ├─ major-units/page.tsx  #   大单元管理
   │  │     ├─ sub-units/page.tsx    #   小单元管理
   │  │     ├─ activities/page.tsx   #   活动管理
   │  │     ├─ subscriptions/page.tsx#   订阅管理
   │  │     ├─ daily-picks/page.tsx  #   每日推荐内容管理（一天一条）
   │  │     ├─ library/page.tsx      #   用户权益管理（延长 / 撤销）
   │  │     └─ card-management/      #   发卡管理：概览 / 商品 / 库存 / 导入 / 取卡登记
   │  └─ api/
   │     ├─ major-units/  route.ts + [id]/route.ts
   │     ├─ sub-units/    route.ts + [id]/route.ts   # GET 支持 ?major_unit_id= 过滤
   │     ├─ activities/   route.ts + [id]/route.ts
   │     ├─ subscriptions/route.ts + [id]/route.ts
   │     ├─ card-management/          # 发卡管理：products / keys / keys/import / deliveries / deliver / stats
   │     ├─ redeem/route.ts           # POST 卡密兑换（公开接口，支持解锁每日计划）
   │     ├─ daily-picks/  route.ts + [id]/route.ts   # 后台每日推荐管理（含签名预览）
   │     ├─ daily-access/route.ts     # POST 校验每日计划解锁状态（Bearer 或游客码）
   │     ├─ daily-content/route.ts    # POST 按日期取内容（私有桶签名 URL 1h）
   │     ├─ library/route.ts + sync/route.ts  # 我的库：权益列表 / 本机码同步
   │     ├─ entitlements/ route.ts + [id]/extend + [id]/revoke  # 后台权益管理
   │     ├─ upload/route.ts           # POST 文件上传 → images 公开桶 / daily 私有桶
   │     └─ auth/login|logout/route.ts# 管理员会话
   ├─ components/
   │  ├─ layout/TabBar.tsx            # 底部毛玻璃导航（6 Tab + 愿望单角标）
   │  ├─ redeem/RedeemClient.tsx      # 兑换页交互（兑换内容 / 解锁每日计划两种结果）
   │  ├─ shop/DailyPickBlock.tsx      # 选购页「每日推荐」区块（锁定/解锁双态）
   │  ├─ daily/                       # /daily 页：今日更新 + 历史仓库 + 按需签名取内容
   │  ├─ auth/AuthClient.tsx          # 登录/注册/忘记密码/重置密码（Supabase Auth）
   │  ├─ library/LibraryClient.tsx    # 我的库（游客本机记录 / 登录权威权益 + 一键同步）
   │  ├─ shop/
   │  │  ├─ ShopServer.tsx            # 服务端取数（含演示降级/错误态）
   │  │  ├─ ShopClient / ShopSkeleton
   │  │  ├─ MajorUnitCard.tsx         # 两列卡片，点击开 iOS 风弹层（链接 + 小单元）
   │  │  ├─ SubUnitRow.tsx            # 小单元行（价格 + 爱心收藏）
   │  │  ├─ CardImage.tsx             # 16:9 图（加载骨架/失败占位）
   │  │  └─ ServiceButton.tsx         # 客服悬浮按钮（复制 QQ 号 + 底部弹层）
   │  ├─ wishlist/
   │  │  ├─ WishlistPageClient.tsx    # 列表/合计/清空/结算分发
   │  │  ├─ WishlistRow.tsx           # 左滑删除行
   │  │  ├─ QuantityStepper.tsx       # 数量步进器（1–99）
   │  │  ├─ CheckoutBar.tsx           # 悬浮结算栏
   │  │  └─ CheckoutSheet.tsx         # 多件结算弹层
   │  ├─ activities/                   # Server/Client/Skeleton + ActivityCard
   │  ├─ subscriptions/                # Server/Client/Skeleton + SubscriptionCard
   │  ├─ admin/
   │  │  ├─ AdminShell.tsx            # 桌面侧栏 / 移动顶栏胶囊 Tab
   │  │  ├─ LoginForm.tsx
   │  │  ├─ MajorUnitsManager / SubUnitsManager / ActivitiesManager / SubscriptionsManager
   │  │  ├─ DailyPicksManager.tsx     # 每日推荐管理（日期/标题/封面/内容文件/跳转链接）
   │  │  ├─ EntitlementsManager.tsx   # 用户权益管理（列表/延长/撤销）
   │  │  ├─ ImageUploader.tsx         # 图片上传（真实进度/拖拽/预览/替换）
   │  │  ├─ FileUploader.tsx          # 兑换商品/每日内容上传（图片/视频/文档，可选私有桶）
   │  │  ├─ Modal / ConfirmDialog
   │  │  ├─ ui.tsx                    # 共享样式常量 + 原子组件
   │  │  └─ card/                     # 发卡管理：Overview / Products / Keys / Import / Deliveries + shared
   │  └─ ui/
   │     ├─ DataError.tsx             # 取数失败 + 重试
   │     ├─ EmptyState.tsx
   │     ├─ ActionSheet.tsx           # iOS 风居中弹层（背景压暗 + 列表行）
   │     └─ PageFade.tsx              # 路由切换淡入（按 pathname 重挂载）
   └─ lib/
      ├─ types.ts                     # 4 张商品表 + 每日推荐 + 权益的 TS 类型
      ├─ card-types.ts                # 发卡管理三表类型 + 状态机常量 + 目标类型 + 兑换类型
      ├─ card-targets.ts              # 服务端：卡密商品关联目标解析/校验（勿入前端）
      ├─ api.ts                       # 路由工具：ok / fail / parseBody / toSortOrder / toNullableText
      ├─ auth.ts                      # HMAC 签名会话（后台管理员；签发/校验/密码比较）
      ├─ user-auth.ts                 # 用户 Bearer 鉴权：getRequestUser（与后台会话严格分离）
      ├─ auth-context.tsx             # 前台 AuthProvider / useAuth（supabase-js 会话）
      ├─ unlocks.ts                   # 游客本机兑换库（localStorage，同 wishlist 模式）
      ├─ library-client.ts            # 「我的库」客户端取数（仅 type import 服务端类型）
      ├─ daily.ts / daily-access.ts   # 每日计划：北京时区日期 / 解锁状态现算
      ├─ rate-limit.ts                # 内存限速（尽力而为，多实例不共享）
      ├─ admin-fetch.ts               # adminFetch（401 自动跳登录）+ extractError
      ├─ wishlist.ts                  # 愿望单外部 store + useWishlist
      ├─ format.ts                    # formatPrice / toNumber / formatDateTime / maskTail
      ├─ demo-data.ts                 # 演示数据（未配置 Supabase 时）
      └─ supabase/
         ├─ client.ts                 # 浏览器端（anon；邮箱登录 / 会话自动刷新）
         └─ admin.ts                  # 服务端（service_role；isSupabaseConfigured / no-store）
```

---

## 数据模型

建表脚本 `supabase/schema.sql`（SQL Editor 一次性执行）。4 张表均有
`sort_order`（越小越靠前）与 `created_at`，排序统一为
`order sort_order asc, created_at asc`。

### major_units · 大单元（商品分组）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()`（依赖 pgcrypto 扩展） |
| `name` | text NOT NULL | 单元名称 |
| `image_url` | text | 展示图（Storage 公共 URL） |
| `link_url` | text | 「查看详情」跳转链接 |
| `sort_order` | int default 0 | 排序 |
| `created_at` | timestamptz | 创建时间 |

### sub_units · 小单元（挂在某个大单元下）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `major_unit_id` | uuid FK → major_units，**ON DELETE CASCADE** | 删除大单元会级联删除其下全部小单元 |
| `name` | text NOT NULL | 名称 |
| `sort_order` | int default 0 | 排序 |
| `price` | numeric(10,2) default 0 | 价格（元）。**PostgREST 返回字符串**，前端用 `toNumber` 归一 |
| `payment_url` | text | 付款链接（发卡平台，如酷发卡） |
| `redeem_image_url` | text | **兑换商品**（不公开）：买家兑换卡密成功后弹出的内容（图片 / 视频 / 文档） |
| `created_at` | timestamptz | |

索引：`major_unit_id`、`sort_order`。

### activities · 活动

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `title` | text | 活动标题，白字叠加在卡片大图上；**可为空**，前端回退到 description 首行 |
| `image_url` | text | 卡片图（建议 16:9） |
| `description` | text | 活动介绍（前端三行截断） |
| `link_url` | text | 「了解更多」跳转 |
| `redeem_image_url` | text | **兑换商品**（不公开）：买家兑换卡密成功后弹出的内容（图片 / 视频 / 文档） |
| `sort_order` / `created_at` | | |

> `title` 列由迁移 `001_activities_add_title.sql` 补入（`schema.sql` 已包含）。
> 老项目升级时单独执行该迁移即可，脚本幂等（`add column if not exists`）。

### subscriptions · 订阅

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | text NOT NULL | 订阅名称 |
| `price` | numeric(10,2) default 0 | 价格（元） |
| `duration` | text | 时长徽章文案，自由文本：「月付」「连续包年」等 |
| `payment_url` | text | 付款链接 |
| `redeem_image_url` | text | **兑换商品**（不公开）：买家兑换卡密成功后弹出的内容（图片 / 视频 / 文档） |
| `sort_order` / `created_at` | | |

### 发卡管理三表（迁移 002 + 003）

| 表 | 说明 |
| --- | --- |
| `card_products` · 卡密商品 | **多态关联**三类商品：`target_type`（`sub_unit` / `activity` / `subscription`）+ `target_id`，两列同空同有（check 约束），`unique (target_type, target_id)` 保证一个对象至多一个卡密商品；`description` / `enabled` / `sort_order`。目标被删除时触发器自动置空两列并禁用商品 |
| `card_keys` · 卡密 | `content`（卡密原文）+ `card_product_id`（FK RESTRICT）+ `status`（`unused` → `issued` → 可 `void` / 恢复）+ `order_id` / `issued_at`；唯一约束 `(card_product_id, content)` |
| `card_deliveries` · 取卡登记 | `order_id`（全局唯一）+ `card_product_id` + `quantity` + `claim_token`（32 位 hex 取卡码）+ `status`（pending / fulfilled / cancelled） |

三表均为**零 RLS policy**（匿名不可读写），只经服务端 service_role 访问。
兑换流程与接口细节见 [发卡管理与兑换](#发卡管理与兑换)。

### 每日计划与用户权益（迁移 005）

| 表 / 对象 | 说明 |
| --- | --- |
| `daily_picks` · 每日推荐 | `pick_date`（date，unique，一天一条）+ `title` + `description` + `cover_url`（公开封面，营销用）+ `media_path`（内容文件在私有桶的对象路径，**不落签名 URL**）+ `link_url`。零 policy，只经服务端访问 |
| `daily` 私有桶 | 每日内容文件；无任何 storage policy，仅 service_role 可读写，前台凭服务端现签 1h 签名 URL 访问 |
| `card_products` 扩展 | `redeem_type`（`content` 兑换内容 / `unlock_daily` 解锁每日计划）+ `unlock_duration_days`（有效天数，null = 永久；有效期由后台决定，自核销时刻起算） |
| `card_keys` 扩展 | `bound_user_id`（绑定的账号；CAS 抢占 `where bound_user_id is null`，防并发重复绑定） |
| `user_entitlements` · 用户权益（我的库数据源） | `user_id` + `user_email`（快照）+ `kind`（daily_plan/content）+ `card_key_id` + content 类快照字段（name/description/media_url/target_*）+ `unlocked_at` + `expires_at`（null = 永久）+ `source`（redeem/sync/admin）。部分唯一索引：`(user_id) where kind='daily_plan'`（每用户单条）、`(user_id, card_key_id) where kind='content'`。零 policy |
| `grant_daily_plan` RPC | 每日计划权益**原子叠加上期**：无则插入；新码永久 → 置 null；现值永久 → 保持；双方有限 → `greatest(现到期, now()) + N 天`。并发兑换不丢延期 |

### RLS 安全模型

- 4 张表 + `images` 桶：**只开放匿名 `SELECT`**（policy 名如 `"public: read major_units"`）。
- 无任何写 policy：增删改一律走本站 API（service_role 绕过 RLS）。
- Storage 上传不开放 anon 写入，仅服务端 `POST /api/upload`。

---

## 前台页面功能

前台共享布局 `(store)/layout.tsx`：内容区 `max-w-page(1024px)`、
底部预留 `72px + safe-area-inset-bottom`、`PageFade` 路由切换淡入、固定 `TabBar`。
每个页面头部为 Apple 式大标题（28px 粗体）+ 灰色副标题。

### Tab 1 · 选购 `/`

- `ShopServer` 并行拉取 `major_units` + `sub_units`（各自按排序），
  小单元按 `major_unit_id` 分组后交给 `ShopClient`。
- **大单元卡片**（`MajorUnitCard`）：
  - 点图片/标题区展开收起（`aria-expanded`，箭头 `rotate-180`）；
    展开用 `grid-rows-[0fr→1fr]` 高度过渡，平滑不跳变。
  - 16:9 `CardImage`：加载中 shimmer 骨架，无图/加载失败显示浅渐变 + `ImageOff`。
  - 有 `link_url` 时显示「查看详情 ›」（新窗口，不参与展开）。
  - 展开后无小单元显示「该单元下暂无可选小单元」。
- **小单元行**（`SubUnitRow`）：名称 + `¥xx.xx` 价格 + 右侧操作按钮。
  - 未收藏：`Plus` 图标，点击 `toggle` 加入愿望单；
  - 已收藏：浅蓝底 + 实心蓝爱心，再点移除（`aria-pressed`）。
- **每日推荐区块**（`DailyPickBlock`，header 与商品网格之间）：
  未解锁 → 封面卡片 + 🔒「订阅每日计划开启」→ `/subscription`；
  已解锁 → 「今日更新」角标 + 标题 → `/daily`（本地解锁态客户端判定，`mounted` 防注水不一致）。
- **客服悬浮按钮**（`ServiceButton`）：固定右下角（TabBar 上方），
  点击弹出底部毛玻璃卡片，一键复制 QQ 号（常量在组件内），复制成功态 2s 还原。
- 无数据时 `EmptyState`；演示数据时显示蓝色提示条。

### Tab 2 · 愿望单 `/wishlist`

纯客户端页面（数据在 localStorage，见 [愿望单机制](#愿望单机制)）：

- 挂载前渲染骨架，空列表渲染引导空态。
- **条目行**（`WishlistRow`）：名称、单价、`QuantityStepper`（1–99 边界禁用）、小计。
  - **左滑删除**：触摸拖拽露出 76px 删除区，8px 阈值锁定横/纵轴不干扰页面滚动，
    松手过半自动吸附；拖拽后吞掉 click 防误触；桌面端另有垃圾桶按钮。
- **合计与结算**（`CheckoutBar` 悬浮栏）：共 X 件 · 合计 ¥Y.YY。
  - **单件且配了付款链接** → `window.open` 直跳；
  - 其余情况 → `CheckoutSheet` 弹层：逐件「去支付」，或「全部打开（N 个支付页）」
    （浏览器可能拦截多窗口，弹层内有提示）；未配链接的条目置灰提示。
- **清空**：两步确认，第二次点击需在 3 秒内，超时自动还原。

### Tab 3 · 活动 `/activities`

Apple Store「Today」式大卡片流（`ActivityCard`，24px 圆角）：

- 标题白色粗体叠加在图片底部黑色渐变遮罩上；无 `title` 回退 description 首行。
- 介绍文字 `line-clamp-3` 三行截断。
- 有 `link_url` 时整卡可点（stretched link，新窗口）。

### Tab 4 · 订阅 `/subscription`

套餐对比卡片（移动端单列，`sm:2` 列，`lg:3` 列）：

- `duration` 蓝色徽章（无则占位保持对齐），名称，32px 大号 `¥xx.xx`。
- 「立即订阅」：有 `payment_url` → 按钮显示 ~350ms「正在打开…」后
  `window.open(url, '_blank', 'noopener')`；无链接则禁用并提示「暂未开放订阅」。
- 卡片内 `flex-1` 弹性占位，保证多列时按钮底对齐。

### Tab 5 · 兑换 `/redeem`

买家拿着第三方平台发的卡密来本站兑换（`RedeemClient`，纯客户端交互）：

- 输入框（`font-mono`，上限 500 字符，回车提交）+ 蓝色胶囊「兑换」按钮。
- 调公开接口 `POST /api/redeem`，按商品 `redeem_type` 分流：
  - **content（兑换内容）**：核销成功 → 绿色「兑换成功」徽章 + 商品名/描述 + **兑换商品**卡片（按类型渲染图片 / 视频 / 文档）；
    该码之前已兑换过 → 内容照常展示，文案为「该卡密已兑换过，以下为兑换内容」。
  - **unlock_daily（解锁每日计划）**：绿色成功卡「每日计划解锁成功」+「永久有效 / 有效期至 YYYY-MM-DD」+ 主按钮「查看今日推荐」→ `/daily`。
  - 码不存在/已作废 → 统一「兑换码不正确，请核对后再试」（防枚举）；
    商品未配置兑换商品 → 「该商品暂未配置兑换内容，请联系客服」（**不核销**）。
- 已登录（带 Bearer）→ 服务端顺带绑定账号并写「我的库」权益；
  **游客**兑换 → 记录写入本机库（`lib/unlocks.ts`）+ 结果页显示注册引导横幅。
- 内容加载失败显示占位，并提供「在新标签页打开」；「兑换其他卡密」重置表单。

### Tab 6 · 我的库 `/library`

- **游客视图**：展示本机兑换记录（每日计划卡 + 已兑换内容）+ 醒目注册横幅
  「注册账号，永久保存你的权益」（换设备会丢失）。
- **登录视图**：`GET /api/library` 为权威（每日计划卡：永久/剩余天数/已过期续费入口 + 内容列表）；
  本机有未同步记录时提示「一键同步到账号」（`POST /api/library/sync`，逐条展示结果）；
  顶部显示邮箱 + 退出。

### 每日推荐 `/daily`（非 Tab，从选购页区块进入）

- 三段式：`force-dynamic` 页头 → `DailyServer`（SSR 只查日期/标题/封面的 teaser 列表，**不含私有内容**）→ `DailyClient`。
- 挂载后调 `/api/daily-access` 现算解锁状态：未解锁/过期 → 今日卡显示「订阅每日计划开启」+ 历史列表标题可见但内容带锁（teaser 促销）；
  已解锁 → 今日内容完整展示 + 全部历史仓库可点开（按需调 `/api/daily-content` 取 1h 签名 URL，组件内缓存）。
- 游客凭证 = 本机库中已核销的解锁码；登录用户 = Bearer。

### TabBar（`components/layout/TabBar.tsx`）

- 固定底部，`.glass` 毛玻璃 + 发丝顶边，`pb-safe` 适配 iPhone 底部横条；6 个 Tab。
- 高亮：`/` 精确匹配，其余 `startsWith`；选中蓝色 + 图标加粗，按压 `scale-95`。
- 愿望单角标：条目数（非件数）实时计数，`>99` 显示 `99+`，
  数字变化触发 `animate-badge-pop` 弹跳；挂载后才渲染，避免 SSR 水合不一致。

---

## 管理后台

入口 `/admin`（→ 重定向 `/admin/major-units`）。
`(panel)/layout.tsx` 在**服务端**校验 `admin_session` cookie，
未登录/过期 `redirect('/admin/login')`；后台整组 `robots: noindex`。

### AdminShell

- `md` 及以上：左侧固定导航栏；移动端：顶栏 + 横向滚动胶囊 Tab。
- 导航 4 项：大单元 / 小单元 / 活动 / 订阅；「退出登录」调
  `POST /api/auth/logout`（失败也强制跳回登录页）。

### 四个 Manager 的通用模式

`MajorUnitsManager / SubUnitsManager / ActivitiesManager / SubscriptionsManager`
共享同一套交互骨架：

- 挂载即 `load()` 拉列表（按 `sort_order` 升序），加载/空态占位行。
- 新增/编辑共用一个 `Modal` 表单（移动端底部抽屉、桌面居中，`createPortal` 挂载）；
  删除走 `ConfirmDialog` 二次确认（红色危险按钮，`busy` 时禁止关闭）。
- 操作结果顶部 `Notice` 反馈，2.5s 自动消失；请求用 `adminFetch`（401 自动跳登录）。

各模块字段与校验：

| 模块 | 表单字段 | 校验/细节 |
| --- | --- | --- |
| 大单元 | name*、图片、链接、排序 | name ≤60；删除确认提示**级联删除其下所有小单元** |
| 小单元 | name*、所属大单元*、价格、付款链接、**兑换商品**、排序 | 价格 ≥0 且四舍五入到分；无大单元时提示先创建；支持「按大单元筛选」 |
| 活动 | 标题、卡片图片、介绍、链接、**兑换商品**、排序 | 标题与介绍至少填一项；介绍 ≤600；图片建议 16:9 |
| 订阅 | name*、价格、时长徽章、详细介绍、付款链接、**兑换商品**、排序 | 时长文案 ≤20；详细介绍 ≤600 |

> **兑换商品**：三类商品均可上传一份不公开内容（图片 / 视频 / 文档，表格列缩略图
> 或类型图标展示）。买家在「兑换」页输入卡密成功后弹出该内容，即卡密的兑付凭证。

### 文件上传（`ImageUploader` / `FileUploader`）

- `ImageUploader`（活动卡片图等公开图）：前端预校验 JPG/PNG/WebP、≤5MB。
- `FileUploader`（兑换商品）：图片 JPG/PNG/WebP/GIF ≤5MB、视频 MP4/WebM ≤50MB、
  文档 PDF/TXT ≤10MB；规则集中在 `lib/upload.ts`，服务端二次校验。
- `XMLHttpRequest` 上传拿**真实进度条**；支持点击选择与拖拽（拖入高亮）；
  已有内容按类型预览（图片 / 视频播放器 / 文档图标）+ 「替换 / 移除」。
- 上传成功返回的 `url` 直接写入表单的 `image_url` / `redeem_image_url` 字段。

---

## 发卡管理与兑换

本站不做站内支付：选购 → 愿望单 → **外跳第三方发卡平台（酷发卡）付款** →
第三方把卡密发给买家。管理员再把第三方发出的卡密**手动搬运**进本站后台
（批量导入），买家凭卡密到前台「兑换」Tab 兑换。

### 后台 · 发卡管理（`/admin/card-management`）

| 页面 | 功能 |
| --- | --- |
| 概览 | 指标卡（商品数 / 卡密总数 / 已发放 / 剩余库存 / 今日发放）+ 各商品库存明细 |
| 卡密商品 | **多态关联**：新建/编辑时选择关联类型（小单元 / 活动 / 订阅）+ 联动目标下拉；一个对象至多一个卡密商品（已占用选项禁用）；行内启用/禁用、导入入口；删除时若仅有未使用/已作废卡密可确认连带清空，有已发放卡密或取卡登记仍禁止删除 |
| 卡密库存 | 按商品/状态/订单号/发放时间筛选分页；作废 / 恢复 / 重新发放（售后补发）状态机；「清空卡密」批量删除（限未使用/已作废，已发放不受影响） |
| 批量导入 | txt/csv 原文粘贴导入，批内/库内去重（可切严格模式），明细分组统计 |
| 取卡登记 | 录入订单号 + 商品 + 数量生成取卡码，供旧取卡流程（`/api/card-management/deliver`）使用 |

### 卡密状态机

```
导入 → unused（未使用）
        ├─ 兑换核销 / 取卡发放 → issued（已发放，order_id 可空）
        │      ├─ void（作废，坏卡）
        │      └─ reissue（重新发放：售后补发，回 unused）
        └─ void（作废） → restore（恢复：回 unused）
```

### 兑换流程（`POST /api/redeem`，公开，限速约 30 次/分钟）

1. 归一化卡密（trim；空 → 400，超 500 字符 → 400）。
2. 按 `content` 精确查 `card_keys`：查不到或仅有作废 → **统一 403「兑换码不正确，请核对后再试」**
   （真实原因只进服务端日志，防枚举）。
3. 多行命中时优先 `unused`，其次 `issued`（允许买家重复查看已兑换内容）。
4. **先读商品再核销**：商品未关联目标 → **409「该商品暂未配置兑换内容，请联系客服」**（不核销）。
5. 核销：`unused` 行 CAS 更新为 `issued`（`issued_at=now()`，`order_id` 保持 null）；
   并发被抢先时重读——已发放则幂等返回，被作废按 403。
6. **按 `redeem_type` 分流**：
   - `content`：目标表取名称与 `redeem_image_url`（未配置 → 409 不核销），返回兑换内容；
   - `unlock_daily`：无需兑换图，有效期 = 商品 `unlock_duration_days`（null = 永久），
     返回解锁成功卡。
7. **带 Bearer（已登录）**：CAS 绑定卡密（`where bound_user_id is null`）→ 仅**新绑定**时写权益：
   每日计划走 `grant_daily_plan` RPC 原子叠加延期，content 插快照权益（23505 幂等忽略）。
   已绑定（本人重复兑换）不再发放，只回显现有权益状态；游客不写权益，码存本机库。

---

## API 参考

所有路由 `export const dynamic = 'force-dynamic'`。
响应约定（`lib/api.ts`）：成功直接返回数据对象/数组；失败 `{ "error": "信息" }`。

**鉴权**：`GET` 公开；`POST / PUT / DELETE`（含 `/api/upload`）必须带有效会话，
否则 `401 { error: "未登录或登录已过期" }`。
未配置 Supabase 时一律 `503 SUPABASE_NOT_CONFIGURED`。

四个资源路由完全同构（下表以 major-units 为例）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/major-units` | 列表（sort_order, created_at 升序） |
| POST | `/api/major-units` | 新建。body：`name*`、`image_url?`、`link_url?`、`sort_order?` → 201 返回完整记录 |
| GET | `/api/major-units/:id` | 单条；不存在 404 |
| PUT | `/api/major-units/:id` | **局部更新**：只更新 body 中出现的字段；空 patch 返回 400 |
| DELETE | `/api/major-units/:id` | 删除（数据库级联删子表）→ `{success, id}` |

兼容写法：集合路径也接受 `PUT`（body 带 `id`）与 `DELETE`（`?id=` 或 body 带 `id`），
内部转发到 `[id]` 路由。

各资源差异点：

- `GET /api/sub-units?major_unit_id=xxx` 支持按大单元过滤；
  `POST` 必填 `major_unit_id` + `name`，`price` 非有限数时落 0。
- `POST /api/activities`：`title / image_url / description / link_url` **至少提供一项**。
- `POST /api/subscriptions`：必填 `name`，其余可选。
- 价格类字段（`price`）以 number 提交；空字符串文本统一归一为 `null`（`toNullableText`）；
  `sort_order` 非 number 归一为 0（`toSortOrder`）。

其他：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/redeem` | **公开**，卡密兑换（限速）。body `{code}`，可带 Bearer 顺带绑定账号。content → `{ result_type:'content', product_name, product_description, image_url, redeemed_now, bound }`；unlock_daily → `{ result_type:'unlock', product_name, permanent, expires_at, redeemed_now, bound }`；无效码统一 403，未配置兑换内容 409（不核销） |
| POST | `/api/daily-access` | 校验每日计划解锁状态（限速）。凭证二选一：Bearer（登录）或 body `{code}`（游客码）。服务端按 `issued_at + 有效天数` 现算，**不信客户端日期**；返回 `{ unlocked, permanent, expires_at, remaining_days }` |
| POST | `/api/daily-content` | 取某日内容（限速）。body `{pick_date, code?}` 或 Bearer。先校验解锁 → `{ title, description, link_url, media_kind, media_url }`，media_url 为私有桶 1h 签名 URL（`cacheControl: private`） |
| GET/POST | `/api/daily-picks` | 后台每日推荐列表（附现签预览链接）/ 新建（一天一条，23505 → 409） |
| PUT/DELETE | `/api/daily-picks/:id` | 后台局部更新 / 删除 |
| GET | `/api/library` | **Bearer**。我的库：`{ user, daily_plan, daily_status, contents }` |
| POST | `/api/library/sync` | **Bearer**。body `{codes[]}`（≤20），本机码逐条绑定并逐条返回结果（成功/已绑定/被他人绑定/未核销/无效） |
| GET | `/api/entitlements` | 后台权益列表（附实时状态/剩余天数/来源码掩码），`?kind=` 过滤 |
| POST | `/api/entitlements/:id/extend` | 后台延长：`{days}` 叠加（过期从当前时刻起算）或 `{permanent:true}` 置永久；永久权益拒绝按天延长 409 |
| POST | `/api/entitlements/:id/revoke` | 后台撤销：删权益 + 作废关联卡密（每日计划会作废该用户名下全部解锁码），防重放复活 |
| POST | `/api/upload` | multipart/form-data 字段 `file`（图片 ≤5MB / 视频 ≤50MB / 文档 ≤10MB，见 `lib/upload.ts`）+ `bucket`（`images` 默认 / `daily` 私有，返回 `{path, url:1h签名}`）→ `201 { path, url }` |
| POST | `/api/auth/login` | body `{password}`；成功 `Set-Cookie: admin_session`（7 天）；密码错 401；未配置 `ADMIN_PASSWORD` 503 |
| POST | `/api/auth/logout` | 清除会话 cookie |

发卡管理（均需登录；列表响应附带 `target_name` / `description` 等关联名称）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/card-management/products?enabled=&include_stats=1` | 卡密商品列表（含库存统计与关联目标名） |
| POST | `/api/card-management/products` | body `{target_type*, target_id*, description?, enabled?, sort_order?}`；目标不存在 400，已被关联 409 |
| GET/PUT/DELETE | `/api/card-management/products/:id` | 单条（附库存统计）/ 局部更新（改关联需成对提供并校验唯一性）/ 删除（有卡密或登记时 409；`?cascade_keys=1` 先清空未使用/已作废卡密再删商品，已发放或登记仍 409） |
| GET | `/api/card-management/keys?card_product_id=&status=&order_id=&issued_from=&issued_to=&page=&page_size=` | 卡密分页列表（按导入时间倒序） |
| DELETE | `/api/card-management/keys?card_product_id=` | 批量清空该商品下未使用/已作废卡密（已发放不动）→ `{deleted}` |
| POST | `/api/card-management/keys/import` | body `{card_product_id, raw, format?, skip_duplicates?}` → 201 导入明细 |
| PUT | `/api/card-management/keys/:id/status` | body `{action: void/restore/reissue}`，状态机校验，乐观并发保护 |
| GET/POST | `/api/card-management/deliveries` | 取卡登记列表 / 登记（生成 `claim_token`） |
| PUT | `/api/card-management/deliveries/:id/cancel` | 取消登记 |
| POST | `/api/card-management/deliver` | **公开**，买家凭订单号 + 取卡码自助取卡（旧流程） |
| GET | `/api/card-management/stats?card_product_id=` | 库存统计（全局 `by_product` 或单商品） |

> ⚠️ PostgREST 单请求最多返回 1000 行：凡需全表扫描的库存统计一律走
> `lib/card-stats.ts` 的分块聚合（按 id 分页抓全再 JS 汇总），
> 不要直接 `select` 全表，否则卡密超过 1000 条时统计会被静默截断。

---

## 鉴权机制

`lib/auth.ts` —— 无状态 HMAC 会话（无服务端存储）：

- token 结构：`<过期时间戳>.<sha256-hmac>`，有效期 **7 天**；
  HMAC 密钥 = 环境变量 `ADMIN_PASSWORD`（故必须设为强密码）。
- cookie：`admin_session`，`httpOnly` + `sameSite=lax`，生产环境 `secure`。
- 密码比较与签名比较均使用 `timingSafeEqual`（防时序攻击）。
- 校验入口：路由用 `checkAdmin(req)`，服务端布局用 `verifySessionToken(token)`。

---

## 愿望单机制

`lib/wishlist.ts` —— 极简外部 store（语义与 Zustand 一致，可平滑替换）：

- **存储**：`localStorage`，key = `apple-store.wishlist.v1`；
  条目结构 `{ sub_unit_id, name, price, payment_url, quantity }`（冗余快照，
  商品改名/改价不影响已收藏条目）。
- **订阅**：`useSyncExternalStore`；SSR 快照恒为空数组，避免水合不一致；
  监听 `storage` 事件实现**跨标签页同步**。
- **API**：`wishlistStore.{subscribe,getSnapshot,has,count,toggle,remove,setQuantity,clear}`；
  React 侧用 `useWishlist()` → `{items, count, has, toggle, remove, setQuantity, clear}`。
- 数量钳制 1–99；写入失败（隐私模式等）静默降级为内存态。

---

## 图片上传方案

- 桶：`images`（公开读），schema.sql 中建好。
- 流程：后台 `ImageUploader` → `POST /api/upload`（带会话）→
  服务端 service_role 写入 `images/products/...` → 返回 `{path, url}` →
  `url` 直接作为记录的 `image_url` 入库。
- 展示：`next/image` 已配置 `**.supabase.co` 的 `remotePatterns`；
  前台内容图实际用 `<img loading="lazy" decoding="async">` + 骨架占位。

---

## 设计系统（Tailwind Tokens）

`tailwind.config.ts` 定义，对标 apple.com/store：

| Token | 值 | 用途 |
| --- | --- | --- |
| `apple-bg` | `#F5F5F7` | 页面雾灰白底 |
| `apple-surface` | `#FBFBFD` | 次级区块 |
| `apple-card` | `#FFFFFF` | 卡片 |
| `apple-text` / `text-2` / `text-3` | `#1D1D1F` / `#6E6E73` / `#86868B` | 主/次/弱文字 |
| `apple-blue` | `#0071E3` | **全站唯一强调色**（CTA/选中/链接），另有 `blue-hover/active/soft` |
| `apple-border` / `hairline` | `#D2D2D7` / `rgba(0,0,0,.08)` | 描边 / 发丝线 |
| `apple-success(-soft)` | `#1D8A3E` | 极少量成功绿 |
| 圆角 | `btn 980px`（胶囊按钮）、`card 20px`、`card-lg 24px`、`hero 28px` | |
| `max-w-page` | `1024px` | 页面内容最大宽（桌面收拢） |
| 字体 | SF Pro 系统字体栈，中文回退苹方/思源 | |
| 动画曲线 | `apple` 克制 150–250ms、`apple-pop` 轻微过冲（仅角标） | |

`globals.css` 工具类与动效：

- `.pb-safe` / `.pt-safe`：iOS 安全区；`.glass`：毛玻璃（`blur(20px) saturate(1.8)`）。
- 动画：`page-enter`（路由淡入 200ms）、`fade-in`、`sheet-in`（底部抽屉 300ms iOS 曲线）、
  `pop-in`（桌面弹窗）、`badge-pop`（角标弹跳 400ms）、`skeleton` shimmer（1.4s）。
- 全部动画尊重 `prefers-reduced-motion: reduce`；移动端去除点击灰色高亮；
  `overscroll-behavior-y: none`。

---

## 环境变量与本地启动

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `SUPABASE_URL` | ✅ | 项目地址（形如 `https://xxxx.supabase.co`） |
| `SUPABASE_ANON_KEY` | ✅ | 匿名公钥（仅服务端读取回退用，见下） |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 服务端写入密钥，**严禁进前端** |
| `ADMIN_PASSWORD` | ✅ | 后台密码 + 会话 HMAC 密钥，设强密码 |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 浏览器端 supabase-js 邮箱登录必需；**构建期内联**，改后必须重新构建 |

```bash
npm install
copy .env.local.example .env.local    # Windows；macOS/Linux 用 cp
npm run dev                           # http://localhost:3000
```

- 不配置 Supabase 也能启动：前台展示演示数据，后台写操作报 503。
- `npm run build` 等价于 Netlify 构建，提交前必须零报错。

---

## Supabase 初始化

1. 创建 Supabase 项目。
2. SQL Editor 粘贴执行 `supabase/schema.sql`
   （pgcrypto 扩展 + 4 表 + 索引 + RLS 公开读 + `images` 公开桶；已含迁移 001）。
3. **依次执行增量迁移**（均已幂等化，可安全重跑）：
   - `supabase/migrations/002_card_management.sql` — 发卡管理三表
     （`card_products` / `card_keys` / `card_deliveries`）+ FIFO 发放 RPC；
   - `supabase/migrations/003_redeem.sql` — 三商品表补 `redeem_image_url`；
     `card_products` 多态化（`target_type + target_id`，回填旧 `sub_unit_id`，
     目标删除触发器）；
   - `supabase/migrations/004_subscription_description.sql` — 订阅详细介绍列；
   - `supabase/migrations/005_daily_plan.sql` — 每日推荐 + 用户权益：
     `daily_picks` 表、`daily` 私有桶、`card_products` 兑换类型/有效天数、
     `card_keys` 绑定账号、`user_entitlements` 权益表、`grant_daily_plan` RPC。
4. **邮箱登录设置**（Supabase Dashboard → Authentication → Providers → Email）：
   关闭 **Confirm email**（否则注册需邮件确认，默认 SMTP 限 2 封/小时）；
   如需「忘记密码」邮件稳定收发，可另配自定义 SMTP。
5. 验证：Table Editor 可见 9 张表；Storage 可见 `images`（Public）与 `daily`（Private）。
6. 后续表结构变更：新增迁移文件到 `supabase/migrations/`（仿照现有文件，
   写成幂等语句），在 SQL Editor 执行。

---

## 部署（Netlify）

1. 推仓库 → Netlify **Add new site → Import**。
2. `netlify.toml` 自动接管：`npm run build`、publish `.next`、`NODE_VERSION=20`、
   `@netlify/plugin-nextjs`（SSR/API → Functions）、`/_next/static/*` 一年 immutable。
3. 在 **Site settings → Environment variables** 配置上表变量 → Deploy。
4. `git push` 自动构建（1–3 分钟）；新增环境变量后建议
   `Trigger deploy → Clear cache and deploy`。

> ⚠️ 本项目是 **SSR 架构而非 SPA**：不要添加 `/* → /index.html` 之类
> `_redirects` 回退，详见 `DEPLOY.md`。

---

## SEO 与性能

- 每页独立 `title` / `description`（模板 `%s · Zorvin`）；
  `viewport` 含 `viewportFit=cover` 适配刘海屏。
- `robots.ts`：前台允许收录，`/admin/`、`/api/` 禁止；后台布局另加 `noindex`。
- 图标：`icon.svg` + `apple-icon.png`（`node scripts/generate-icons.mjs` 零依赖生成）。
- 图片懒加载 + 骨架屏；App Router 按路由分包；前台查询只 select 渲染必需字段；
  业务页全部 `force-dynamic`（数据实时性优先）。

---

## 每日计划与用户体系

迁移 005 引入的完整业务闭环：**管理员每天上传 1 条「每日推荐」→ 买家在第三方平台
付款拿解锁码 → 站内输码解锁（有效期由后台决定）→ 选购页区块常驻开启 →
每天看今日更新 + 全部历史仓库**；配合邮箱账号把权益永久存入「我的库」。

### 业务规则要点

- **解锁凭证两级**：登录用户 = Bearer（`user_entitlements` 为权威）；
  游客 = 已核销的解锁码本身（服务端按 `issued_at + unlock_duration_days` 现算有效期，
  不信客户端存的日期）。「今日」按**北京时区**比对。
- **有效期**：`unlock_duration_days` 在卡密商品上配置（null = 永久），自核销时刻起算；
  同一用户多个码经 `grant_daily_plan` RPC **原子叠加**（并发不丢延期）。
- **游客 → 注册找回**：游客兑换写本机库（`apple-store.library.v1`）；注册登录后
  「我的库」出现同步提示，`POST /api/library/sync` 逐码 CAS 绑定 + 发放权益，逐条回结果。
- **内容防盗**：每日内容文件存私有桶 `daily`，前台只能拿到服务端现签的 1h 签名 URL；
  封面（`cover_url`）存公开 `images` 桶，作未解锁时的营销 teaser。
- **后台权益管理**（`/admin/library`）：延长（按天叠加 / 置永久）；
  撤销 = 删权益 + 作废该用户名下全部解锁码（防重放复活，弹窗内有说明）。
- **限速**（`lib/rate-limit.ts`，内存尽力而为）：redeem 30/min · daily-access 40/min ·
  daily-content 60/min · library-sync 10/min。

### 上线手动步骤（新装 / 升级都要做）

1. Supabase SQL Editor 执行 `supabase/migrations/005_daily_plan.sql`
   （幂等，可安全重跑；含 `grant_daily_plan` RPC）。
2. Supabase Dashboard → Authentication → Providers → Email：**关闭 Confirm email**；
   如需「忘记密码」邮件稳定收发，建议配置自定义 SMTP（可后补）。
3. `.env.local` 与 **Netlify 环境变量**补上 `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`（构建期内联，改后必须重新部署）。
4. 后台按序配置：订阅管理建「每日计划」→ 卡密商品建「解锁每日计划」类型并设有效天数
   （留空 = 永久）→ 批量导入码 → 每日推荐上传当天内容。
5. 验证：游客输码解锁 → 选购页区块变解锁态 → `/daily` 可看今日与历史；
   注册登录后我的库出现权益。

---

## 扩展指南：如何加新功能

项目模式高度模板化，加新模块按以下步骤照抄即可。

### A. 新增一个数据模块（以 `coupons` 优惠卡为例）

1. **数据库**：`supabase/schema.sql` 末尾追加建表（含 `sort_order`、`created_at`、
   sort 索引），并补一条**幂等**迁移到 `supabase/migrations/`（已上线项目只执行迁移）：
   ```sql
   alter table public.coupons enable row level security;
   create policy "public: read coupons" on public.coupons for select using (true);
   ```
2. **类型**：`src/lib/types.ts` 加 `Coupon` interface（字段与列一一对应）。
3. **API**：复制 `src/app/api/activities/` 整个目录为 `src/app/api/coupons/`，
   全局替换表名，按字段调整 `POST` 校验与 `PUT` patch 白名单。
   （集合路由的 `PUT/DELETE` 兼容写法、`force-dynamic`、`checkAdmin`、
   `isSupabaseConfigured` 503 都保留。）
4. **后台**：仿 `ActivitiesManager.tsx` 新建 `CouponsManager.tsx`（复用
   `adminFetch / Modal / ConfirmDialog / ImageUploader / ui.tsx`），
   新建 `src/app/admin/(panel)/coupons/page.tsx`，并在 `AdminShell.tsx`
   的导航数组加一项。
5. **前台**：需要新 Tab 时，新建 `src/app/(store)/coupons/page.tsx`（header +
   `Suspense` + `XxxServer` + `XxxSkeleton` 三件套，照抄 `activities/`），
   在 `TabBar.tsx` 加 Tab 项；不做 Tab 也可直接挂普通路由。
6. **验证**：`npm run build` 零报错；本地走一遍后台增删改 + 前台展示。

### B. 给现有表加字段

1. 写迁移（`alter table ... add column if not exists`）并执行；
2. `lib/types.ts` 加字段；
3. 对应 `route.ts` 的 `POST` 插入对象与 `[id]/route.ts` 的 `PUT` patch 白名单加字段；
4. 后台 Manager 表单 + 前台展示组件渲染新字段；
5. 若字段是价格类：入库用 number，读出后用 `toNumber` 归一（numeric 返回字符串）。

### C. 复用清单（写新功能前先看看）

| 需求 | 直接用 |
| --- | --- |
| 服务端取数 + 骨架 + 错误态 | 照抄 `ActivitiesServer` + `Suspense` + `DataError` |
| 后台表格 + 弹窗表单 + 删除确认 | `admin/ui.tsx` 原子组件 + `Modal` + `ConfirmDialog` |
| 图片字段 | `ImageUploader`（自带进度/预览/上传） |
| 空态 / 加载失败 | `EmptyState` / `DataError` |
| 价格显示 | `formatPrice`（`¥xx.xx`，自动兜底 `¥0.00`） |
| 本地状态持久化 | 参考 `wishlist.ts` 的 `useSyncExternalStore` 模式 |
| 弹层/抽屉 | `Modal`（移动底部抽屉、桌面居中，已处理滚动锁与 Esc） |

---

## 已知约定与坑

- **所有业务页与 API 均 `force-dynamic`**：不要误加 `revalidate`/静态导出，
  否则后台改动前台不会实时可见。
- **`supabaseAdmin()` 只能出现在服务端**（Server Component / API Route），
  严禁被 `'use client'` 代码 import（service_role 会泄露进前端产物）。
- **Supabase `numeric` 列返回字符串**：所有价格先过 `toNumber` 再运算/显示。
- **`page-enter` 动画结束帧必须是 `transform: none`**（globals.css 有注释）：
  任何残留 transform 都会成为 `fixed` 后代的包含块，导致后台 Modal 定位错乱。
- **Modal 用 `createPortal` 挂到 `document.body`**：防祖先 `transform/filter`
  劫持 `fixed` 定位；新弹层请沿用。
- **愿望单数据是客户端快照**：收藏后商品改价不会同步（按收藏时价格结算）。
- **删除大单元级联删小单元**：数据库外键 `on delete cascade`，后台已有警示文案。
- **不要加 SPA 回退重定向**（`_redirects`），SSR 路由由 Netlify 插件全权接管。
- **两套鉴权严格分离**：后台管理员 = HMAC cookie（`checkAdmin`），用户 = Supabase
  Bearer（`getRequestUser`），互不接受；用户接口勿用 `checkAdmin`，反之亦然。
- **用户 token 现取现用**：每次调 API 经 `getAuthHeaders()`（内部 `getSession()`）
  拿最新 token，禁止模块级缓存（supabase-js 会自动刷新，缓存会拿到过期 token）。
- **游客解锁码即凭证**：错误文案统一（不存在/作废同句）防枚举；有效期一律服务端
  按 `issued_at + 有效天数` 现算，前端存的日期只作本机回显。
- 未接 ESLint：新增代码请自行保证质量，或顺手补上 lint 配置。
