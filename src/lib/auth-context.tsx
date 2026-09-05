'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabaseBrowser } from './supabase/client';

/**
 * 前台用户认证上下文（Supabase Auth · 邮箱+密码）。
 *
 * - 会话由 supabase-js 在 localStorage 持久化并自动刷新；
 * - ⚠️ 每次调用本站受保护 API 时通过 getSession() 现取 access_token，
 *   禁止在模块级缓存 token（token 约 1 小时过期）；
 * - 未配置 NEXT_PUBLIC_SUPABASE_* 时（演示模式）认证整体不可用：
 *   user 恒为 null，登录页会提示「未配置」，不阻塞前台浏览。
 * - 与后台管理员会话（lib/auth.ts 的 HMAC cookie）完全独立。
 */

interface AuthContextValue {
  user: User | null;
  /** 初始会话尚未读完（避免登录态 UI 闪烁） */
  loading: boolean;
  /** Supabase 是否已在前端配置（false 时登录/注册不可用） */
  configured: boolean;
  getSession: () => Promise<Session | null>;
  /** 已登录 → { Authorization: Bearer … }；未登录 → {} */
  getAuthHeaders: () => Promise<Record<string, string>>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 客户端环境是否配置了 Supabase（缺 NEXT_PUBLIC_ 变量时为演示模式）
  const configured = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }, []);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let mounted = true;
    const sb = supabaseBrowser();

    void sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // 登录 / 注册 / 退出 / 密码恢复（邮件链接回跳）都会触发
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const getSession = useCallback(async (): Promise<Session | null> => {
    if (!configured) return null;
    const { data } = await supabaseBrowser().auth.getSession();
    return data.session;
  }, [configured]);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const session = await getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  }, [getSession]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    await supabaseBrowser().auth.signOut();
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, configured, getSession, getAuthHeaders, signOut }),
    [user, loading, configured, getSession, getAuthHeaders, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 在组件中读取认证状态（必须在 AuthProvider 内使用） */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return ctx;
}
