'use client';

import { useEffect, useState } from 'react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { localInputToIso } from '@/lib/datetime';
import { Field, inputCls, textareaCls, btnPrimary, btnGhost, btnDanger } from '@/components/admin/ui';
import MaintenancePage from './MaintenancePage';
import { DEFAULT_MAINTENANCE, type MaintenanceConfig } from './logic';

function localTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Site adapter: separate save endpoint prevents unrelated configuration saves from reopening the site. */
export default function AdminMaintenanceSettings() {
  const [saved, setSaved] = useState<MaintenanceConfig | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_MAINTENANCE });
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewNow, setPreviewNow] = useState<number | null>(null);
  const load = async () => {
    setBusy(true); setError('');
    try {
      const res = await adminFetch('/api/admin/maintenance', { cache: 'no-store' });
      if (!res.ok) throw new Error(await extractError(res));
      const config: MaintenanceConfig = await res.json();
      setSaved(config); setForm(config); setDate(localTime(config.deadline));
    } catch (err) { setError(err instanceof Error ? err.message : '读取失败，请重试'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async (enabled: boolean) => {
    if (busy || !saved) return;
    const deadline = localInputToIso(date);
    if (date && !deadline) { setError('请输入有效的预计恢复时间'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await adminFetch('/api/admin/maintenance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, enabled, deadline }) });
      if (!res.ok) throw new Error(await extractError(res));
      const config: MaintenanceConfig = await res.json();
      setSaved(config); setForm(config); setDate(localTime(config.deadline));
      setNotice(config.enabled ? '维护配置已保存，网站保持关闭。' : '网站已开放。');
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-card border border-apple-border bg-apple-card p-5 shadow-card" aria-labelledby="maintenance-settings-title">
    <div><h2 id="maintenance-settings-title" className="text-[17px] font-semibold">网站维护</h2><p className="mt-1 text-[13px] leading-relaxed text-apple-text-2">倒计时仅表示预计恢复时间。到点后网站仍关闭，需在这里手动开放；后台不受影响。</p></div>
    <p className="text-[14px] font-medium" role="status">当前状态：{saved ? saved.enabled ? '维护中，网站已关闭' : '网站正常开放' : busy ? '正在读取…' : '读取失败'}</p>
    {!saved && !busy && <button type="button" className={btnGhost} onClick={() => void load()}>重新读取</button>}
    {saved && <fieldset disabled={busy} className="space-y-4">
      <Field label="维护页标题"><input className={inputCls} value={form.title} maxLength={80} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></Field>
      <Field label="维护说明"><textarea className={textareaCls} value={form.description} rows={3} maxLength={500} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
      <Field label="预计恢复时间" hint="按当前浏览器所在时区填写；留空则不显示倒计时，不影响手动开放。"><input className={inputCls} type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-3">
        <button className={saved.enabled ? btnPrimary : btnDanger} type="button" onClick={() => void save(true)}>{busy ? '保存中…' : saved.enabled ? '保存维护内容' : '保存并关闭网站'}</button>
        {saved.enabled && <button className={btnGhost} type="button" onClick={() => void save(false)}>手动开放网站</button>}
        <button className={btnGhost} type="button" onClick={() => setPreviewNow(Date.now())}>预览维护页面</button>
      </div>
    </fieldset>}
    {error && <p className="text-[13px] text-[#D70015]" role="alert">{error}</p>}
    {notice && <p className="text-[13px] text-apple-text-2" role="status">{notice}</p>}
    {previewNow !== null && <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-[13px] text-apple-text-2">维护页预览（不改变网站状态）</p><button className={btnGhost} type="button" onClick={() => setPreviewNow(null)}>收起预览</button></div><MaintenancePage title={form.title || undefined} description={form.description || undefined} deadline={localInputToIso(date)} serverNow={previewNow} /></div>}
  </section>;
}
