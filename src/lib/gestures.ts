'use client';

import { useEffect, useRef } from 'react';

/**
 * 双击手势。
 *
 * 与 UI.docx 里那份示意实现的差别（照着抄会有 bug）：
 * 文档版触发后只更新 `lastTap = now`，于是**第三次连点距第二次也 <280ms，
 * 会再触发一次**。套在点赞这种切换语义上就是「点赞→取消」等于没点。
 * 这里触发后把计时清零，保证一次连击只回调一次。
 *
 * @param onDoubleTap 双击时调用
 * @param onSingleTap 可选：单击时调用（用于「双击点赞、单击不做」之外的场景）
 */
export function useDoubleTap(
  onDoubleTap: () => void,
  onSingleTap?: () => void,
  windowMs = 280,
) {
  const lastTap = useRef(0);
  /** 待触发的单击（等双击窗口过去没等到第二下才执行） */
  const singleTimer = useRef<number | null>(null);

  const clearSingle = () => {
    if (singleTimer.current !== null) {
      window.clearTimeout(singleTimer.current);
      singleTimer.current = null;
    }
  };

  useEffect(() => clearSingle, []);

  return () => {
    const now = Date.now();

    if (now - lastTap.current < windowMs) {
      // 第二下来了 → 取消待触发的单击，改判为双击
      lastTap.current = 0; // 清零：避免三连点被算成两次双击
      clearSingle();
      onDoubleTap();
      return;
    }

    lastTap.current = now;

    if (!onSingleTap) return;
    // ⚠️ 单击必须**延迟到双击窗口之后**再执行。
    // 立刻执行的话，双击的第一下就会先把单击动作做了（比如弹出帖子详情），
    // 第二下再补一个点赞 —— 用户只是想点赞，详情层却已经弹出来了。
    // 推特那套「单击进详情、双击点赞」正是靠这个延迟成立的。
    clearSingle();
    singleTimer.current = window.setTimeout(() => {
      singleTimer.current = null;
      onSingleTap();
    }, windowMs);
  };
}

/**
 * 长按手势。
 *
 * 相比 UI.docx 的示意实现补了两处：
 * - **卸载时清定时器**：原来在 500ms 内切走页面，回调照样打到已卸载组件上
 * - **长按期间禁用文本选中**（调用方配合 CSS `select-none`）并暴露
 *   `onContextMenu` 处理器 —— 手机长按会同时弹系统菜单，不拦就穿帮
 */
export function useLongPress(onLongPress: () => void, duration = 500) {
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // 卸载清理：组件没了就别再回调
  useEffect(() => clear, []);

  return {
    onPointerDown: () => {
      clear();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        onLongPress();
      }, duration);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    /** 拦掉浏览器的右键/长按菜单 */
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}
