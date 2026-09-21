'use client';

import { useState } from 'react';
import { Plus, Search, Send, Trash2, UserRound, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import FileUploader from '@/components/admin/FileUploader';
import { PageHeader, Field, inputCls, textareaCls, btnPrimary, btnGhost, Notice } from '@/components/admin/ui';

interface FoundUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_key: string | null;
  avatar_url?: string | null;
}

interface PushItem {
  key: string;
  name: string;
  description: string;
  media_url: string | null;
}

function newItem(): PushItem {
  return { key: Math.random().toString(36).slice(2), name: '', description: '', media_url: null };
}

/**
 * 推送服务：选择/手填注册用户 → 上传文件（可选，可多个）→ 推送进用户库并通知。
 * - 「选择注册用户」拉 GET /api/admin/users 列表（本地搜索过滤），点选即锁定对象
 * - 手填邮箱查找保留为兜底（老账号 / 列表未覆盖时）
 * - 文件非必选：纯文字条目（名称 + 说明/备注）也能推送
 */
export default function PushManager() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [notSearched, setNotSearched] = useState(true);

  // 注册用户选择器（懒加载：首次展开才拉列表）
  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState<FoundUser[] | null>(null);
  const [usersError, setUsersError] = useState('');
  const [userQuery, setUserQuery] = useState('');

  const [items, setItems] = useState<PushItem[]>([newItem()]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const showNotice = (n: { ok: boolean; text: string }) => {
    setNotice(n);
    setTimeout(() => setNotice(null), 2500);
  };

  const togglePicker = async () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(true);
    if (users !== null) return; // 已加载过
    setUsersError('');
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setUsersError(data?.error ?? '加载用户列表失败');
        return;
      }
      setUsers(Array.isArray(data.users) ? (data.users as FoundUser[]) : []);
    } catch {
      setUsersError('加载用户列表失败，请重试');
    }
  };

  /** 选中用户：直接锁定对象，省掉一次邮箱查找 */
  const pickUser = (u: FoundUser) => {
    setEmail(u.email ?? '');
    setFound(u);
    setSearchError('');
    setNotSearched(false);
    setPickerOpen(false);
    setUserQuery('');
  };

  const q = userQuery.trim().toLowerCase();
  const filteredUsers = (users ?? []).filter(
    (u) =>
      !q ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q),
  );

  const handleSearch = async () => {
    const trimmed = email.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setSearchError('');
    setFound(null);
    try {
      const res = await fetch(`/api/admin/push?email=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      if (!res.ok) {
        setSearchError(data?.error ?? '该邮箱未注册');
      } else {
        setFound(data as FoundUser);
      }
    } catch {
      setSearchError('查询失败，请重试');
    } finally {
      setSearching(false);
      setNotSearched(false);
    }
  };

  const updateItem = (key: string, patch: Partial<PushItem>) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((list) => (list.length > 1 ? list.filter((it) => it.key !== key) : list));
  };

  // 文件非必选：只要求每项有名称（纯文字条目合法），有对象即可推送
  const canSubmit =
    Boolean(found) && items.length > 0 && items.every((it) => it.name.trim()) && !sending;

  const handlePush = async () => {
    if (!found || !canSubmit) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: found.email,
          items: items.map((it) => ({
            name: it.name.trim(),
            media_url: it.media_url,
            description: it.description.trim() || null,
          })),
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      if (!res.ok) {
        showNotice({ ok: false, text: data?.error ?? '推送失败' });
      } else {
        showNotice({ ok: true, text: `已推送 ${data.pushed} 项内容` });
        setItems([newItem()]);
        setNote('');
      }
    } catch {
      showNotice({ ok: false, text: '网络错误，推送失败' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="推送服务"
        description="选择注册用户，把文件或纯文字内容直接推送进对方的「我的库」"
      />

      <div className="rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
        <Field label="推送对象" required hint="从注册用户里选，或手填邮箱查找">
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder="user@example.com"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching || !email.trim()}
              className={btnGhost}
            >
              <Search className="h-4 w-4" aria-hidden />
              {searching ? '查找中…' : '查找'}
            </button>
            <button type="button" onClick={() => void togglePicker()} className={btnGhost}>
              <UserRound className="h-4 w-4" aria-hidden />
              选择注册用户
            </button>
          </div>
        </Field>

        {pickerOpen && (
          <div className="mt-3 rounded-xl border border-apple-border bg-apple-bg p-3">
            <div className="flex items-center gap-2">
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="搜索邮箱或昵称"
                className={`${inputCls} bg-white`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="关闭用户列表"
                className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-apple-text-3 transition hover:bg-white hover:text-apple-text"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {usersError ? (
              <p className="mt-3 text-[13px] text-[#D70015]">{usersError}</p>
            ) : users === null ? (
              <p className="mt-3 text-[13px] text-apple-text-3">加载中…</p>
            ) : filteredUsers.length === 0 ? (
              <p className="mt-3 text-[13px] text-apple-text-3">
                {users.length === 0 ? '暂无注册用户' : '没有匹配的用户'}
              </p>
            ) : (
              <ul className="mt-2 max-h-72 overflow-y-auto">
                {filteredUsers.map((u) => (
                  <li key={u.user_id}>
                    <button
                      type="button"
                      onClick={() => pickUser(u)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white active:scale-[0.99]"
                    >
                      <Avatar
                        avatarKey={u.avatar_key}
                        avatarUrl={u.avatar_url}
                        name={u.display_name ?? u.email}
                        size={32}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-apple-text">
                          {u.display_name ?? '（未设置昵称）'}
                        </span>
                        <span className="block truncate text-[12px] text-apple-text-3">
                          {u.email}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!notSearched && searchError && (
          <p className="mt-3 text-[13px] text-[#D70015]">{searchError}</p>
        )}

        {found && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-apple-border bg-apple-bg px-3.5 py-3">
            <Avatar
              avatarKey={found.avatar_key}
              avatarUrl={found.avatar_url}
              name={found.display_name ?? found.email}
              size={36}
            />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-apple-text">
                {found.display_name ?? '（未设置昵称）'}
              </p>
              <p className="truncate text-[12.5px] text-apple-text-3">{found.email}</p>
            </div>
          </div>
        )}
      </div>

      {found && (
        <div className="mt-5 space-y-4">
          {items.map((item, idx) => (
            <div key={item.key} className="rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-apple-text">内容 {idx + 1}</p>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="inline-flex items-center gap-1 text-[12.5px] text-apple-text-3 transition hover:text-[#D70015]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    移除
                  </button>
                )}
              </div>

              <Field label="文件" hint="可选；留空即为纯文字内容（只展示名称与说明）">
                <FileUploader
                  value={item.media_url}
                  onChange={(url) => updateItem(item.key, { media_url: url })}
                />
              </Field>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="名称" required>
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(item.key, { name: e.target.value })}
                    maxLength={100}
                    placeholder="展示给用户的名称"
                    className={inputCls}
                  />
                </Field>
                <Field label="说明" hint="可选，显示在该内容名称下方">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    maxLength={500}
                    placeholder="这一项的说明"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setItems((list) => [...list, newItem()])}
            className={btnGhost}
          >
            <Plus className="h-4 w-4" aria-hidden />
            添加内容
          </button>

          <Field label="统一备注" hint="本次推送的统一备注，显示在每项内容下方，也会写进通知">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="例如：本次推送的补偿内容"
              className={textareaCls}
            />
          </Field>

          <button
            type="button"
            onClick={() => void handlePush()}
            disabled={!canSubmit}
            className={`${btnPrimary} w-full sm:w-auto`}
          >
            <Send className="h-4 w-4" aria-hidden />
            {sending ? '推送中…' : `推送给 ${found.display_name ?? found.email}`}
          </button>
        </div>
      )}

      <Notice notice={notice} />
    </div>
  );
}
