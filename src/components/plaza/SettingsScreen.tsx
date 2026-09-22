'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  LogIn,
  LogOut,
  Bookmark,
  KeyRound,
  Library,
  Info,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabaseBrowser } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import ListRow from '@/components/ui/ListRow';
import BottomSheet from '@/components/ui/BottomSheet';
import type { MyProfile } from '@/lib/user-profile';
import SoundSettingsSection from './SoundSettingsSection';

interface SettingsScreenProps {
  /** 构建版本（服务端从 package.json 读，避免在这里手抄一个会过期的号） */
  version: string;
  /** 自己的名片。广场顶栏那份头像取的就是它，不必在这里再拉一次 */
  me: MyProfile | null;
  onClose: () => void;
  /** 「我的收藏」不在本屏内 —— 它住在对话板块，交回外层去切 */
  onOpenBookmarks: () => void;
}

/**
 * 总设置（用户 #4，2026-09-22）。
 *
 * 用户的原话是"我们的设置是散的"——声音在对话板块里、昵称头像在「我的库」、
 * 收藏在对话列表、券又在「我的库」，用户端没有一个「我的 → 设置」的落点。
 * 这一屏把**已经存在**的东西收拢到一处，并给出各自真实的位置：
 *
 * - 声音与通知：原对话板块右上角那个 BottomSheet 的内容，整块搬进来；
 * - 昵称/头像：编辑在「我的库」的账户卡上（本项目一直如此），这里只做入口；
 * - 我的券同样在「我的库」（券常驻在我的库里），所以「我的库」一个入口就够；
 * - 我的收藏在对话板块，点它由外层切过去并直接展开收藏。
 *
 * **刻意没放的东西**：通知开关（订单/拼单/好友申请）。通知现在是常开轮询，
 * 开关要做成真的生效得先有一份用户级偏好 + 各处轮询按它闸门，那是另一件事；
 * 放一个拨了没用的开关比不放更糟。隐私、内容偏好同理。等做的时候再进这一屏。
 */
export default function SettingsScreen({
  version,
  me,
  onClose,
  onOpenBookmarks,
}: SettingsScreenProps) {
  const { user, configured, signOut } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-sheet overflow-y-auto bg-apple-bg">
      <header className="sticky top-0 z-panel border-b border-apple-hairline bg-apple-card">
        <div className="mx-auto flex min-h-[52px] max-w-page items-center gap-1 px-page">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            className="-ml-2 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <h1 className="text-md font-semibold text-apple-text">总设置</h1>
        </div>
      </header>

      <div className="mx-auto max-w-page space-y-5 px-page py-5 pb-16">
        {/* ---- 账号 ---- */}
        <Section title="账号">
          {!configured ? (
            <ListRow
              leading={<IconSlot><Smartphone className="h-4 w-4" aria-hidden /></IconSlot>}
              title="本站未配置账号服务"
              subtitle="当前为演示模式，无法登录"
            />
          ) : !user ? (
            <ListRow
              leading={<IconSlot><LogIn className="h-4 w-4" aria-hidden /></IconSlot>}
              title="登录 / 注册"
              subtitle="登录后可用收藏、好友、拼单与订阅"
              href="/login"
              trailing="chevron"
              padding="card"
            />
          ) : (
            <>
              {/* 账户行本身就是「编辑资料」的入口：点名字去改名字，是所有人的直觉 */}
              <ListRow
                leading={
                  <Avatar
                    avatarKey={me?.avatar_key}
                    avatarUrl={me?.avatar_url}
                    name={me?.display_name}
                    size={40}
                  />
                }
                title={me?.display_name ?? '我的账号'}
                subtitle={user.email ?? undefined}
                trailing="chevron"
                href="/library"
                padding="card"
                className="rounded-t-card-lg"
              />
              <ListRow
                leading={<IconSlot><KeyRound className="h-4 w-4" aria-hidden /></IconSlot>}
                title="修改密码"
                subtitle="需要先验证当前密码"
                trailing="chevron"
                onClick={() => setPwdOpen(true)}
                padding="card"
              />
              <ListRow
                leading={<IconSlot tone="danger"><LogOut className="h-4 w-4" aria-hidden /></IconSlot>}
                title={signingOut ? '正在退出…' : '退出登录'}
                destructive
                onClick={() => {
                  if (!signingOut) void handleSignOut();
                }}
                padding="card"
                className="rounded-b-card-lg"
              />
            </>
          )}
        </Section>

        {/* ---- 声音与通知 ---- */}
        <Section title="声音与通知">
          <div className="px-4">
            <SoundSettingsSection />
          </div>
        </Section>

        {/* ---- 我的（登录后才有内容可去） ---- */}
        {user && (
          <Section title="我的">
            <ListRow
              leading={<IconSlot><Library className="h-4 w-4" aria-hidden /></IconSlot>}
              title="我的库"
              subtitle="我的券 · 我的订阅 · 卡密兑换"
              trailing="chevron"
              href="/library"
              padding="card"
              className="rounded-t-card-lg"
            />
            <ListRow
              leading={<IconSlot><Bookmark className="h-4 w-4" aria-hidden /></IconSlot>}
              title="我的收藏"
              subtitle="收藏的帖子和自己的备注"
              trailing="chevron"
              onClick={onOpenBookmarks}
              padding="card"
              className="rounded-b-card-lg"
            />
          </Section>
        )}

        {/* ---- 关于 ---- */}
        <Section title="关于">
          <ListRow
            leading={<IconSlot><Info className="h-4 w-4" aria-hidden /></IconSlot>}
            title="使用指南"
            subtitle="怎么兑换、怎么找内容、常见问题"
            trailing="external"
            href="/guide.html"
            external
            padding="card"
          />
          <ListRow
            title="版本"
            trailing={<span className="text-sm tabular-nums text-apple-text-3">v{version}</span>}
            padding="card"
            className="rounded-b-card-lg"
          />
        </Section>
      </div>

      <ChangePasswordSheet
        open={pwdOpen}
        email={user?.email ?? ''}
        onClose={() => setPwdOpen(false)}
        onDone={() => setPwdOpen(false)}
      />
    </div>
  );
}

/** 分组：标题 + 一张白卡（沿用全站"实底白面板 + 圆角分组"的语言） */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-apple-text-3">
        {title}
      </h2>
      <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card">
        {children}
      </div>
    </section>
  );
}

/** 列表行左侧的圆底图标槽（设置页统一用它，免得每行各画各的） */
function IconSlot({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'danger' }) {
  return (
    <span
      className={
        'flex h-8 w-8 flex-none items-center justify-center rounded-full ' +
        (tone === 'danger'
          ? 'bg-apple-danger-soft text-apple-danger'
          : 'bg-apple-blue-soft text-apple-blue')
      }
      aria-hidden
    >
      {children}
    </span>
  );
}

/**
 * 修改密码。
 *
 * 必须**先验当前密码**：只调 `updateUser({password})` 的话，谁捡到一台
 * 已登录的设备就能直接把密码换掉、把号占为己有。验证走一次
 * `signInWithPassword`（后端校验），过了才允许改。
 *
 * 与登录页的"忘记密码"是两条不同的路：那条走邮件重置，适合密码已经不记得的人。
 */
function ChangePasswordSheet({
  open,
  email,
  onClose,
  onDone,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 每次打开都清空：留着上一次的密码在输入框里既没必要也不安全
  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
      setDone(false);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    if (next.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (next !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (next === current) {
      setError('新密码不能和当前密码相同');
      return;
    }

    setBusy(true);
    const sb = supabaseBrowser();
    try {
      const { error: verifyErr } = await sb.auth.signInWithPassword({ email, password: current });
      if (verifyErr) throw new Error('当前密码不正确');

      const { error: updErr } = await sb.auth.updateUser({ password: next });
      if (updErr) {
        const m = updErr.message.toLowerCase();
        if (m.includes('at least')) throw new Error('新密码至少 6 位');
        if (m.includes('rate limit') || m.includes('too many'))
          throw new Error('操作过于频繁，请稍后再试');
        throw new Error(updErr.message);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="修改密码">
      {done ? (
        <div className="pb-4">
          <p className="text-md text-apple-text">密码已更新。</p>
          <p className="mt-1 text-sm text-apple-text-2">
            其它设备上的登录会在下次刷新时失效，需要重新输入新密码。
          </p>
          <Button variant="primary" fullWidth className="mt-4" onClick={onDone}>
            好
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void submit();
          }}
        >
          <Field label="当前密码" value={current} onChange={setCurrent} autoComplete="current-password" />
          <Field label="新密码" value={next} onChange={setNext} autoComplete="new-password" />
          <Field label="确认新密码" value={confirm} onChange={setConfirm} autoComplete="new-password" />

          {error && <p className="text-sm text-apple-danger">{error}</p>}

          <Button type="submit" variant="primary" fullWidth loading={busy}>
            确认修改
          </Button>
          <p className="text-2xs leading-relaxed text-apple-text-3">
            忘记当前密码？在登录页点「忘记密码」，我们会发一封重置邮件到 {email || '你的邮箱'}。
          </p>
        </form>
      )}
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-apple-text-2">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-input border border-apple-border bg-apple-card px-3 text-base text-apple-text outline-none transition-colors duration-fast ease-apple focus:border-apple-blue"
      />
    </label>
  );
}
