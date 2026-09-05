#!/usr/bin/env node
/**
 * 文件名核对脚本：扫描本地文件夹，对照线上小单元名单，报告匹配不上的单元名
 *
 * 用法：node scripts/check-names.mjs <folder> [--api <baseUrl>]
 *   <folder>  本地文件夹（子文件夹名 / 文件名去扩展名 视为单元名）
 *   --api     站点地址，默认取 SITE_URL 环境变量或 http://localhost:3000
 *
 * 读取公开只读接口 GET /api/sub-units，与「文件夹批量导入」的匹配口径一致：
 * 子文件夹名 = 单元名；顶层图片 / txt 文件名（去扩展名）= 单元名。
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
let folder = null;
let base = process.env.SITE_URL || 'http://localhost:3000';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api') {
    base = args[++i] ?? base;
  } else if (!folder) {
    folder = args[i];
  }
}

if (!folder) {
  console.error('用法：node scripts/check-names.mjs <folder> [--api <baseUrl>]');
  process.exit(1);
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
function extOf(name) {
  const n = name.toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i + 1) : '';
}
function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

const unitNames = new Set();
for (const name of readdirSync(folder)) {
  if (name.startsWith('.')) continue;
  const full = join(folder, name);
  if (statSync(full).isDirectory()) {
    unitNames.add(name);
  } else {
    const ext = extOf(name);
    if (IMAGE_EXTS.has(ext) || ext === 'txt') unitNames.add(stripExt(name));
  }
}

const baseClean = base.replace(/\/+$/, '');
const url = `${baseClean}/api/sub-units`;

let subs;
try {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`请求失败（HTTP ${res.status}）：${url}`);
    process.exit(1);
  }
  subs = await res.json();
} catch (e) {
  console.error(`请求失败：${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const online = new Set(Array.isArray(subs) ? subs.map((s) => s.name) : []);
const matched = [...unitNames].filter((n) => online.has(n));
const unmatched = [...unitNames].filter((n) => !online.has(n)).sort();

console.log(`本地识别单元 ${unitNames.size} 个；线上小单元 ${online.size} 个`);
console.log(`匹配 ${matched.length} 个，未匹配 ${unmatched.length} 个`);
if (unmatched.length > 0) {
  console.log('\n匹配不上的单元名（这些文件名将无法导入）：');
  for (const n of unmatched) console.log(`  - ${n}`);
}
process.exit(unmatched.length > 0 ? 2 : 0);
