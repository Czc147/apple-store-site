'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Headphones } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Orbi, { type OrbiMood } from '@/components/orbi/Orbi';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import type { ChatMessage } from '@/lib/chat-types';
import { soundManager } from '@/lib/audio/sound-manager';
import { useDmUnread } from '@/lib/dm-unread-store';
// 参考项目的聊天样式原样引入（末尾有一小段本仓适配，见该文件注释）
import '@/components/chat/Chat.css';
import {
  OFFICIAL_PEER_ID,
  fetchMessages,
  sendMessage,
  type DmMessage,
  type DmThread,
} from '@/lib/dm';

interface DmThreadViewProps {
  thread: DmThread;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onBack: () => void;
  /** 有新消息时通知外层刷新会话列表（未读数、最后一条要跟着变） */
  onChanged: () => void;
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * 单个会话的聊天视图。
 *
 * **整体复用参考项目**（`C:\Users\22346\Documents\ChatGPT\svg动画`）的
 * Chat 三件套与 Chat.css：气泡（橙色、不对称圆角、220ms 入场）、
 * 列表滚动、输入条与表情面板都是原样，本站只补了安全区与头像位。
 *
 * Orbi 的状态流也按参考项目的设计接上：
 *   进会话 idle → 聚焦输入框 thinking → 发出并收到回复 wave → 回 idle。
 * 那只大 Orbi 只出现在空会话里当欢迎形象，随内容滚动，
 * 不做原项目那种悬停在输入框上方的东西（本站是嵌在广场里的子视图）。
 */
export default function DmThreadView({
  thread,
  getAuthHeaders,
  onBack,
  onChanged,
}: DmThreadViewProps) {
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [mood, setMood] = useState<OrbiMood>('idle');
  /** 只用来在失败态变化时触发重渲染（真正的数据在 failedIdsRef 里，见上） */
  const [failedTick, setFailedTick] = useState(0);
  const waveTimer = useRef<number | null>(null);

  const isOfficial = thread.is_official;

  /**
   * onChanged 放进 ref 而不是 load 的依赖项。
   *
   * ⚠️ 这是必须的：外层传的是内联箭头（`() => void loadAll()`），每次渲染都是
   * 新身份。若把它写进 load 的 deps，load 就会每渲染变一次 → 下面那个
   * 「换会话重置」的 effect 跟着每渲染重跑 → setMessages(null) → 再渲染 → 死循环。
   * 表现就是**消息一进列表就消失**（与用户报的"发出去秒消失"同一症状）。
   * 用 ref 拿最新回调，load 的身份保持稳定。
   */
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  /**
   * 私信未读角标（「对话」按钮上的红点）。
   * 同样走 ref：refresh 每次渲染都是新函数，写进 load 的 deps 会引发上面注释里
   * 那个死循环（消息一进列表就消失）。
   */
  const { refresh: refreshDmUnread } = useDmUnread();
  const refreshUnreadRef = useRef(refreshDmUnread);
  useEffect(() => {
    refreshUnreadRef.current = refreshDmUnread;
  }, [refreshDmUnread]);

  /** 发送失败的消息 id —— 它们不在服务端，轮询回来时要保住（见 load） */
  const failedIdsRef = useRef<Set<string>>(new Set());
  /**
   * 密集轮询的截止时间戳：刚发完消息的 60 秒内每 3 秒拉一次（见下面的轮询 effect）。
   * 等回复的那一小段时间是体感最关键的地方，平时则没必要这么频。
   */
  const burstUntilRef = useRef(0);
  /**
   * 立刻唤醒轮询链（由下面的 effect 挂上）。
   *
   * 为什么需要它：定时器是"拉完再排下一次"，如果发消息时正好挂着一个 18 秒的
   * 定时器，光设 burstUntilRef 是没用的 —— 得等那一轮跑完才会改成 3 秒。
   * 实测表现就是"发完消息还要等 8 秒才看到回复"。这里直接打断重排。
   */
  const wakeRef = useRef<(() => void) | null>(null);
  /**
   * 会话被锁的原因。目前只有一种：好友关系被删了 ——
   * 会话列表是按消息记录聚合的，删了好友旧会话仍在列表里，
   * 点进来会 403。不把原因说出来，用户看到的就是"空白会话 + 发不出去"。
   */
  const [blocked, setBlocked] = useState(false);
  /**
   * 与官方对话时：是否正被人工接管（迁移 031）。接管期间服务端会暂停自动回复，
   * 界面要说清楚 —— 否则用户发完消息等不到机器人回，只会以为坏了。
   */
  const [agentActive, setAgentActive] = useState(false);
  /** 发送失败时服务端给的原话（如「你们还不是好友」） */
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchMessages(getAuthHeaders, thread.peer_id);
    if (!res.ok) {
      if (res.reason === 'not-friend') setBlocked(true);
      return;
    }
    setBlocked(false);
    setAgentActive(res.agentActive);
    const list = res.messages;
    setMessages((prev) => {
      // 失败的消息服务端没有，轮询/刷新时要把它们接回来，否则用户刚看到
      // "发送失败，点击重试"，20 秒后它自己没了
      const stillFailed = (prev ?? []).filter((m) => failedIdsRef.current.has(m.id));
      return [...list, ...stillFailed];
    });
    // 拉取即已在服务端标记已读，但**外层会话列表的未读数还是旧的** ——
    // 不通知它刷新，退出去那个红点会一直挂着（用户报的 bug #10）。
    onChangedRef.current();
    // 「对话」按钮上的红点同源：读完立刻重拉，不用等下一个 30s 轮询周期
    void refreshUnreadRef.current();
  }, [getAuthHeaders, thread.peer_id]);

  useEffect(() => {
    setMessages(null);
    setMood('idle');
    seenIdsRef.current = null; // 换会话要重置"已见过"的记忆
    void load();
  }, [load]);

  /**
   * 新消息进入列表 → 接收音。
   *
   * 为什么用"监听列表变化"而不是在发送/拉取的回调里直接播：
   * 这个判断只依赖最终数据，不管消息是轮询来的、以后接了推送来的、
   * 还是别处塞进来的，都自动生效，也不用在 setState 的更新函数里塞副作用
   * （React 严格模式会把更新函数跑两遍 → 声音会响两次）。
   *
   * 三条规则：
   * - **首帧不响**：打开会话不该叮一声（与 Telegram 一致）
   * - **自己的消息不响**：需求书第六条的核心。自己发的消息经服务器回显后
   *   会再次进入列表，若按"新消息"处理就会 send 之后再 receive 响一次
   * - **官方消息不响**：官方回复走 orbi-reply 那条路，两边都响就重了
   */
  const seenIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!messages) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(messages.map((m) => m.id));
      return;
    }
    const seen = seenIdsRef.current;
    for (const m of messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (!m.mine && m.sender_id !== OFFICIAL_PEER_ID) {
        soundManager.playReceive(m.id);
      }
    }
  }, [messages]);

  /**
   * 自适应轮询。
   *
   * 原实现有两处坑（2026-09-22 用户报「客服回复了，我得退出重进才看得到」）：
   * 1. **官方会话压根不轮询** —— 当时的假设是"官方的回复由发送接口同步返回"。
   *    有了人工客服之后这个假设就不成立了：站长是在后台**异步**回复的，
   *    用户端没有任何机制去拿，只能退出重进。
   * 2. 固定 20 秒太钝 —— 等回复的时候最需要即时。
   *
   * 现在改成：发完消息后的 60 秒内每 3 秒拉一次（等回复的窗口体感最关键），
   * 平时 18 秒；页面不可见时降到 30 秒省请求，**切回前台立刻拉一次**。
   */
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (!document.hidden) await load();
      if (cancelled) return;
      const bursting = Date.now() < burstUntilRef.current;
      timer = window.setTimeout(tick, document.hidden ? 30000 : bursting ? 3000 : 18000);
    };

    // 首次延迟一会儿：挂载时已经 load 过一次了，别马上再来一发
    timer = window.setTimeout(tick, 15000);

    // 供 handleSend 打断当前排期、立刻进入密集轮询
    wakeRef.current = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      void tick();
    };

    const onVisible = () => {
      if (document.hidden || cancelled) return;
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      wakeRef.current = null;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(
    () => () => {
      if (waveTimer.current !== null) window.clearTimeout(waveTimer.current);
    },
    [],
  );

  const handleSend = async (text: string) => {
    const content = text.trim();
    if (!content) return;

    // 发送音：**立刻响，不等服务器**（需求书第二条 A）。
    // 等 ACK 再响的话，网络一慢就会出现"气泡都出来了才叮一声"的错位感。
    soundManager.play('message-send');

    // 乐观插入自己那条；服务端返回后用真实行替换，官方回复一并追加
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...(prev ?? []),
      {
        id: tempId,
        sender_id: 'me',
        recipient_id: thread.peer_id,
        content,
        created_at: new Date().toISOString(),
        read_at: null,
        mine: true,
        // 自己发的永远是普通消息（agent/system 只会出现在官方那一侧）
        kind: 'text',
      },
    ]);
    setMood('idle');
    // 进入密集轮询窗口：接下来 60 秒每 3 秒看一眼有没有回复。
    // 并且**立刻打断当前排期**，否则可能要干等一个 18 秒的周期（实测踩过）。
    burstUntilRef.current = Date.now() + 60_000;
    wakeRef.current?.();

    const result = await sendMessage(getAuthHeaders, thread.peer_id, content);
    if (!result.ok) {
      // 失败：**保留气泡并标红**，给一声低沉短音（不是刺耳的报警声）。
      // 原来是把这条直接撤掉 —— 用户只看到"消息秒消失"，既不知道失败了
      // 也不知道该怎么办（用户报的 bug #3）。
      soundManager.play('message-error');
      failedIdsRef.current.add(tempId);
      setFailedTick((n) => n + 1); // 触发一次重渲染把失败态画出来
      setSendError(result.error);
      // 「还不是好友」是会话级状态，直接锁输入框，不用等下次取数
      if (result.error.includes('好友')) setBlocked(true);
      return;
    }
    setSendError(null);
    failedIdsRef.current.delete(tempId);

    setMessages((prev) => [
      ...(prev ?? []).filter((m) => m.id !== tempId),
      result.mine,
      ...(result.reply ? [result.reply] : []),
    ]);

    if (result.reply && isOfficial) {
      // Orbi 回复音：与回复气泡同时出现（按 id 去重，重试/重渲染不会重复响）
      soundManager.playOnce('orbi-reply', result.reply.id);
      // 收到回复 → 挥一次手（与参考项目「收到回复 → wave」一致）
      setMood('wave');
      if (waveTimer.current !== null) window.clearTimeout(waveTimer.current);
      waveTimer.current = window.setTimeout(() => setMood('idle'), 1200);
    }
    onChanged();
  };

  // DmMessage → 参考项目的气泡数据结构
  const chatMessages: ChatMessage[] = (messages ?? []).map((m) => ({
    id: m.id,
    text: m.content,
    mine: m.mine,
    time: hhmm(m.created_at),
    status: failedIdsRef.current.has(m.id) ? 'failed' : 'sent',
    // 客服相关（迁移 031）：agent 打「客服」标签、system 渲染成居中灰字
    kind: m.kind,
  }));

  /** 点失败的气泡 → 删掉旧的、按同样内容重发 */
  const retryFailed = (messageId: string) => {
    const target = (messages ?? []).find((m) => m.id === messageId);
    if (!target) return;
    failedIdsRef.current.delete(messageId);
    setMessages((prev) => (prev ?? []).filter((m) => m.id !== messageId));
    void handleSend(target.content);
  };

  return (
    // 全屏浮层：盖住广场的板块栏与标题，聊天自己占满一屏
    <div className="chat-page fixed inset-0 z-sheet">
      <header className="chat-header">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回会话列表"
          className="-ml-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>

        <div className="chat-header-avatar">
          {isOfficial ? (
            <Orbi size={44} mood={mood} interactive={false} />
          ) : (
            // 头像与名字都可点 → 进他的主页（在那里可以删好友，见用户需求 #6）
            <Link
              href={`/u/${thread.peer_id}`}
              aria-label={`查看 ${thread.author?.display_name ?? '好友'} 的主页`}
              className="pressable-soft block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
            >
              <Avatar
                avatarKey={thread.author?.avatar_key}
                avatarUrl={thread.author?.avatar_url}
                name={thread.author?.display_name}
                size={44}
              />
            </Link>
          )}
        </div>

        <div className="chat-header-info min-w-0 flex-1">
          <h1 className="truncate">
            {isOfficial ? (
              'Zorvin 官方'
            ) : (
              <Link
                href={`/u/${thread.peer_id}`}
                className="transition-opacity duration-fast hover:opacity-70"
              >
                {thread.author?.display_name ?? '好友'}
              </Link>
            )}
          </h1>
          <span>{isOfficial && !agentActive ? '小机器人随时待命' : isOfficial ? '客服已介入' : '好友'}</span>
        </div>
      </header>

      {/* 客服接管横幅：告诉用户「刚才是机器人，现在是真人」，
          也解释了他为什么收不到自动回复了 */}
      {isOfficial && agentActive && (
        <div className="flex items-center justify-center gap-1.5 border-b border-apple-hairline bg-apple-blue-soft px-4 py-2 text-xs text-apple-blue">
          <Headphones className="h-3.5 w-3.5 flex-none" aria-hidden />
          客服已介入，正在为你处理
        </div>
      )}

      <MessageList
        messages={chatMessages}
        onRetry={retryFailed}
        renderAvatar={() =>
          isOfficial ? (
            <Orbi size={28} interactive={false} />
          ) : (
            <Avatar
              avatarKey={thread.author?.avatar_key}
              avatarUrl={thread.author?.avatar_url}
              name={thread.author?.display_name}
              size={28}
            />
          )
        }
        empty={isOfficial ? <OfficialWelcome /> : null}
      />

      {/* 会话被锁（好友关系已删）时不给输入框，换成一条说明 ——
          留着输入框却发不出去，用户只会一遍遍重试 */}
      {blocked ? (
        <div className="border-t border-apple-hairline bg-apple-card px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <p className="text-center text-sm text-apple-text-2">
            你们已不是好友，无法继续发消息。
          </p>
          <p className="mt-1 text-center text-2xs text-apple-text-3">
            之前的聊天记录也一并不可见了；重新加为好友即可恢复。
          </p>
        </div>
      ) : (
        <MessageInput
          onSend={(text) => void handleSend(text)}
          onFocus={() => setMood('thinking')}
          onBlur={() => setMood('idle')}
        />
      )}

      {/* 非会话级的发送错误（限流、网络抖动）：浮一条提示，几秒后自动消失 */}
      {sendError && !blocked && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--plaza-bar-h)+72px)] px-4">
          <p
            className="mx-auto max-w-[320px] rounded-card bg-apple-danger/90 px-3.5 py-2 text-center text-sm text-white shadow-popover"
            role="alert"
          >
            {sendError}
          </p>
        </div>
      )}
    </div>
  );
}

/** 空会话的欢迎形象：一只大 Orbi（官方会话才有） */
function OfficialWelcome() {
  return (
    <div className="flex flex-col items-center px-6 py-6 text-center">
      <Orbi size={150} interactive={false} />
      <p className="mt-3 text-md font-medium text-apple-text">我是 Orbi</p>
      <p className="mt-1 max-w-[300px] text-sm leading-relaxed text-apple-text-2">
        留言给我就行，我看到会转达给官方；急事也可以直接联系客服。
      </p>
    </div>
  );
}
