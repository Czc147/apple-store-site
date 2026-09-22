/**
 * Orbi 提示音 —— 四个音色的合成配方（Web Audio 现场生成，不用任何音频文件）。
 *
 * 设计取向：借 Telegram 那种「短、清脆、即时反馈」的**手感**，
 * 音色则围绕 Orbi 自己的形象做 —— 暖橙、圆润、轻微电子感、不刺耳。
 * **没有使用任何 Telegram 原始音频**，这里每一行都是重新设计的。
 *
 * 四个音色的听感目标（对应需求书）：
 *   message-send    "pop → tiny sparkle"    短促清脆，最轻
 *   message-receive "soft ping → resonance" 软铃 + 一点余韵
 *   orbi-reply      "ti-liŋ ✦"              两级上行 + 星点，最有"小机器人"味
 *   message-error   低沉短促，刻意不刺耳
 *
 * 实现要点：
 * - 每个音都由**振荡器 + 增益包络**组成，起止都用短斜坡，避免爆音（click）
 * - 振荡器一律 `stop(when)` 自动释放，不持有引用 —— 不会泄漏、不会重复建 Audio 对象
 * - 频率用 exponentialRamp（听起来是等比滑音），增益用 linear/exponential 包络
 * - 只用 sine / triangle：方形或锯齿在这个场景里太"电子鸣叫"
 */

import type { SoundName } from './types';

/** 生成一个音色的所有节点；返回该音色的总时长（秒），供调用方排程 */
type Voice = (ctx: AudioContext, out: AudioNode, at: number) => number;

/** 单音：从 f0 滑到 f1（f0===f1 即不滑），带起落包络 */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  opts: {
    type?: OscillatorType;
    f0: number;
    f1?: number;
    /** 到达峰值的时间（秒）——太短会有咔哒声 */
    attack?: number;
    /** 从峰值衰减到静音的时间（秒） */
    decay: number;
    gain: number;
    /** 起始延迟（秒），用于把音色排成"ti-liŋ"这种多音 */
    delay?: number;
    /** 低通截止（Hz）：给音色"变钝"，错误音用得上 */
    lowpass?: number;
  },
): number {
  const t0 = at + (opts.delay ?? 0);
  const attack = opts.attack ?? 0.008;
  const peak = t0 + attack;
  const end = peak + opts.decay;

  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.f0, t0);
  if (opts.f1 !== undefined && opts.f1 !== opts.f0) {
    // exponentialRamp 不能碰 0，且必须 > 0
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), end);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(opts.gain, peak);
  // exponential 收尾更像自然衰减；末尾留 0.0001 而不是 0（指数曲线到不了 0）
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  let tail: AudioNode = gain;
  if (opts.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.lowpass;
    gain.connect(lp);
    tail = lp;
  }

  osc.connect(gain);
  tail.connect(out);
  osc.start(t0);
  osc.stop(end + 0.02); // 自动释放，无需手动 disconnect

  return end + 0.02 - at;
}

/**
 * 发送：一声轻快的「啵」加一点高频亮点。
 * 频率上行（620→980）给"东西发出去了"的推背感，亮点让它不闷。
 */
const send: Voice = (ctx, out, at) => {
  const a = tone(ctx, out, at, {
    type: 'triangle',
    f0: 620,
    f1: 980,
    attack: 0.005,
    decay: 0.105,
    gain: 0.5,
  });
  const b = tone(ctx, out, at, {
    type: 'sine',
    f0: 1860,
    decay: 0.06,
    gain: 0.12,
    delay: 0.025,
  });
  return Math.max(a, b);
};

/**
 * 接收：软铃 + 一点余韵。
 * 1320Hz 是主音的纯五度泛音，比单纯重复同一个频率更有"铃"的空间感，
 * 又不至于变成和弦（那样就不"软"了）。
 */
const receive: Voice = (ctx, out, at) => {
  const a = tone(ctx, out, at, {
    f0: 880,
    attack: 0.01,
    decay: 0.26,
    gain: 0.42,
  });
  const b = tone(ctx, out, at, {
    f0: 1320,
    attack: 0.014,
    decay: 0.3,
    gain: 0.16,
    delay: 0.022,
  });
  return Math.max(a, b);
};

/**
 * Orbi 回复：「ti-liŋ ✦」——两级上行 + 星点。
 * 上行音程（G5 → D6，纯五度）听感是"被回应"的积极感；
 * 尾巴上那颗 2349Hz 的三角波星点是"✦"，也是这个音色最好认的地方。
 */
const orbiReply: Voice = (ctx, out, at) => {
  const a = tone(ctx, out, at, {
    f0: 784,
    attack: 0.012,
    decay: 0.14,
    gain: 0.4,
  });
  const b = tone(ctx, out, at, {
    f0: 1175,
    attack: 0.012,
    decay: 0.22,
    gain: 0.38,
    delay: 0.11,
  });
  const c = tone(ctx, out, at, {
    type: 'triangle',
    f0: 2349,
    decay: 0.16,
    gain: 0.1,
    delay: 0.19,
  });
  return Math.max(a, b, c);
};

/**
 * 失败：低沉、短、钝。
 * 刻意**下行**（196→155）而不是上行——上行在这个语境里会变成"成功"；
 * 也没有用常见的两声"嘟嘟"，那太像系统报警。低通滤掉高频让它不刺耳。
 */
const error: Voice = (ctx, out, at) => {
  const a = tone(ctx, out, at, {
    f0: 196,
    f1: 155,
    attack: 0.012,
    decay: 0.19,
    gain: 0.34,
    lowpass: 900,
  });
  return a;
};

export const VOICES: Record<SoundName, Voice> = {
  'message-send': send,
  'message-receive': receive,
  'orbi-reply': orbiReply,
  'message-error': error,
};
