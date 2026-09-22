'use client';

import type { FormEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import './LoginCard.css';

/**
 * 登录卡片（来自用户在微信给的「动画.docx」）。
 *
 * 与文档版的两处必要差异：
 *
 * 1. **文档是单用途登录表单**，底部两个 `<a href="/forgot-password">`、
 *    `<a href="/register">` 指向独立页面。本站 `/login` 是**四模式合一**的
 *    （登录 / 注册 / 找回 / 重置），那两个链接在状态机里有精确对应，
 *    所以改成 `footer` 插槽交给调用方渲染成模式切换按钮，而不是站外跳转。
 * 2. 文档的 `LoginCard.css` **是截断的**（缺 submit/error/divider/register 等
 *    五段样式），已在本仓补完，见该文件末尾说明。
 *
 * 视觉与结构照文档：白玻璃卡 + 暖橙强调 + 标题/副标题 + 字段 + 提交钮。
 */
interface LoginCardProps {
  title: string;
  subtitle: string;
  loading: boolean;
  error: string;
  submitLabel: string;
  /** 额外禁用条件（如必填项没填） */
  submitDisabled?: boolean;
  onSubmit: () => void;
  /** 卡片底部的次级入口（忘记密码 / 注册 / 返回登录…），由调用方按模式排布 */
  footer?: ReactNode;
  /** 成功提示（注册成功 / 重置邮件已发）——文档只给了错误位 */
  notice?: string;
  children: ReactNode;
}

export default function LoginCard({
  title,
  subtitle,
  loading,
  error,
  submitLabel,
  submitDisabled = false,
  onSubmit,
  footer,
  notice,
  children,
}: LoginCardProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loading) onSubmit();
  };

  return (
    <section className="login-card">
      <div className="login-card-header">
        <div className="login-title">{title}</div>
        <div className="login-subtitle">{subtitle}</div>
      </div>

      <form className="login-form" onSubmit={handleSubmit}>
        {notice && (
          <p className="login-notice" role="status">
            {notice}
          </p>
        )}

        {children}

        {/* 错误位始终占高（min-height），出现时不会把按钮顶下去 */}
        <div
          className={cn('login-error', error && 'is-visible')}
          aria-live="polite"
          role={error ? 'alert' : undefined}
        >
          {error || ' '}
        </div>

        <button
          type="submit"
          className="login-submit"
          disabled={loading || submitDisabled}
        >
          {loading ? (
            <>
              <span className="login-loading" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span>处理中</span>
            </>
          ) : (
            submitLabel
          )}
        </button>
      </form>

      {footer && <div className="login-footer">{footer}</div>}
    </section>
  );
}

/** 字段：标签 + 输入框（文档 .login-field 结构） */
export function LoginField({
  id,
  label,
  type = 'text',
  value,
  placeholder,
  autoComplete,
  disabled,
  onChange,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div className="login-field">
      <label htmlFor={id} className="login-label">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  );
}

/** 密码框：右侧眼睛按钮（照文档——按下时 preventDefault，免得输入框失焦） */
export function PasswordField({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  disabled,
  show,
  onToggleShow,
  onChange,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  show: boolean;
  onToggleShow: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div className="login-field">
      <label htmlFor={id} className="login-label">
        {label}
      </label>
      <div className="password-wrapper">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <button
          type="button"
          className="password-toggle"
          // 按下时 preventDefault：否则点眼睛会让输入框失焦，
          // 移动端键盘会先收起再弹出（照文档的处理）
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleShow}
          aria-label={show ? '隐藏密码' : '显示密码'}
          disabled={disabled}
        >
          <EyeIcon off={!show} />
        </button>
      </div>
    </div>
  );
}

/** 眼睛图标（照文档原样：两态手写 SVG，不引图标库） */
function EyeIcon({ off = false }: { off?: boolean }) {
  if (off) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
        <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M10.6 10.6 A2 2 0 0 0 13.4 13.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M9.2 5.3 C10.2 5.1 11.1 5 12 5 C16.6 5 20.1 7.8 21.5 12 C21 13.5 20.1 14.9 19 16.1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.1 6.1 C4.5 7.4 3.3 9.3 2.5 12 C3.9 16.2 7.4 19 12 19 C13.3 19 14.5 18.8 15.6 18.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M2.5 12 C3.9 7.8 7.4 5 12 5 C16.6 5 20.1 7.8 21.5 12 C20.1 16.2 16.6 19 12 19 C7.4 19 3.9 16.2 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
