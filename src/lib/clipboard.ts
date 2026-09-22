'use client';

/**
 * 复制文本到剪贴板（带降级）。
 *
 * 为什么不能只用 `navigator.clipboard.writeText`：
 * 那个 API **只在安全上下文（HTTPS 或 localhost）才有**。用户在手机上用
 * `http://<局域网IP>:3000` 访问开发服务器时它是 `undefined`，调用直接抛错、
 * 剪贴板里什么都没有 —— 用户看到的就是"点了复制但粘不出来"（用户报的 bug #7）。
 *
 * 降级路径用隐藏 textarea + `document.execCommand('copy')`：
 * 它虽然被标为废弃，但在非安全上下文里仍然可用，iOS Safari 也认，
 * 且**必须由用户手势触发**（点按钮即满足）。
 *
 * @returns 是否复制成功（调用方据此给不同的提示，不要一律显示"已复制"）
 */
export async function copyText(text: string): Promise<boolean> {
  // 1) 首选：安全上下文下的异步剪贴板
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 被权限策略拒绝等 → 继续走降级，不要直接返回 false
  }

  // 2) 降级：隐藏 textarea + execCommand
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    // 放到视口内但不可见：iOS 上 `display:none` / `visibility:hidden` 的元素
    // 选不中，execCommand 会失败
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS 需要显式设选区

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
