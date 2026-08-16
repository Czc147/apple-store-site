/**
 * 生成 apple-touch-icon.png（180×180，与 src/app/icon.svg 同款设计）。
 * 零依赖：纯 Node 手写 PNG 编码（IHDR/IDAT/IEND + CRC32），2× 超采样抗锯齿。
 * 用法：node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 180; // apple-touch-icon 推荐尺寸
const SS = 2; // 超采样倍数
const S = SIZE * SS;
const k = SIZE / 64; // icon.svg 的 64×64 viewBox → 180 缩放系数
const cx = 32 * k;

const BLUE = [0, 113, 227]; // #0071E3
const WHITE = [255, 255, 255];

/** 圆角矩形内判定 */
function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const qx = Math.min(Math.max(px, x0 + r), x1 - r);
  const qy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - qx;
  const dy = py - qy;
  return dx * dx + dy * dy <= r * r;
}

/** 购物袋袋身（梯形，底部圆角） */
function inBody(px, py) {
  const topY = 25 * k;
  const botY = 48.6 * k;
  const hwTop = 11 * k;
  const hwBot = 12.1 * k;
  const r = 4 * k;
  if (py < topY || py > botY) return false;
  const t = (py - topY) / (botY - topY);
  const hw = hwTop + (hwBot - hwTop) * t;
  if (Math.abs(px - cx) > hw) return false;
  // 底部两角做圆角处理
  if (py > botY - r && Math.abs(px - cx) > hwBot - r) {
    const ccx = cx + Math.sign(px - cx) * (hwBot - r);
    const dx = px - ccx;
    const dy = py - (botY - r);
    if (dx * dx + dy * dy > r * r) return false;
  }
  return true;
}

/** 提手（两段竖杆 + 上半圆环） */
function inHandle(px, py) {
  const barW = 1.5 * k;
  if (py >= 21.5 * k && py <= 26.5 * k) {
    if (Math.abs(px - 26.5 * k) <= barW) return true;
    if (Math.abs(px - 37.5 * k) <= barW) return true;
  }
  if (py <= 21.5 * k) {
    const dx = px - 32 * k;
    const dy = py - 21.5 * k;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 4 * k && d <= 7 * k) return true;
  }
  return false;
}

/** 采样点着色：白色图形 > 蓝色圆角底 > 透明 */
function sampleColor(x, y) {
  if (inBody(x, y) || inHandle(x, y)) return [...WHITE, 255];
  if (inRoundedRect(x, y, 0, 0, SIZE, SIZE, 14 * k)) return [...BLUE, 255];
  return [0, 0, 0, 0];
}

// ---------------- 渲染（SS×SS 超采样均值） ----------------
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [cr, cg, cb, ca] = sampleColor(
          x + (sx + 0.5) / SS,
          y + (sy + 0.5) / SS,
        );
        r += cr * ca;
        g += cg * ca;
        b += cb * ca;
        a += ca;
      }
    }
    const n = SS * SS;
    const i = (y * SIZE + x) * 4;
    if (a > 0) {
      rgba[i] = Math.round(r / a);
      rgba[i + 1] = Math.round(g / a);
      rgba[i + 2] = Math.round(b / a);
      rgba[i + 3] = Math.round(a / n);
    }
  }
}

// ---------------- PNG 编码 ----------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let i = 0; i < 8; i++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
// 每行前加 filter 字节 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'app', 'apple-icon.png');
writeFileSync(out, png);
console.log(`✓ 已生成 ${out}（${png.length} bytes，${SIZE}×${SIZE} RGBA）`);
