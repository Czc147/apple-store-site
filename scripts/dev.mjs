// 开发服务器启动器：自动探测本机代理并注入给 Node（探测逻辑见 proxy-env.mjs）。
//
// 为什么需要它：本机（国内网络）对 *.supabase.co 的 TLS 握手会被重置，
// 而 Next 服务端用的 undici fetch 默认 **不读** HTTP_PROXY/HTTPS_PROXY 环境变量，
// 于是 Supabase 全部请求 fetch failed → 前台只能回退演示数据。
// 本脚本负责把环境变量凑齐并在启动前验证一遍，省得对着「演示数据」提示条排查半天。
//
// 用法：npm run dev   （等价于 node scripts/dev.mjs）
import { spawn } from 'node:child_process';
import { resolveServerEnv } from './proxy-env.mjs';

const { env, note } = await resolveServerEnv();
console.log(`[dev] ${note}\n`);

// 直接跑 next 的 CLI 入口（不经过 shell，避免 Windows 下的引号/转义问题）
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev'], {
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
