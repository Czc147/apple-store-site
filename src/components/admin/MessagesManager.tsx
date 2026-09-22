'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Send, UserRound } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { PageHeader, Notice, Badge, btnPrimary, btnGhost, textareaCls } from './ui';

/** 详情轮询间隔：用户可能在你看着的时候又发一条 */
const POLL_MS = 10_000;

interface ConversationRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
  last_content: string;
  last_at: string;
  last_kind: string;
  /**
   * 已回 = **人工**回复晚于用户最后一条。
   * 注意不是"最后一条是不是官方发的" —— 机器人自动回复也算官方，
   * 那样每个人一发消息就会显示成已回，这个标记就没意义了。
   */
  replied: boolean;
  agent_active: boolean;
  agent_started_at: string | null;
}

interface MessageRow {
  id: string;
  content: string;
  created_at: string;
  kind: 'text' | 'agent' | 'system';
  from_official: boolean;
}

interface Detail {
  user: { user_id: string; display_name: string | null; avatar_key: string | null; avatar_url: string | null };
  agent_active: boolean;
  agent_started_at: string | null;
  messages: MessageRow[];
}

function timeText(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function fullTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** 取一个显示名：**优先邮箱**（站长认邮箱比认昵称快，昵称可能重复或乱写） */
function titleOf(row: { email: string | null; display_name: string | null }): string {
  return row.email || row.display_name || '（未知用户）';
}

/**
 * 留言管理（2026-09-22）：用户给官方的留言，站长在这里看和回。
 *
 * 三条设计取舍：
 * 1. **按用户聚合**，不是一条消息一行 —— 站长要回答的是"谁在找我"，不是"有哪些消息"。
 * 2. **用「已回/待回复」而不是「已读/未读」** —— 待回复 = 最后一条是用户发的，
 *    一眼扫出谁还等着；已读未读是"我看过没"，跟用户无关。
 * 3. **接入是显式按钮**，打开会话不算接管 —— 否则你只是点开看看，
 *    自动回复就被停了而你又没说话，用户发来的消息会彻底没人回。
 */
export default function MessagesManager() {
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const res = await adminFetch('/api/admin/messages');
    if (!res.ok) {
      setRows([]);
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    const data = (await res.json()) as { items: ConversationRow[]; waiting_count: number };
    setRows(data.items ?? []);
    setWaiting(data.waiting_count ?? 0);
  }, []);

  const loadDetail = useCallback(async (userId: string) => {
    const res = await adminFetch(`/api/admin/messages/${userId}`);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    setDetail((await res.json()) as Detail);
  }, []);

  useEffect(() => {
    void loadList();
    // 列表也要轮询：用户在你看后台的时候发来新留言，不轮询就得手动刷页面才看得见。
    // 15 秒够用（后台是坐着看的地方，不像聊天窗口要求即时）。
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadList();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    void loadDetail(activeId);
    const timer = window.setInterval(() => void loadDetail(activeId), POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadDetail]);

  // 新消息进来时滚到底（只在这个会话里滚，不打扰列表）
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length, activeId]);

  /** 接入 / 结束人工服务 */
  const toggleAgent = async (active: boolean) => {
    if (!activeId) return;
    setBusy(true);
    const res = await adminFetch(`/api/admin/messages/${activeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    setBusy(false);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    await Promise.all([loadDetail(activeId), loadList()]);
    setNotice({ ok: true, text: active ? '已接入，自动回复已暂停' : '已结束服务，自动回复已恢复' });
  };

  /** 列表里直接结束服务（不用进会话） */
  const endFromList = async (userId: string) => {
    setBusy(true);
    const res = await adminFetch(`/api/admin/messages/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    setBusy(false);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    if (activeId === userId) await loadDetail(userId);
    await loadList();
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || !activeId || busy) return;
    setBusy(true);
    const res = await adminFetch(`/api/admin/messages/${activeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setBusy(false);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    const data = (await res.json()) as { took_over?: boolean };
    setDraft('');
    await Promise.all([loadDetail(activeId), loadList()]);
    setNotice(
      data.took_over
        ? { ok: true, text: '已发送，并自动接入客服（自动回复暂停）' }
        : { ok: true, text: '已发送' },
    );
  };

  const activeRow = rows?.find((r) => r.user_id === activeId) ?? null;

  return (
    <>
      <PageHeader
        title="留言管理"
        description={
          waiting > 0
            ? `用户给官方的留言 · 还有 ${waiting} 条待回复`
            : '用户给官方的留言 · 当前没有待回复'
        }
      />

      <Notice notice={notice} />

      <div className="mt-4 flex gap-4" style={{ minHeight: '60vh' }}>
        {/* ---------- 左：会话列表（按用户聚合） ---------- */}
        <div className="w-[340px] flex-none overflow-hidden rounded-lg border border-apple-border bg-white">
          <div className="border-b border-apple-hairline bg-apple-bg px-3 py-2 text-[12px] font-medium text-apple-text-2">
            共 {rows?.length ?? 0} 位用户留言
          </div>
          <div className="max-h-[62vh] overflow-y-auto">
            {rows === null ? (
              <p className="px-3 py-6 text-center text-[13px] text-apple-text-3">加载中…</p>
            ) : rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-apple-text-3">还没有用户给官方留言</p>
            ) : (
              rows.map((r) => (
                <button
                  key={r.user_id}
                  type="button"
                  onClick={() => setActiveId(r.user_id)}
                  className={`block w-full border-b border-apple-hairline px-3 py-2.5 text-left transition-colors hover:bg-apple-bg ${
                    activeId === r.user_id ? 'bg-apple-blue-soft' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-apple-text">
                      {titleOf(r)}
                    </span>
                    <span className="flex-none text-[11px] text-apple-text-3">{timeText(r.last_at)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {r.replied ? (
                      <Badge tone="gray">已回</Badge>
                    ) : (
                      <Badge tone="red">待回复</Badge>
                    )}
                    {r.agent_active && <Badge tone="blue">客服接管中</Badge>}
                    {r.agent_active && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!busy) void endFromList(r.user_id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.stopPropagation(); void endFromList(r.user_id); }
                        }}
                        className="ml-auto flex-none cursor-pointer text-[11px] text-apple-blue hover:underline"
                      >
                        结束服务
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[12px] text-apple-text-2">{r.last_content}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ---------- 右：会话详情 ---------- */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-apple-border bg-white">
          {!activeId || !detail ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-apple-text-3">
              <UserRound className="h-6 w-6" />
              <p className="text-[13px]">从左边选一位用户查看对话</p>
            </div>
          ) : (
            <>
              {/* 顶部：用户信息 + 接入/结束 */}
              <div className="flex items-center gap-2 border-b border-apple-hairline px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-apple-text">
                    {titleOf({ email: activeRow?.email ?? null, display_name: detail.user.display_name })}
                  </p>
                  <p className="mt-0.5 text-[11px] text-apple-text-3">
                    {detail.agent_active
                      ? `客服接管中${detail.agent_started_at ? ` · 开始于 ${fullTime(detail.agent_started_at)}` : ''} · 自动回复已暂停`
                      : '机器人自动应答中'}
                  </p>
                </div>
                {detail.agent_active ? (
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => void toggleAgent(false)}
                  >
                    结束服务
                  </button>
                ) : (
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() => void toggleAgent(true)}
                  >
                    <Headphones className="mr-1 inline h-3.5 w-3.5" />
                    接入客服
                  </button>
                )}
              </div>

              {/* 消息区 */}
              <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-apple-bg/40 px-4 py-3" style={{ maxHeight: '50vh' }}>
                {detail.messages.map((m) =>
                  m.kind === 'system' ? (
                    <p key={m.id} className="py-1 text-center text-[11px] text-apple-text-3">
                      {m.content}
                    </p>
                  ) : (
                    <div key={m.id} className={`flex ${m.from_official ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[70%]">
                        {m.from_official && (
                          <p className="mb-0.5 text-right text-[10px] text-apple-text-3">
                            {m.kind === 'agent' ? '客服（人工）' : '官方（自动）'}
                          </p>
                        )}
                        <div
                          className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                            m.from_official
                              ? 'bg-apple-blue text-white'
                              : 'border border-apple-border bg-white text-apple-text'
                          }`}
                        >
                          {m.content}
                        </div>
                        <p className={`mt-0.5 text-[10px] text-apple-text-3 ${m.from_official ? 'text-right' : ''}`}>
                          {fullTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>

              {/* 回复框 */}
              <div className="border-t border-apple-hairline p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={3}
                  placeholder={
                    detail.agent_active
                      ? '以官方身份回复…（⌘/Ctrl + Enter 发送）'
                      : '以官方身份回复… 发送后会自动接入客服、暂停自动回复'
                  }
                  className={textareaCls + ' resize-y'}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-apple-text-3">
                    {detail.agent_active ? '自动回复已暂停，用户只会收到你的回复' : '发送后自动暂停自动回复'}
                  </p>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy || !draft.trim()}
                    onClick={() => void send()}
                  >
                    <Send className="mr-1 inline h-3.5 w-3.5" />
                    发送
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
