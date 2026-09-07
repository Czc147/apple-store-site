'use client';

import { useState } from 'react';
import { Plus, Search, Send, Trash2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import FileUploader from '@/components/admin/FileUploader';
import { PageHeader, Field, inputCls, textareaCls, btnPrimary, btnGhost, Notice } from '@/components/admin/ui';

interface FoundUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_key: string | null;
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

/** 推送服务：按注册邮箱查找用户 → 上传文件（可多个）→ 推送进用户库并通知 */
export default function PushManager() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [notSearched, setNotSearched] = useState(true);

  const [items, setItems] = useState<PushItem[]>([newItem()]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const showNotice = (n: { ok: boolean; text: string }) => {
    setNotice(n);
    setTimeout(() => setNotice(null), 2500);
  };

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

  const canSubmit =
    Boolean(found) && items.every((it) => it.media_url && it.name.trim()) && !sending;

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
      <PageHeader title="推送服务" description="按注册邮箱找到用户，把图片/文件直接推送进对方的「我的库」" />

      <div className="rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
        <Field label="用户邮箱" required hint="必须是已在本站注册的邮箱">
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
          </div>
        </Field>

        {!notSearched && searchError && (
          <p className="mt-3 text-[13px] text-[#D70015]">{searchError}</p>
        )}

        {found && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-apple-border bg-apple-bg px-3.5 py-3">
            <Avatar avatarKey={found.avatar_key} name={found.display_name ?? found.email} size={36} />
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
                <p className="text-[13px] font-semibold text-apple-text">文件 {idx + 1}</p>
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

              <FileUploader
                value={item.media_url}
                onChange={(url) => updateItem(item.key, { media_url: url })}
              />

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
                <Field label="说明" hint="可选，留空则使用下方统一备注">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    maxLength={500}
                    placeholder="备注说明"
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
            添加文件
          </button>

          <Field label="统一备注" hint="当某文件未单独填写说明时，使用这里的内容">
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
