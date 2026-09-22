// 服务端启动的代理探测（dev 与生产共用）。
//
// 为什么需要它：国内网络对 *.supabase.co 的 TLS 握手会被重置，而 Next 服务端用的
// undici fetch 默认 **不读** HTTP_PROXY/HTTPS_PROXY 环境变量。Node 24 起支持
// NODE_USE_ENV_PROXY=1 让 undici 走代理，本模块负责把这三个环境变量凑齐。
//
// ⚠️ NODE_USE_ENV_PROXY 是**进程启动时**读的：必须在 spawn 子进程时通过 env 传，
// 在父进程里临时改 process.env 对已经跑起来的 Node 无效（实测 ECONNRESET）。
//
// 什么时候不需要代理：服务器在境外（香港/日本/新加坡等）时直连即可 ——
// 探测不到代理就自动直连，不会画蛇添足。
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** TCP 探测某端口是否可连（超时 1.2s） */
function probe(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const sock = connect({ host, port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

/** 从 Windows 注册表读系统代理（HKCU\...\Internet Settings） */
async function systemProxy() {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout: en } = await execFileAsync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v', 'ProxyEnable',
    ]);
    if (!/0x1\b/.test(en)) return null; // 系统代理未开启
    const { stdout: sv } = await execFileAsync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v', 'ProxyServer',
    ]);
    const m = sv.match(/ProxyServer\s+REG_SZ\s+(\S+)/);
    return m ? m[1].replace(/^https?:\/\//, '') : null;
  } catch {
    return null;
  }
}

/** 读 .env.local 里的 Supabase 地址（用于「代理是否真能通到库」的验证） */
function supabaseHost() {
  try {
    const env = readFileSync('.env.local', 'utf8');
    const m = env.match(/^\s*(?:NEXT_PUBLIC_)?SUPABASE_URL\s*=\s*(\S+)/m);
    return m ? new URL(m[1].trim()).host : null;
  } catch {
    return null;
  }
}

/** 让代理对目标 443 开一条隧道，确认它真能出去。
 *  这里刻意用裸 CONNECT 而不是 fetch：NODE_USE_ENV_PROXY 是进程启动时读的，
 *  父进程里临时设 process.env 不会生效（实测 ECONNRESET），
 *  而单开子进程只为了探测一下又太重。代理连不上游时会回 502/504，照样能判定。 */
function verifyProxyTunnel(proxyHost, proxyPort, targetHost, timeout = 8000) {
  return new Promise((resolve) => {
    const sock = connect({ host: proxyHost, port: proxyPort });
    let buf = '';
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => {
      sock.write(`CONNECT ${targetHost}:443 HTTP/1.1\r\nHost: ${targetHost}:443\r\n\r\n`);
    });
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      if (buf.includes('\r\n\r\n')) done(/^HTTP\/1\.[01] 200/.test(buf));
    });
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

/**
 * 组装服务端进程该有的环境变量。
 * @returns {{ env: NodeJS.ProcessEnv, note: string }} env 直接传给 spawn，note 是给人看的一行说明
 */
export async function resolveServerEnv() {
  const env = { ...process.env };
  let note = '直连（未检测到可用代理）';

  const candidate =
    process.env.HTTPS_PROXY ?? process.env.https_proxy ?? (await systemProxy());

  if (!candidate) return { env, note };

  const [host, port] = candidate.replace(/^https?:\/\//, '').split(':');
  if (!(await probe(host, Number(port)))) {
    return { env, note: `检测到代理配置 ${candidate}，但端口不通 → 直连` };
  }

  env.NODE_USE_ENV_PROXY = '1';
  env.HTTPS_PROXY = `http://${host}:${port}`;
  env.HTTP_PROXY = `http://${host}:${port}`;
  // 本地回环绝不走代理，否则服务端自请求会被绕一圈
  env.NO_PROXY = 'localhost,127.0.0.1,::1';
  note = `走代理 ${host}:${port}`;

  const supa = supabaseHost();
  if (supa) {
    const ok = await verifyProxyTunnel(host, Number(port), supa);
    note += ok
      ? ` · Supabase 可达 ✓`
      : `\n   ⚠️  代理连不上 ${supa}：前台会回退演示数据（页面仍可看，非崩溃）。检查代理是否已开启/切换节点。`;
  }
  return { env, note };
}
