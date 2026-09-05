import type { NextRequest } from 'next/server';

/**
 * 极简内存 IP 限速（按「桶名 + IP」计数，固定窗口）。
 *
 * ⚠️ Netlify Functions 为多实例无状态部署，本限速是【尽力而为】：
 * 单实例内有效，跨实例按实例数放大。防脚本批量爆破已足够提升成本，
 * 不构成严格的分布式限流承诺。
 *
 * 用于「以码为凭证」的敏感接口（/api/redeem、/api/daily-access、
 * /api/daily-content）——卡密可当访问凭证后，枚举攻击的收益面变大。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 桶过多时惰性清理过期项，防内存缓慢增长 */
function sweepExpired(now: number) {
  if (buckets.size < 1024) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * @returns true = 放行；false = 超限
 */
export function rateLimit(
  bucketName: string,
  ip: string,
  limit = 30,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  sweepExpired(now);
  const key = `${bucketName}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/** 从请求头尽力解析客户端 IP（Netlify 环境） */
export function getClientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-nf-client-ip') ?? 'unknown';
}
