'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings } from '@/lib/types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { Field, PageHeader, Notice, inputCls, textareaCls, btnPrimary } from './ui';

const EMPTY: AppSettings = {
  site_title: '',
  home_greeting: '',
  home_subtitle: '',
  announcement: '',
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
      });
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
