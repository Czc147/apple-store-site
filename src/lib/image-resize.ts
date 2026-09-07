/**
 * 客户端头像图片处理：缩放到合适尺寸 + 居中裁剪成正方形 + 统一转码 jpeg。
 * 仅浏览器端使用；手机相册原图可能几 MB，上传前先在本地压缩，
 * 既减小上传体积，也让服务端可以固定只接受 image/jpeg 一种格式。
 */

/** 加载图片文件为可绘制的 ImageBitmap/HTMLImageElement */
async function loadImage(file: File): Promise<{ draw: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { draw: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = url;
  });
  return { draw: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

/**
 * 缩放 + 居中裁剪成正方形 jpeg File。
 * @param maxSize 输出正方形边长（px），原图更小则不放大，直接按原图最短边裁剪
 */
export async function resizeImageToJpegFile(
  file: File,
  maxSize = 512,
  quality = 0.85,
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  const { draw, width, height, cleanup } = await loadImage(file).catch(() => {
    throw new Error('图片无法识别，请换一张');
  });

  try {
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;
    const outSide = Math.min(maxSize, side);

    const canvas = document.createElement('canvas');
    canvas.width = outSide;
    canvas.height = outSide;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持图片处理');
    ctx.drawImage(draw, sx, sy, side, side, 0, 0, outSide, outSide);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) throw new Error('图片处理失败，请换一张');

    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } finally {
    cleanup();
  }
}

/** 需要压缩的图片类型（PNG 保留透明通道、SVG/GIF 不转码，均跳过） */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/webp']);

/**
 * 通用图片上传前压缩：只处理 jpeg/webp，缩放到不超过 maxWidth（等比），
 * 统一转码 jpeg；压缩结果更大时回退用原文件（不做负优化）。
 * 仅浏览器端使用，返回可用于 form.append 的 File。
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1600,
  quality = 0.8,
): Promise<File> {
  if (!COMPRESSIBLE.has(file.type)) return file;

  const { draw, width, height, cleanup } = await loadImage(file).catch(() => {
    throw new Error('图片无法识别，请换一张');
  });

  try {
    const scale = Math.min(1, maxWidth / width);
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持图片处理');
    ctx.drawImage(draw, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } finally {
    cleanup();
  }
}
