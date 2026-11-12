'use client';

import { Fragment, useEffect, useState } from 'react';
import { DEFAULT_MAINTENANCE, getTimeLeft } from './logic';
import styles from './styles.module.css';

export interface MaintenancePageProps {
  title?: string;
  description?: string;
  deadline?: string | null;
  /** SSR snapshot, shared by all visitors; client advances it using elapsed time. */
  serverNow: number;
  onCheckStatus?: () => Promise<boolean>;
}
const tiles = [{ key: 'days', label: '天' }, { key: 'hours', label: '时' }, { key: 'minutes', label: '分' }, { key: 'seconds', label: '秒' }] as const;

export default function MaintenancePage({ title = DEFAULT_MAINTENANCE.title, description = DEFAULT_MAINTENANCE.description, deadline = null, serverNow, onCheckStatus }: MaintenancePageProps) {
  const [now, setNow] = useState(serverNow);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const time = getTimeLeft(deadlineMs, now);
  const expired = !!time && now >= deadlineMs;
  useEffect(() => {
    setNow(serverNow);
    if (!Number.isFinite(deadlineMs) || serverNow >= deadlineMs) return;
    const started = performance.now();
    const tick = () => {
      const current = serverNow + (performance.now() - started);
      setNow(current);
      if (current >= deadlineMs) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [serverNow, deadlineMs]);
  const check = async () => {
    if (!onCheckStatus || busy) return;
    setBusy(true); setNotice('');
    try { setNotice(await onCheckStatus() ? '网站已恢复，可以重新访问。' : '网站仍在维护，请稍后再试。'); }
    catch { setNotice('暂时无法查询网站状态，请稍后再试。'); }
    finally { setBusy(false); }
  };
  return <section className={styles['site-maintenance']} aria-labelledby="maintenance-title">
    <div className={styles['site-maintenance__content']}>
      <div className={styles['site-maintenance__intro']}>
        <h1 id="maintenance-title">{title}</h1>
        <p className={styles['site-maintenance__description']}>{description}</p>
      </div>
      {time && <div className={styles['site-maintenance__time-group']}>
        <p className={styles['site-maintenance__caption']}>距预计恢复时间</p>
        <div className={styles['site-maintenance__timer']} role="timer" aria-live="off" aria-label={`距预计恢复时间 ${time.days}天${time.hours}时${time.minutes}分${time.seconds}秒`}>
          {tiles.map((tile, index) => <Fragment key={tile.key}>
            <div className={styles['site-maintenance__tile']}><span className={styles['site-maintenance__number']}>{String(time[tile.key]).padStart(2, '0')}</span><span className={styles['site-maintenance__unit']}>{tile.label}</span></div>
            {index < 3 && <span className={styles['site-maintenance__colon']} aria-hidden="true">:</span>}
          </Fragment>)}
        </div>
        <p className={styles['site-maintenance__hint']} role="status">{expired ? '维护仍在进行，恢复后即可重新访问。' : '以上为预计时间，实际开放以维护完成为准。'}</p>
      </div>}
      {onCheckStatus && <div className={styles['site-maintenance__actions']}><button type="button" onClick={() => void check()} disabled={busy}>{busy ? '正在查询…' : '查看恢复状态'}</button><p role="status" className={styles['site-maintenance__notice']}>{notice}</p></div>}
    </div>
  </section>;
}
