# 自建部署（VPS）· Zorvin

> 面向场景：**给别人用**——把站点部署到一台自己的服务器上，公开访问。
> 如果你只是自己用，不需要看这份文档：本机 `npm run build && npm run start`，
> 浏览器开 `http://localhost:3000` 就行，而且是最快的（实测首页 TTFB 0.17s，
> 线上 Netlify 是 0.89s，冷启动第一次 4.36s）。

---

## 0. 先想清楚：值不值得自建

| | Netlify（现状） | 自建 VPS |
|---|---|---|
| CDN / HTTPS / 自动构建 | 平台白送 | 全部自己搭（nginx + certbot + CI） |
| 每次访问的路径 | 用户 → 海外边缘 → **函数在俄亥俄** → 数据库在东京 | 用户 → 你的服务器 → 数据库在东京 |
| 灵活性 | 受平台限制（区域、套餐） | 完全自主 |
| 成本 | 免费档够用 | 约 ¥300–600/年（东京/香港 2C2G） |

**关键判断**：现在慢的主因是「**函数在俄亥俄、数据库在东京**」这段跨太平洋的冤枉路。
自建能消掉它——**前提是服务器选在日本/香港**，离 Supabase 东京近。
如果服务器买在欧美，等于把同一段路又走一遍，只是换了个方向。

> **先试更省事的一招**：把 Netlify 的**函数区域**改成东京，函数与数据库同城后
> 那 5–6 次查询每趟从约 180ms 降到几毫秒。操作路径：
>
> 1. Netlify 后台 → **Project configuration**（旧版叫 Site configuration）
>    → **Build & deploy** → **Continuous deployment** → **Functions region**
> 2. 点 **Configure** → 选 **Tokyo** → **Save**
> 3. 回 Deploys 页 **Trigger deploy** **重新部署** —— 区域是按部署固化的，
>    老部署仍跑在旧区域
>
> ⚠️ **前提是套餐允许**：免费/Starter 档的函数区域**锁死在俄亥俄（us-east-2）**，
> 换区域需要 Pro/Enterprise。进到上面那一步就知道行不行 —— 能选就是能用，
> 只显示一个灰掉的区域就是被套餐挡了。
> 被挡的话两条路：**自建**（本文档），或把 **Supabase 项目迁到 us-east-2** 与函数同城
> —— 后者省了服务器钱，但数据库跑到美国，对你（和国内用户）的图片加载与登录会变慢，
> 是个反向的取舍，不建议无脑选。

---

## 1. 机器怎么选

| 项 | 建议 | 为什么 |
|---|---|---|
| **地区** | **东京 > 大阪 > 香港/新加坡** | 数据库在东京，这是唯一决定性因素 |
| CPU / 内存 | **2 核 2G 起** | `next build` 要 2G+，小内存机构建会 OOM |
| 系统盘 | ≥ 40G | `.next` + `node_modules` |
| 带宽 | 1–5 Mbps 够用 | 图片/视频走 Supabase Storage，**不占你的带宽**；服务器只出 HTML/JS |
| 备案 | 大陆机房**必须备案**；香港/日本/新加坡**免备案** | 备案要求域名在国内注册商，流程数周 |

> 想省事就别碰大陆机房：免备案 + 离东京近，香港/东京是性价比最高的两个点。

---

## 2. 服务器一次性配置

```bash
# Node 20+（项目 netlify.toml 锁定 20；用 nvm 装最省心）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL -l && nvm install 20

# 系统依赖
sudo apt update && sudo apt install -y nginx git
sudo npm i -g pm2

# 拉代码
git clone git@github.com:Czc147/apple-store-site.git /srv/zorvin
cd /srv/zorvin
```

---

## 3. 环境变量

在服务器上建 `/srv/zorvin/.env.local`（**权限 600，绝不要提交**）：

```ini
SUPABASE_URL=https://<你的项目>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # 绕 RLS 的密钥，泄露=数据库裸奔
NEXT_PUBLIC_SUPABASE_URL=https://<你的项目>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
ADMIN_PASSWORD=<后台强密码，同时是会话签名密钥>
```

```bash
chmod 600 /srv/zorvin/.env.local
```

⚠️ **`NEXT_PUBLIC_*` 是构建期内联的**：改完必须重新 `npm run build` 才生效，
只重启进程没用。这是本项目最常见的「改了没反应」来源。

---

## 4. 构建与启动

```bash
cd /srv/zorvin
npm ci
npm run build          # 需要 2G+ 内存
pm2 start npm --name zorvin -- run start
pm2 save && pm2 startup    # 开机自启（按提示复制它输出的那条命令执行）
```

`npm run start` 走的是 `scripts/start.mjs`，它比裸 `next start` 多做两件事：

1. 找不到 `.next/BUILD_ID` 时直接报错退出（省得对着 500 排查）；
2. **自动探测并注入代理环境变量**——见下一节。

### 代理：境内服务器必须，境外不用

国内网络对 `*.supabase.co` 的 TLS 握手会被重置。而 Next 服务端用的 undici fetch
**默认不读** `HTTP_PROXY` / `HTTPS_PROXY`：必须靠 `NODE_USE_ENV_PROXY=1`，
且这个变量**只在进程启动时读一次**。

`scripts/start.mjs` 已经处理好了：探测到可用代理就自动设置并验证到 Supabase 的隧道，
探测不到就直连。启动日志会明确写出走的是哪条路：

```
[start] 端口 3000 · 走代理 127.0.0.1:7897 · Supabase 可达 ✓
```

- **服务器在境外（东京/香港）**：什么都不用配，日志显示「直连」即正常。
- **服务器在大陆**：需要在这台机器上跑一个代理（Clash 之类），
  或在启动前 export `HTTPS_PROXY=http://127.0.0.1:7897`。
  没代理就直连的话，前台会自动降级成演示数据——页面能开，但看不到真实商品，
  这是本项目最容易误判成"部署失败"的现象。

---

## 5. nginx 反代 + HTTPS

`/etc/nginx/sites-available/zorvin`：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  # 图片等静态资源交给 Next 自己，只做透传
  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection 'upgrade';
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;   # 别用默认的 60s 以下：慢查询会 502
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/zorvin /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS（certbot 会自动改上面的配置并加 80→443 跳转）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

> 注意：`next.config.mjs` 里的 `images.remotePatterns` 只放行了 Supabase Storage 与
> picsum，**站外图片会被 next/image 拒绝**（会直接报错而不是静默）。加图床记得同步放行。

---

## 6. 更新与自动部署

最小可用（手动）：

```bash
cd /srv/zorvin && git pull && npm ci && npm run build && pm2 reload zorvin
```

自动化（GitHub Actions → SSH），存为 `.github/workflows/deploy.yml`，
在仓库 Secrets 里配 `SSH_HOST` / `SSH_USER` / `SSH_KEY`：

```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH 部署
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /srv/zorvin
            git pull
            npm ci
            npm run build
            pm2 reload zorvin
```

> ⚠️ 这样一来「push 即上线」从 Netlify 换成了你的服务器。若 Netlify 那条线还留着，
> 两边会同时构建——确定要切再配。

---

## 7. 切换与回退

1. 先让服务器用**域名直连**跑通（改本机 hosts 指向服务器 IP 验证一遍）。
2. DNS 的 A 记录指向服务器 IP；如果原来指向 Netlify，把 TTL 调小后再改，方便回退。
3. 回退就是 DNS 改回去——所以**先别关 Netlify 站点**，留着当备胎跑几天。

---

## 8. 备份与日常

- **数据库**：Supabase 自带每日备份（免费档保留期短），重要数据自己定期 `pg_dump`：
  ```bash
  pg_dump "postgresql://postgres.<ref>:<密码>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" > backup.sql
  ```
- **迁移**：新版本带来的 `supabase/migrations/0xx_*.sql` 需要手动跑一次
  （`DB_URL="..." node scripts/apply-migration.mjs supabase/migrations/0xx_xxx.sql`），
  **构建不会自动执行迁移**——忘了跑，新功能会 500。
- **日志**：`pm2 logs zorvin`；nginx 在 `/var/log/nginx/`。

---

## 9. 成本参考（东京/香港，年付）

| 项 | 价格 |
|---|---|
| 2C2G / 40G SSD VPS | ¥300–600 / 年 |
| 域名 | ¥60–80 / 年 |
| HTTPS | 免费（certbot） |
| 对象存储/带宽 | 已含在 Supabase（图片不占你服务器带宽） |

比 Netlify 免费档贵，换来的是：函数与数据库同城、完全可控、不再受平台区域与套餐限制。
**如果只是嫌慢，先做第 0 节那一步（换 Netlify 函数区域）再决定。**
