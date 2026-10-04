# GitHub 推送与下月部署清单

> 记录时间：2026-10-01
> 当前状态：本轮代码已完成并通过 `npm run build`；043 迁移已于 2026-10-01 执行并验证；Netlify 积分已用完，暂不部署。

## 当前 Git 状态

- 分支：`fix/coupon-vip`
- 远端：`git@github.com:Czc147/apple-store-site.git`
- 远端名：`origin`
- 当前 HEAD：`7834348 feat(admin): P7 订阅编辑器预览区 —— 预览即实际渲染`
- 本地有未提交修改：优惠券/订单/拼单修复、Supabase Auth 站内代理、账号中枢、数据中心、预上线与推广计划
- `TODO.md` 按原说明保持未跟踪，不要混入功能提交

## 本次必须一起提交的内容

1. 数据库迁移：
   - `supabase/migrations/037_coupon_scope_abuse_and_order_transactions.sql`
   - `supabase/migrations/038_claim_coupon_compatibility.sql`
   - `supabase/migrations/039_coupon_thresholds_and_blocks.sql`
   - `supabase/migrations/040_admin_account_management.sql`
   - `supabase/migrations/041_data_center_and_prelaunch.sql`
   - `supabase/migrations/042_referral_program.sql`
   - `supabase/migrations/043_auth_recovery_and_risk_settings.sql`
2. Supabase Auth 站内代理：
   - `src/app/api/supabase/auth/[...path]/route.ts`
   - `src/lib/supabase/client.ts`
3. 领券防刷：
   - `src/lib/claim-fingerprint.ts`
   - `src/lib/device-id.ts`
   - `src/app/api/coupons/claim/route.ts`
   - `src/components/coupons/CouponClaimList.tsx`
   - `src/lib/rate-limit.ts`
4. 优惠券使用范围与限额：
   - `src/lib/coupon-types.ts`
   - `src/lib/coupons-server.ts`
   - `src/app/api/coupons/validate/route.ts`
   - `src/app/api/admin/coupons/route.ts`
   - `src/components/admin/CouponsManager.tsx`
   - `src/components/coupons/coupon-row-adapter.ts`
5. 订单事务、顶单、状态竞态、订阅多数量：
   - `src/app/api/orders/route.ts`
   - `src/app/api/orders/[id]/confirm/route.ts`
   - `src/app/api/orders/[id]/cancel/route.ts`
6. 拼单并发：
   - `src/app/api/group-buys/[id]/route.ts`
7. 公开接口字段白名单：
   - `src/app/api/activities/route.ts`
   - `src/app/api/sub-units/route.ts`
   - `src/app/api/subscriptions/route.ts`
8. 前台账号中枢与四 Tab 排版：
   - `src/app/(store)/layout.tsx`
   - `src/components/layout/AccountHub.tsx`
   - `src/components/layout/TabBar.tsx`
   - `src/components/library/LibraryClient.tsx`
   - `src/components/library/RecentOrdersCard.tsx`
   - `src/app/api/account/route.ts`
9. 后台账号管理 P0：
   - `src/app/admin/(panel)/users/page.tsx`
   - `src/components/admin/UsersManager.tsx`
   - `src/components/admin/AdminShell.tsx`
   - `src/app/api/admin/users/route.ts`
   - `src/app/api/admin/users/[id]/route.ts`
   - `src/lib/profiles-server.ts`
10. 数据中心与预上线：
   - `src/app/api/admin/stats/route.ts`
   - `src/components/admin/StatsManager.tsx`
   - `src/app/admin/(panel)/prelaunch/page.tsx`
   - `src/components/admin/PrelaunchManager.tsx`
   - `src/app/api/admin/publications/route.ts`
   - `src/app/api/admin/publications/run/route.ts`
11. 后台菜单与公开内容过滤：
   - `src/components/admin/AdminShell.tsx`
   - `src/app/api/activities/route.ts`
   - `src/app/api/activities/[id]/route.ts`
   - `src/app/api/sub-units/route.ts`
   - `src/app/api/sub-units/[id]/route.ts`
   - `src/app/api/subscriptions/route.ts`
   - `src/app/api/home-sections/route.ts`
   - `src/app/api/daily-content/route.ts`
   - `src/app/api/search/route.ts`
   - `src/components/activities/ActivitiesServer.tsx`
   - `src/components/shop/ShopServer.tsx`
   - `src/components/shop/DailyPickServer.tsx`
   - `src/lib/orders-server.ts`
   - `src/lib/group-buy-server.ts`
   - `src/lib/types.ts`
12. 推广计划与液态玻璃修复：
   - `src/app/(store)/referrals/page.tsx`
   - `src/app/admin/(panel)/referrals/page.tsx`
   - `src/components/referral/ReferralClient.tsx`
   - `src/components/referral/ReferralCapture.tsx`
   - `src/components/admin/ReferralsManager.tsx`
   - `src/components/layout/AccountHub.tsx`
   - `src/app/api/referrals/me/route.ts`
   - `src/app/api/admin/referrals/route.ts`
   - `src/app/api/referrals/bind/route.ts`
   - `src/app/api/admin/referrals/route.ts`
   - `src/lib/referral-client.ts`
   - `src/components/auth/AuthClient.tsx`
   - `src/components/ui/GlassSurface.tsx`
   - `src/app/globals.css`
13. 无邮箱认证、密码机器人与风控：
   - `src/lib/login-verification.ts`
   - `src/app/api/auth/login-events/route.ts`
   - `src/app/api/auth/password-reset/verify/route.ts`
   - `src/app/(store)/password-reset/page.tsx`
   - `src/components/auth/PasswordResetBotClient.tsx`
   - `src/app/api/account/status/route.ts`
   - `src/app/api/admin/coupon-risk/route.ts`
   - `src/components/admin/CouponsManager.tsx`

## 推送前检查

### 2026-09-30 迁移状态

- 037 迁移已执行成功。
- 远端已确认 `coupons.allowed_scopes` 与 `coupon_claims.ip_hash / device_hash` 均存在。
- 038 兼容迁移已执行成功，当前线上旧代码可继续领券。
- 038 会在下月新版部署后再随下一轮清理移除。
- 039 迁移已执行成功：收紧领券阈值并新增轻量封禁表。
- 039 生效后的阈值：同设备 1 张 / 24h，同 IP 2 张 / 24h。
- 039 轻量封禁：第 1 次违规冷却 24 小时，第 2 次冷却 7 天，第 3 次永久封禁该设备/IP 领取该券。
- 040 迁移已执行成功：新增后台账号备注与 `admin_audit_logs` 审计表。
- 041 迁移已执行成功：数据中心聚合 RPC、预上线队列表、内容 enabled 开关与 pg_cron 任务。
- 041 若 Supabase 未启用 `pg_cron`，迁移仍会保留手动执行接口 `/api/admin/publications/run`；部署后需确认 cron 任务存在。
- 042 迁移已执行成功：新增推广配置、推广码、邀请记录、邀请事件与奖励发放 RPC。
- 043 迁移已执行成功：新增无邮箱密码机器人、登录事件、分级封禁、领券风控配置、推广文案与透明风控字段。
- 下月部署时无需重复执行 037–043；只需在上线前抽查表和 RPC 是否仍存在。

### 下月部署计划

### 2026-10-01 本地验证

- `npm run build` 通过，无 TypeScript / Next 编译错误。
- 本地路由验证：`/login?mode=old-reset`、`/login?mode=forgot`、`/password-reset`、`/referrals` 均返回 200。
- 未登录接口验证：`/api/account/status`、`/api/referrals/me`、`/api/admin/coupon-risk` 均返回 401。
- 密码机器人空请求验证：`POST /api/auth/password-reset/verify` 返回 400。
- 2026-10-01 执行 043 后：四张新表、`profiles.must_change_password`、推广透明风控字段、相关 RPC 均验证存在。
- 2026-10-01 临时账号链路验证：登录事件 200、账号状态 200、推广概览 200，测试账号已删除。
- 2026-10-01 公开注册验证：返回 `session=true`，说明当前 Supabase 已不要求邮箱确认；测试账号已删除。
- 真实领券、真实封禁、客服机器人核身和推广奖励链路仍需在页面中人工验收。

### 2026-10-04 部署执行记录（Netlify 积分已恢复）

- `npm run build` 重新通过：50 个页面 + 全部 API 路由零报错（等价 Netlify 构建步骤）。
- 上线前复查（PostgREST + service_role 探测，42 项全绿）：
  - 037–043 新增表全部存在：`coupon_claim_blocks`、`admin_audit_logs`、`coupon_risk_settings`、
    `auth_login_events`、`password_reset_attempts`、`account_restrictions`、
    `scheduled_publications`、`publication_logs`、`referral_settings`、`referral_codes`、
    `referral_invites`、`referral_events`。
  - 关键列全部存在：`coupons.allowed_scopes`、`coupon_claims.ip_hash / device_hash / source_referral_invite_id`、
    `profiles.account_note / must_change_password`、`referral_settings.share_text`、
    `sub_units / activities / subscriptions / daily_picks.enabled`。
  - 15 个 RPC 全部存在：`claim_coupon`、`grant_subscription_coupon`、`supersede_coupon_for_order`、
    `join_group_buy`、`create_order`、`admin_data_center_stats`、`create_scheduled_publication`、
    `process_scheduled_publications`、`admin_update_scheduled_publication`、`get_or_create_referral_code`、
    `bind_referral_invite`、`grant_referral_coupon`、`process_referral_rewards`、
    `admin_update_referral_invite`、`get_referral_overview`。
  - 公开注册复测：`POST /auth/v1/signup` 返回 200 且 `session=true`（无需邮箱确认）；测试账号已删除，`profiles` 无残留。
  - `pg_cron` 任务无法用 REST 探测（本机没有 DB 密码），部署后改由后台「预上线」页或
    `POST /api/admin/publications/run` 手动执行验证。
- 提交并推送：`fix/coupon-vip` 推到 origin；`main` 快进到同一提交后推送（Netlify 生产分支是 `main`，push 即上线）。
- 远端旧分支 `fix-china-auth-proxy`（同源 auth 代理实验）已被本轮站内代理 `/api/supabase/auth/[...path]` 取代，未合入。

- 时间：Netlify 积分恢复后的下一个月
- 顺序：
   1. 复查 Supabase 公开注册仍返回 `session=true`（当前已验证，不需要邮箱确认）
   2. 复查 037–043 数据库迁移结果
   3. 提交并推送 `fix/coupon-vip`
   4. Netlify 部署
   5. Android 未开加速器测试注册/登录
   6. 验证优惠券、订单、拼单修复
   7. 验证后台可配置同设备 / 同 IP 领券阈值与轻量封禁
   8. 验证头像抽屉、四 Tab、账号管理 P0
   9. 验证数据中心、后台二级菜单与预上线定时发布
   10. 验证推广链接注册归因、风控阈值、延迟发放与人工审核
   11. 验证游客头像抽屉的「注册」入口进入 `/login?mode=register`，不再出现 404
   12. 验证推广拒绝原因会展示给用户，后台拒绝必须填写原因
   13. 验证临时限制登录、永久限制登录、仅限制领券、仅限制推广奖励四类封禁
   14. 验证旧密码修改和客服机器人临时密码两条找回路径

1. 确认不会提交 `.env.local`：
   - `git status --short`
   - `git diff --cached --name-only`
2. 重新构建：
   - `npm run build`
3. 迁移执行状态：
   - 037–043 均已在当前 Supabase 项目执行成功。
   - 若下月切换新 Supabase 项目，才需要按编号重新执行 039–043。
4. 确认迁移结果：
   - `coupons.allowed_scopes` 存在
   - `coupon_claims.ip_hash / device_hash` 存在
   - `coupon_claim_blocks` 存在
   - RPC `claim_coupon`、`grant_subscription_coupon`、`supersede_coupon_for_order`、`join_group_buy`、`create_order` 存在
   - `profiles.account_note` 与 `admin_audit_logs` 存在
   - `coupon_risk_settings`、`auth_login_events`、`password_reset_attempts`、`account_restrictions`、`profiles.must_change_password`、`referral_settings.share_text` 存在
   - Supabase Email Confirm email 已关闭（2026-10-01 公开注册验证返回 `session=true`）
   - `sub_units.enabled / activities.enabled / subscriptions.enabled / daily_picks.enabled` 存在
   - `scheduled_publications`、`publication_logs` 存在
   - RPC `admin_data_center_stats`、`create_scheduled_publication`、`process_scheduled_publications`、`admin_update_scheduled_publication` 存在
   - `referral_settings`、`referral_codes`、`referral_invites`、`referral_events` 存在
   - `coupon_claims.source_referral_invite_id` 存在
   - RPC `get_or_create_referral_code`、`bind_referral_invite`、`grant_referral_coupon`、`process_referral_rewards`、`admin_update_referral_invite`、`get_referral_overview` 存在

## 建议提交方式

```bash
git add .gitignore GITHUB_PUSH_CHECKLIST.md \
  supabase/migrations/037_coupon_scope_abuse_and_order_transactions.sql \
  supabase/migrations/038_claim_coupon_compatibility.sql \
  supabase/migrations/039_coupon_thresholds_and_blocks.sql \
  supabase/migrations/040_admin_account_management.sql \
  supabase/migrations/041_data_center_and_prelaunch.sql \
  supabase/migrations/042_referral_program.sql \
  supabase/migrations/043_auth_recovery_and_risk_settings.sql \
  src/app/api/supabase/auth \
  src/lib/supabase/client.ts \
  src/lib/claim-fingerprint.ts \
  src/lib/device-id.ts \
  src/app/api/coupons \
  src/components/coupons \
  src/components/admin/CouponsManager.tsx \
  src/lib/coupon-types.ts \
  src/lib/coupons-server.ts \
  src/lib/rate-limit.ts \
  "src/app/api/orders" \
  "src/app/api/group-buys/[id]/route.ts" \
  src/app/api/activities/route.ts \
  src/app/api/sub-units/route.ts \
  src/app/api/subscriptions/route.ts \
  src/app/api/account/route.ts \
  "src/app/api/admin/users" \
  "src/app/admin/(panel)/users" \
  "src/app/admin/(panel)/prelaunch" \
  "src/app/admin/(panel)/referrals" \
  "src/app/admin/(panel)/stats/page.tsx" \
  src/components/admin/UsersManager.tsx \
  src/components/admin/StatsManager.tsx \
  src/components/admin/PrelaunchManager.tsx \
  src/components/admin/ReferralsManager.tsx \
  "src/app/api/admin/publications" \
  src/app/api/admin/stats/route.ts \
  "src/app/api/activities" \
  "src/app/api/sub-units" \
  src/app/api/subscriptions/route.ts \
  src/app/api/home-sections/route.ts \
  src/app/api/daily-content/route.ts \
  src/app/api/search/route.ts \
  src/components/activities/ActivitiesServer.tsx \
  src/components/shop/ShopServer.tsx \
  src/components/shop/DailyPickServer.tsx \
  src/lib/orders-server.ts \
  src/lib/group-buy-server.ts \
  src/components/admin/AdminShell.tsx \
  src/components/layout/AccountHub.tsx \
  src/components/layout/TabBar.tsx \
  src/components/library/RecentOrdersCard.tsx \
  src/components/library/LibraryClient.tsx \
  src/lib/profiles-server.ts \
  src/app/api/referrals \
  "src/app/api/admin/referrals" \
  "src/app/(store)/referrals" \
  src/components/referral \
  src/lib/referral-client.ts \
  src/components/auth/AuthClient.tsx \
  src/components/auth/PasswordResetBotClient.tsx \
  src/lib/login-verification.ts \
  src/app/api/auth/login-events \
  src/app/api/auth/password-reset \
  src/app/api/account/status \
  src/app/api/admin/coupon-risk \
  "src/app/(store)/password-reset" \
  src/components/ui/GlassSurface.tsx \
  src/app/globals.css \
  "src/app/(store)/layout.tsx"

git commit -m "fix(coupon): add scopes, abuse guards, and atomic orders"
git push -u origin fix/coupon-vip
```

## 下月 Netlify 恢复部署后验收

1. Android 不开加速器完成注册、登录、退出；注册后不要求邮箱验证。
2. 后台新建/编辑优惠券，确认“可使用范围”只有小单元/订阅，没有活动。
3. 小单元订单和订阅订单分别测试券范围限制。
4. 同一 IP/设备多账号领取同一券，确认 24 小时限领生效。
5. 测试券被旧订单占用时的顶单流程。
6. 测试拼单最后一人并发加入，确认不超员。
7. 测试订阅数量大于 1 的订单确认收款，确认逐张授予权益。
8. 确认订单/取消订单并发时不会重复发放或错误取消。
9. 右上角头像打开账号中心；底部只显示选购、心愿单、活动、订阅。
10. 头像抽屉可进入探究广场、账号设置、客服、我的库四个分区和最近订单。
11. 后台账号管理可搜索、看详情、调整封禁范围/时长/角色/备注，封禁原因写入审计日志。
12. 后台桌面与移动端二级菜单可展开/收起，当前分组自动展开，动画顺滑。
13. 数据中心显示实付收入、订单状态、用户增长、优惠券核销、内容可见数和预上线状态，无控制台错误。
14. 预上线创建“先隐藏、到点发布”任务；等待 1 分钟或点击立即执行后目标内容变为可见。
15. 预上线失败任务显示 `last_error`，重试后可重新排队；取消任务后不再执行。
16. 将小单元/活动/订阅/每日推荐设为隐藏后，前台列表、详情、搜索、正文接口均不返回该内容；管理员接口仍可见。
17. 登录后打开 `/referrals`，确认专属推广码、复制链接、奖励说明、邀请记录与彩虹液态玻璃视觉正常。
18. 通过推广链接注册新号，确认邀请记录被归因，且不满足延迟/首单/风控条件时不提前发券。
19. 后台推广计划可保存奖励券、延迟、单推广人上限、同设备/同 IP 上限、首单要求与人工审核。
20. 后台可查看邀请记录、命中规则、脱敏设备/网络指纹、绑定时间、审核备注与处理人；人工拒绝必须填写原因。
21. 复制推广链接时得到完整邀请文案，而不是裸链接；黑底玻璃按钮有克制彩虹边缘与悬浮高光。
22. 找回密码分别测试旧密码修改与客服机器人核身；机器人 24 小时最多 3 次，通过后发临时密码并强制下次登录修改。

## 后续功能备忘

- Bot 引擎：做类似 Telegram Bot 的可自定义脚本/自动化能力，暂不在本轮实现。

## 未包含在本次修复中的问题

- A2：卡密商品接口未鉴权
- A3：管理员登录无限速
- D1：头像 URL 可引用他人头像
