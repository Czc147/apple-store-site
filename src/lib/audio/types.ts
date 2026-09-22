/**
 * Orbi 消息提示音 —— 类型定义。
 *
 * 声音取向（用户需求）：借 Telegram「短、清脆、即时反馈」的**交互感觉**，
 * 但音色是 Orbi 自己的。**没有使用任何 Telegram 音频素材** ——
 * 四个音色全部由 Web Audio 现场合成（见 synth.ts），
 * 不依赖任何 mp3 文件，后续要换成成品音频见 sound-manager.ts 的 note 说明。
 */

export type SoundName =
  | 'message-send'
  | 'message-receive'
  | 'orbi-reply'
  | 'message-error';

export const SOUND_NAMES: SoundName[] = [
  'message-send',
  'message-receive',
  'orbi-reply',
  'message-error',
];

/** 每个音色的中文名与说明（设置面板直接用） */
export const SOUND_META: Record<
  SoundName,
  { label: string; hint: string }
> = {
  'message-send': { label: '发送消息声音', hint: '点发送时立刻响，不等服务器' },
  'message-receive': { label: '接收消息声音', hint: '收到别人的新消息时' },
  'orbi-reply': { label: 'Orbi 回复声音', hint: '小机器人回复你时' },
  'message-error': { label: '错误提示音', hint: '消息发送失败时' },
};

export interface SoundSettings {
  /** 总开关：关掉后其余分类开关保留状态但不发声 */
  enabled: boolean;
  sendEnabled: boolean;
  receiveEnabled: boolean;
  orbiEnabled: boolean;
  errorEnabled: boolean;
  /** 0–1 */
  volume: number;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  sendEnabled: true,
  receiveEnabled: true,
  orbiEnabled: true,
  errorEnabled: true,
  volume: 0.65,
};

/** 分类开关 → 对应的设置字段，避免 play() 里写一长串 if */
export const SOUND_SETTING_KEY: Record<SoundName, keyof SoundSettings> = {
  'message-send': 'sendEnabled',
  'message-receive': 'receiveEnabled',
  'orbi-reply': 'orbiEnabled',
  'message-error': 'errorEnabled',
};
