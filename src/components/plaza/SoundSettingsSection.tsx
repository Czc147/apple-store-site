'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useSoundSettings } from '@/lib/audio/use-sound-settings';
import { soundManager } from '@/lib/audio/sound-manager';
import {
  SOUND_META,
  SOUND_NAMES,
  SOUND_SETTING_KEY,
  type SoundName,
  type SoundSettings,
} from '@/lib/audio/types';
import { cn } from '@/lib/cn';

/**
 * 声音与通知 —— 设置页里的一个区块（需求书第十二条）。
 *
 * 原来是独立的 BottomSheet（对话板块右上角「声音与通知」按钮打开）。
 * 用户 #4 要求做「总设置」后并进这里：**设置只有一处落点**，
 * 不然用户在设置页找不到声音、又得回对话板块，等于没做总设置。
 * 面板内容与交互一字未改，只是从弹层搬进页面。
 *
 * 开关配色用站点的品牌蓝而不是聊天气泡的橙：全站的控件都是蓝的，
 * 这里跟齐才不会显得是一个格格不入的独立模块（橙留给 Orbi 与气泡）。
 *
 * 每项开关都**立即生效并立刻试听**（分类音打开时播一次），
 * 否则用户调完不知道有没有生效，还得回聊天里等一条消息来验证。
 */
export default function SoundSettingsSection() {
  const [settings, update] = useSoundSettings();

  const set = (patch: Partial<SoundSettings>) => update(patch);

  const toggleCategory = (name: SoundName) => {
    const key = SOUND_SETTING_KEY[name];
    const next = !settings[key];
    set({ [key]: next } as Partial<SoundSettings>);
    // 打开时试听一次（关掉时不响，这是用户明确的意图）
    if (next && settings.enabled) soundManager.play(name);
  };

  return (
    <div className="divide-y divide-apple-hairline">
      {/* 总开关 */}
      <Row
        title="声音"
        hint={settings.enabled ? '聊天提示音已开启' : '全部提示音已关闭'}
        control={
          <Switch
            checked={settings.enabled}
            label="声音总开关"
            onChange={(next) => {
              set({ enabled: next });
              if (next) {
                // 从关到开：用接收音给个即时反馈，让用户确认真的能响了
                window.setTimeout(() => soundManager.play('message-receive'), 0);
              }
            }}
          />
        }
      />

      {/* 分类开关：总开关关掉时整组禁用但仍显示，避免用户找不到 */}
      {SOUND_NAMES.map((name) => {
        const key = SOUND_SETTING_KEY[name];
        const on = settings[key] === true;
        return (
          <Row
            key={name}
            title={SOUND_META[name].label}
            hint={SOUND_META[name].hint}
            dimmed={!settings.enabled}
            control={
              <Switch
                checked={on}
                disabled={!settings.enabled}
                label={SOUND_META[name].label}
                onChange={() => toggleCategory(name)}
              />
            }
          />
        );
      })}

      {/* 音量 */}
      <div className={cn('py-4', !settings.enabled && 'opacity-45')}>
        <div className="flex items-center justify-between">
          <span className="text-md font-medium text-apple-text">音量</span>
          <span className="text-sm tabular-nums text-apple-text-2">
            {Math.round(settings.volume * 100)}%
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <VolumeX className="h-4 w-4 flex-none text-apple-text-3" aria-hidden />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            disabled={!settings.enabled}
            aria-label="音量"
            onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
            // 松手才试听：拖动过程中每一档都响会很吵
            onPointerUp={() => soundManager.play('message-send')}
            onKeyUp={() => soundManager.play('message-send')}
            className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-apple-bg accent-apple-blue disabled:cursor-default"
          />
          <Volume2 className="h-4 w-4 flex-none text-apple-text-3" aria-hidden />
        </div>

        <p className="mt-3 text-2xs leading-relaxed text-apple-text-3">
          提示音是现场合成的，不占流量、不下载音频文件。设置会保存在本机浏览器里。
        </p>
      </div>
    </div>
  );
}

function Row({
  title,
  hint,
  control,
  dimmed = false,
}: {
  title: string;
  hint?: string;
  control: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className={cn('flex min-h-[52px] items-center gap-3 py-3.5', dimmed && 'opacity-45')}>
      <div className="min-w-0 flex-1">
        <p className="text-md font-medium text-apple-text">{title}</p>
        {hint && <p className="mt-0.5 text-2xs text-apple-text-3">{hint}</p>}
      </div>
      {control}
    </div>
  );
}

/**
 * 开关。项目 ui/ 里没有 Switch primitive，这里按现有设计语言补一个：
 * 44pt 命中区、品牌蓝选中态、150ms 过渡、键盘可达（真实 checkbox，
 * 读屏与空格键天然可用，不必自己糊 role="switch"）。
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'relative inline-flex flex-none items-center',
        disabled ? 'cursor-default' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'h-[31px] w-[51px] rounded-full transition-colors duration-base ease-apple',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-apple-blue/40 peer-focus-visible:ring-offset-2',
          checked ? 'bg-apple-blue' : 'bg-apple-border',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-card',
          'transition-transform duration-base ease-apple',
          checked && 'translate-x-[20px]',
        )}
      />
      {/* 命中区撑到 44pt（视觉仍是 31px 高） */}
      <span aria-hidden className="absolute -inset-y-[7px] -inset-x-1" />
    </label>
  );
}
