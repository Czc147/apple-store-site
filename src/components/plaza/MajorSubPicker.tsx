'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  fetchPickableMajorUnits,
  fetchPickableSubUnits,
  type PickableMajorUnit,
  type PickableSubUnit,
} from '@/lib/share';
// formatPrice 自带 ¥，外面不要再拼一个（曾经写成 `¥${formatPrice(x)}` → 渲染出 ¥¥20.00）
import { formatPrice } from '@/lib/format';

const selectCls =
  'h-11 w-full rounded-input border border-apple-border bg-apple-card px-3 text-md text-apple-text outline-none disabled:opacity-50 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20';

/**
 * 「先选大单元 → 再选小单元」的两级选择器。
 *
 * 用户需求 #9：共享与一起买原来是一个平铺的下拉列出**全部**小单元 ——
 * 商品多起来之后那个列表几十上百项，根本找不到目标。
 * 两级之后第二级只列该大单元下的几个，选择范围一下子收窄。
 *
 * 做成共用组件而不是在共享/拼单里各写一遍：两处的数据流、禁用态、
 * "换了大单元要清空已选小单元"这些细节完全一致，复制两份必然走样。
 */
export default function MajorSubPicker({
  majorId,
  subId,
  onMajorChange,
  onSubChange,
  disabled = false,
  majorLabel = '大单元',
  subLabel = '小单元',
}: {
  majorId: string;
  subId: string;
  onMajorChange: (id: string) => void;
  onSubChange: (id: string) => void;
  disabled?: boolean;
  majorLabel?: string;
  subLabel?: string;
}) {
  const [majors, setMajors] = useState<PickableMajorUnit[]>([]);
  const [subs, setSubs] = useState<PickableSubUnit[]>([]);
  const [loadingMajors, setLoadingMajors] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchPickableMajorUnits().then((list) => {
      if (!alive) return;
      setMajors(list);
      setLoadingMajors(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 换大单元 → 重新拉该大单元下的小单元（并清空已选的小单元，见下）
  useEffect(() => {
    if (!majorId) {
      setSubs([]);
      return;
    }
    let alive = true;
    setLoadingSubs(true);
    void fetchPickableSubUnits(majorId).then((list) => {
      if (!alive) return;
      setSubs(list);
      setLoadingSubs(false);
    });
    return () => {
      alive = false;
    };
  }, [majorId]);

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-medium text-apple-text">{majorLabel}</p>
        <select
          value={majorId}
          disabled={disabled || loadingMajors}
          aria-label={majorLabel}
          onChange={(e) => {
            onMajorChange(e.target.value);
            // 换大单元必须清掉已选小单元：否则会留下一个不属于当前大单元的 id，
            // 提交上去后端会以"该小单元不存在/不属于此大单元"拒绝
            onSubChange('');
          }}
          className={selectCls}
        >
          <option value="">{loadingMajors ? '加载中…' : '请选择…'}</option>
          {majors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-apple-text">
          {subLabel}
          {loadingSubs && <Loader2 className="h-3.5 w-3.5 animate-spin text-apple-text-3" aria-hidden />}
        </p>
        <select
          value={subId}
          disabled={disabled || !majorId || loadingSubs}
          aria-label={subLabel}
          onChange={(e) => onSubChange(e.target.value)}
          className={selectCls}
        >
          <option value="">
            {!majorId ? '请先选大单元' : loadingSubs ? '加载中…' : subs.length === 0 ? '该大单元下暂无小单元' : '请选择…'}
          </option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.price !== null && s.price > 0 ? `（${formatPrice(s.price)}）` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
