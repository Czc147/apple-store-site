// 生产启动器：先 build 过再跑 `next start`，并把代理环境变量带上。
//
// 为什么不能直接 `next start`：
//   1) 国内服务器（或任何连不上 *.supabase.co 的网络）需要 NODE_USE_ENV_PROXY=1
//      + HTTPS_PROXY，而 undici 只在**进程启动时**读这几个变量 —— 必须在这里注入；
//   2) 顺手把「构建产物不存在就提示先 build」这种低级错误挡掉。
// 服务器在境外（香港/日本/新加坡）时探测不到代理，会自动直连，不需要额外配置。
//
// 用法：
//   npm run build && npm run start          ← 本机/服务器手动跑
//   pm2 start npm --name zorvin -- run start  ← 交给 pm2 守护（见 SELF_HOST.md）
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolveServerEnv } from './proxy-env.mjs';

const PORT = process.env.PORT || '3000';

if (!existsSync('.next/BUILD_ID')) {
  console.error('[start] 找不到 .next/BUILD_ID —— 先跑一次 `npm run build`。');
  process.exit(1);
}

const { env, note } = await resolveServerEnv();
console.log(`[start] 端口 ${PORT} · ${note}\n`);

const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
  { env, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 0));
