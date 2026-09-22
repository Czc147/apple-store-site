/**
 * 液态玻璃 —— 位移贴图生成。
 *
 * 原理（提炼自 CodePen「liquid glass」jh3y/EajLxJV）：
 * 一张与元素同尺寸的贴图，内部是**中性灰**（位移量≈0），只有边缘一圈是
 * 横向红渐变 + 纵向蓝渐变。把它喂给 feDisplacementMap 后，backdrop 只有
 * 边缘被"掰弯"，中间保持原样 —— 这正是玻璃边缘折射的观感。
 * 再用 R/G/B 三通道各自的位移差做出色散（彩虹描边）。
 *
 * 贴图必须按元素真实尺寸生成：feImage 会把图拉伸到滤镜区域，
 * 尺寸/圆角对不上，折射rim 就跑到元素外面，看起来像没生效。
 */
export interface DisplacementMapOptions {
  width: number;
  height: number;
  /** 圆角（像素）。药丸形传 height / 2 */
  radius: number;
  /** 边缘受影响带宽 = 短边 × border × 0.5（默认 0.07，同 demo） */
  border?: number;
  /** 内部平坦区模糊半径 = 短边 × blurRatio（默认 0.115 = demo 的 11/96）。
      必须按比例，写死 11px 在小元素上会把挖空区糊穿，折射铺满整块。 */
  blurRatio?: number;
  /** 内部平坦区亮度（默认 50 = 正中性灰，偏了会让整块背景平移） */
  lightness?: number;
  /** 内部平坦区不透明度（默认 0.93，同 demo） */
  alpha?: number;
  /** 红/蓝渐变的混合方式（默认 difference，同 demo） */
  blend?: string;
}

/**
 * 生成可直接喂给 `<feImage href>` 的位移贴图 data URI。
 * 返回值在尺寸/圆角不变时应保持一致，便于调用方做缓存比对。
 */
export function buildDisplacementMap({
  width,
  height,
  radius,
  border = 0.07,
  blurRatio = 0.115,
  lightness = 50,
  alpha = 0.93,
  blend = 'difference',
}: DisplacementMapOptions): string {
  const min = Math.min(width, height);
  const b = min * border * 0.5;
  const blur = min * blurRatio;
  // 挖空内矩形的圆角必须跟着内缩（outer - inset）；沿用外框圆角会让两端
  // 露出大片渐变区 —— 药丸形（radius = 高/2）下尤其明显，折射会铺满整块。
  const innerRadius = Math.max(0, radius - b);
  const svg =
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">` +
    `<stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="red"/>` +
    `</linearGradient>` +
    `<linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%">` +
    `<stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="blue"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="black"/>` +
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#red)"/>` +
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#blue)" style="mix-blend-mode:${blend}"/>` +
    `<rect x="${b}" y="${b}" width="${width - b * 2}" height="${height - b * 2}" rx="${innerRadius}" ` +
    `fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${blur}px)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * 色散三通道的位移强度，按元素短边等比。
 *
 * demo 的基准是 336×96 的 dock、scale -180（≈ -1.875 × 短边）。
 * 但那个数值**不能**直接等比搬到 63×53 的药丸上：demo 的 dock 宽高比 3.5:1，
 * 药丸接近 1.2:1，同样的位移量在窄元素上会让色散铺满整块，呈现油膜感而非玻璃。
 * 实测（见 D:/claude/_lggrid.html 参数网格）取 -0.94 × 短边、增量 0.15/0.30 × 短边
 * 时，色散清晰可见又仍读作玻璃 —— 这才是 demo 的"观感强度"。
 */
export function dispersionScales(
  minDimension: number,
  strength = -0.94,
  deltaRatio = 0.15,
) {
  const base = minDimension * strength;
  const step = minDimension * deltaRatio;
  return { red: base, green: base + step, blue: base + step * 2 };
}
