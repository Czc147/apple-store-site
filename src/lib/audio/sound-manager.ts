'use client';

import { VOICES } from './synth';
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_SETTING_KEY,
  type SoundName,
  type SoundSettings,
} from './types';

/** localStorage 键（需求书指定） */
export const SOUND_SETTINGS_KEY = 'orbi_sound_settings';

/** 连续消息分组窗口：这段时间内收到多条只响一次，避免"叮叮叮"轰炸 */
const RECEIVE_GROUP_MS = 420;

/** 已播 id 的保留上限：只防"同一条被处理两次"，不需要无限记忆 */
const PLAYED_ID_CACHE = 300;

/**
 * 成品音频覆盖表 —— **换音效的唯一入口**。
 *
 * 默认全空：四个音色由 Web Audio 现场合成（synth.ts），零资源、零请求。
 * 以后做好了正式音频，把 mp3 放进 `public/sounds/`，在这里登记一行即可：
 *
 *   'message-send': '/sounds/message-send.mp3',
 *
 * 登记后播放会优先用文件，**加载或播放失败自动回退到合成音**，
 * 所以文件没准备好、被 CDN 缓存住、或浏览器策略拦住都不会变成哑巴。
 * 调用方（soundManager.play(...)）完全不用改。
 */
export const FILE_SOURCES: Partial<Record<SoundName, string>> = {
  // 'message-send': '/sounds/message-send.mp3',
  // 'message-receive': '/sounds/message-receive.mp3',
  // 'orbi-reply': '/sounds/orbi-reply.mp3',
  // 'message-error': '/sounds/message-error.mp3',
};

function clampVolume(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SOUND_SETTINGS.volume;
  return Math.min(1, Math.max(0, n));
}

function loadSettings(): SoundSettings {
  if (typeof window === 'undefined') return DEFAULT_SOUND_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SOUND_SETTINGS_KEY);
    if (!raw) return DEFAULT_SOUND_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    // 逐字段校验：localStorage 里的东西不可信（手改过、旧版本残留）
    return {
      enabled: parsed.enabled !== false,
      sendEnabled: parsed.sendEnabled !== false,
      receiveEnabled: parsed.receiveEnabled !== false,
      orbiEnabled: parsed.orbiEnabled !== false,
      errorEnabled: parsed.errorEnabled !== false,
      volume: clampVolume(parsed.volume ?? DEFAULT_SOUND_SETTINGS.volume),
    };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

/**
 * Orbi 消息提示音管理器（单例）。
 *
 * 全站**只此一处**创建 AudioContext 与振荡器 —— 组件里绝不 `new Audio()`，
 * 也不各自建 AudioContext（Safari 对同时存在的 context 数量有硬限制，
 * 建多了会静默失效）。
 *
 * 关于音频文件：当前四个音色由 Web Audio **现场合成**（见 synth.ts），
 * 不依赖任何 mp3。要换成成品音频，把文件放进 `public/sounds/` 并在
 * `FILE_SOURCES` 里登记即可，播放路径会自动优先用文件、失败回退合成 ——
 * **不需要改任何调用方**。
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private settings: SoundSettings = DEFAULT_SOUND_SETTINGS;
  private listeners = new Set<() => void>();

  /** 成品音频的元素缓存（每种音一个，复用不新建） */
  private filePlayers = new Map<SoundName, HTMLAudioElement>();
  /** 已播过的消息 id（防同一条重复播放） */
  private playedIds: string[] = [];
  private playedIdSet = new Set<string>();
  /** 上一次接收音的时刻，用于连续消息分组 */
  private lastReceiveAt = 0;

  private unlockBound = false;
  /** 服务端渲染/静态导出期不碰 window */
  private get canUse() {
    return typeof window !== 'undefined';
  }

  constructor() {
    if (!this.canUse) return;
    this.settings = loadSettings();
    this.bindUnlock();
  }

  // ---------------------------------------------------------------- 设置

  /**
   * 用**箭头属性**而不是原型方法：它会被当作裸函数传给 useSyncExternalStore，
   * 原型方法那样传会丢 `this`，React 一调用就 `Cannot read properties of
   * undefined (reading 'settings')`，整个设置面板崩掉（实测踩过）。
   */
  getSettings = (): SoundSettings => this.settings;

  /** 订阅设置变化（配合 useSyncExternalStore） */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  updateSettings(patch: Partial<SoundSettings>): void {
    const next: SoundSettings = {
      ...this.settings,
      ...patch,
      ...(patch.volume !== undefined ? { volume: clampVolume(patch.volume) } : {}),
    };
    this.settings = next;
    if (this.master) this.master.gain.value = next.volume;
    try {
      window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式等禁用 localStorage：内存里生效即可，不阻断 */
    }
    this.listeners.forEach((fn) => fn());
  }

  // ---------------------------------------------------------------- 解锁

  /**
   * 绑定"首次用户手势时解锁音频"。
   * 浏览器的 autoplay 策略要求 AudioContext 在用户手势中创建/resume，
   * 否则一直是 suspended、play() 静默无声。这里挂一次全局监听，
   * 任何 pointerdown / keydown / touchstart 都会解锁，之后自动摘掉。
   */
  private bindUnlock(): void {
    if (this.unlockBound) return;
    this.unlockBound = true;

    const unlock = () => {
      void this.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  private ensureCtx(): AudioContext | null {
    if (!this.canUse) return null;
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.volume;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private async resume(): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* 被策略拒绝就算了，不能让它冒泡出去影响聊天 */
      }
    }
  }

  // ---------------------------------------------------------------- 播放

  /** 该音色此刻是否允许发声（总开关 + 分类开关） */
  private allowed(name: SoundName): boolean {
    if (!this.settings.enabled) return false;
    return this.settings[SOUND_SETTING_KEY[name]] === true;
  }

  /**
   * 播放一个音色。**永不抛错** —— 音频失败绝不能连累聊天功能。
   * 有登记成品音频就优先用文件，失败回退合成。
   */
  play(name: SoundName): void {
    if (!this.allowed(name)) return;
    const src = FILE_SOURCES[name];
    if (src) {
      this.playFile(name, src);
      return;
    }
    this.playSynth(name);
  }

  /** 合成音（默认路径） */
  private playSynth(name: SoundName): void {
    try {
      const ctx = this.ensureCtx();
      if (!ctx || !this.master) return;
      // 没解锁时 ctx 还是 suspended：调度了也不会响，但也不报错
      if (ctx.state === 'suspended') void this.resume();
      VOICES[name](ctx, this.master, ctx.currentTime);
    } catch {
      /* 静默 */
    }
  }

  /**
   * 成品音频路径。用 HTMLAudioElement 而不是 decodeAudioData：
   * mp3 动辄几十上百 KB，解码要等，而提示音的价值就在"即时"。
   * 复用同一批元素（每种音一个），不重复 new Audio —— 那正是需求书禁止的。
   */
  private playFile(name: SoundName, src: string): void {
    try {
      let el = this.filePlayers.get(name);
      if (!el) {
        el = new Audio(src);
        el.preload = 'auto';
        this.filePlayers.set(name, el);
      }
      el.volume = this.settings.volume;
      el.currentTime = 0;
      void el.play().catch(() => {
        // 文件缺失 / 被 autoplay 策略拦住 → 回退合成，不让它变成哑巴
        this.playSynth(name);
      });
    } catch {
      this.playSynth(name);
    }
  }

  /**
   * 带消息 id 的去重播放：同一条消息无论被处理几次，只响一次。
   * 这是需求书第六条的核心 —— 自己发的消息经服务器回显后不能再响一次。
   */
  playOnce(name: SoundName, messageId: string): void {
    if (this.playedIdSet.has(messageId)) return;
    this.remember(messageId);
    this.play(name);
  }

  /**
   * 接收音：先按 id 去重，再做分组去抖 ——
   * 短时间内连收多条只响一次，但消息本身照常全部显示（这里不动数据）。
   */
  playReceive(messageId: string): void {
    if (this.playedIdSet.has(messageId)) return;
    this.remember(messageId);

    const now = Date.now();
    if (now - this.lastReceiveAt < RECEIVE_GROUP_MS) return;
    this.lastReceiveAt = now;
    this.play('message-receive');
  }

  private remember(id: string): void {
    this.playedIdSet.add(id);
    this.playedIds.push(id);
    if (this.playedIds.length > PLAYED_ID_CACHE) {
      // 只保留最近的：更早的 id 不可能再被处理一次
      const dropped = this.playedIds.shift();
      if (dropped) this.playedIdSet.delete(dropped);
    }
  }

  /** 供测试/登出时清空去重记忆 */
  resetPlayed(): void {
    this.playedIds = [];
    this.playedIdSet.clear();
    this.lastReceiveAt = 0;
  }
}

export const soundManager = new SoundManager();
