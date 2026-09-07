'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings } from '@/lib/types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { Field, PageHeader, Notice, inputCls, textareaCls, btnPrimary } from './ui';
import ImageUploader from './ImageUploader';

const EMPTY: AppSettings = {
  site_title: '',
  home_greeting: '',
  home_subtitle: '',
  announcement: '',
  payment_wechat_qr_url: '',
  payment_alipay_qr_url: '',
};

/** 首页全局配置：站点标题 / 首页大标题 / 副标题 / 顶部公告条 */
export default function AppSettingsManager() {
  const [form, setForm] = useState<AppSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  // Server酱（订单推送 → 微信）——独立于上面的公开配置，key 只经 /api/admin/push-settings 读写
  const [scConfigured, setScConfigured] = useState(false);
  const [scMasked, setScMasked] = useState('');
  const [scInput, setScInput] = useState('');
  const [scSaving, setScSaving] = useState(false);
  const [scTesting, setScTesting] = useState(false);

  const showNotice = useCallback((okFlag: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok: okFlag, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await adminFetch('/api/app-settings');
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as AppSettings;
      setForm({
        site_title: data.site_title ?? '',
        home_greeting: data.home_greeting ?? '',
        home_subtitle: data.home_subtitle ?? '',
        announcement: data.announcement ?? '',
        payment_wechat_qr_url: data.payment_wechat_qr_url ?? '',
        payment_alipay_qr_url: data.payment_alipay_qr_url ?? '',
      });
      const pr = await adminFetch('/api/admin/push-settings');
      if (pr.ok) {
        const pdata = (await pr.json()) as { configured: boolean; masked: string };
        setScConfigured(Boolean(pdata.configured));
        setScMasked(pdata.masked ?? '');
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [load]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await adminFetch('/api/app-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_title: form.site_title ?? '',
          home_greeting: form.home_greeting ?? '',
          home_subtitle: form.home_subtitle ?? '',
          announcement: form.announcement ?? '',
          payment_wechat_qr_url: form.payment_wechat_qr_url ?? '',
          payment_alipay_qr_url: form.payment_alipay_qr_url ?? '',
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(true, '已保存配置');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handlePushSave = async () => {
    if (scSaving) return;
    setScSaving(true);
    try {
      const res = await adminFetch('/api/admin/push-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendkey: scInput }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as { configured: boolean; masked: string };
      setScConfigured(Boolean(data.configured));
      setScMasked(data.masked ?? '');
      setScInput('');
      showNotice(true, scInput.trim() ? '已保存推送 SendKey' : '已清除推送 SendKey');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setScSaving(false);
    }
  };

  const handlePushTest = async () => {
    if (scTesting) return;
    setScTesting(true);
    try {
      const res = await adminFetch('/api/admin/push-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(true, '测试通知已发送，请到微信查看');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '测试失败');
    } finally {
      setScTesting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="全局配置"
        description="站点标题、首页大标题/副标题、顶部公告条等文案统一在此配置；留空则回退默认"
      />

      {loadError ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
          <button type="button" onClick={() => void load()} className={`${btnPrimary} mt-4`}>
            重试
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-10 w-full rounded-xl" />
              <div className="skeleton h-10 w-full rounded-xl" />
              <div className="skeleton h-10 w-full rounded-xl" />
              <div className="skeleton h-20 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <Field label="站点标题" hint="浏览器标题/品牌名，选填">
                <input
                  className={inputCls}
                  value={form.site_title ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, site_title: e.target.value }))}
                  placeholder="Zorvin"
                  maxLength={40}
                />
              </Field>
              <Field label="首页大标题" hint="默认「选购」">
                <input
                  className={inputCls}
                  value={form.home_greeting ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, home_greeting: e.target.value }))}
                  placeholder="选购"
                  maxLength={40}
                />
              </Field>
              <Field label="首页副标题" hint="大标题下方的一句话介绍">
                <input
                  className={inputCls}
                  value={form.home_subtitle ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, home_subtitle: e.target.value }))}
                  placeholder="轻点卡片展开选项，看到心仪的小单元就点亮爱心收藏"
                  maxLength={80}
                />
              </Field>
              <Field label="顶部公告条" hint="留空则隐藏；显示在页面最顶部">
                <textarea
                  className={textareaCls}
                  value={form.announcement ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, announcement: e.target.value }))}
                  rows={2}
                  placeholder="如：双十一全场 8 折，限时进行中"
                  maxLength={120}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="微信收款码"
                  hint="结算弹窗「去微信支付」点开显示；上传收款码图片"
                >
                  <ImageUploader
                    value={form.payment_wechat_qr_url || null}
                    onChange={(url) =>
                      setForm((f) => ({ ...f, payment_wechat_qr_url: url ?? '' }))
                    }
                  />
                </Field>
                <Field
                  label="支付宝收款码"
                  hint="结算弹窗「去支付宝支付」点开显示；上传收款码图片"
                >
                  <ImageUploader
                    value={form.payment_alipay_qr_url || null}
                    onChange={(url) =>
                      setForm((f) => ({ ...f, payment_alipay_qr_url: url ?? '' }))
                    }
                  />
                </Field>
              </div>

              <div className="rounded-card border border-apple-hairline bg-apple-surface p-4">
                <p className="text-[13.5px] font-semibold text-apple-text">订单推送提醒（Server酱 → 微信）</p>
                <p className="mt-1 text-[12px] leading-relaxed text-apple-text-2">
                  填入 Server酱 SendKey 后，顾客「推送订单」成功即推微信提醒你核销。可在 sct.ftqq.com 免费注册获取。当前状态：
                  {scConfigured ? (
                    <span className="font-medium text-[#1B7F3B]">已配置（{scMasked}）</span>
                  ) : (
                    <span className="text-[#B80012]">未配置</span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className={`${inputCls} min-w-0 flex-1`}
                    value={scInput}
                    onChange={(e) => setScInput(e.target.value)}
                    placeholder={scConfigured ? '粘贴新 SendKey 以替换，留空则清除' : '粘贴 Server酱 SendKey（SCT 开头）'}
                    type="password"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void handlePushSave()}
                    disabled={scSaving}
                    className={btnPrimary}
                  >
                    {scSaving ? '保存中…' : scConfigured ? '更新' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePushTest()}
                    disabled={scTesting || !scConfigured}
                    className="rounded-btn border border-apple-border bg-white px-4 py-2 text-[13px] font-medium text-apple-text transition hover:bg-apple-bg disabled:opacity-40"
                  >
                    {scTesting ? '发送中…' : '发送测试'}
                  </button>
                </div>
              </div>

              {saveError && (
                <p className="text-[13px] text-[#D70015]" role="alert">
                  {saveError}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading}
                  className={btnPrimary}
                >
                  {saving ? '保存中…' : '保存配置'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <Notice notice={notice} />
    </>
  );
}
