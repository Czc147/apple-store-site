'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MajorUnit, SubUnit } from '@/lib/types';
import CardImage from './CardImage';
import SubUnitRow from './SubUnitRow';

interface MajorUnitCardProps {
  major: MajorUnit;
  subs: SubUnit[];
  defaultOpen?: boolean;
}

/**
 * 大单元卡片（对标 Apple Store 卡片）：
 * - 20px 大圆角 · 轻阴影 · hover 上浮 · active 微缩
 * - 顶部 16:9 展示图，下方粗体单元名
 * - 有 link_url 时显示「查看详情 ›」文字链接（新窗口跳转，不参与展开）
 * - 点击图片/标题区展开收起，展开后按 sort_order 列出小单元
 */
export default function MajorUnitCard({
  major,
  subs,
  defaultOpen = false,
}: MajorUnitCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),box-shadow_200ms_cubic-bezier(0.4,0,0.2,1)]">
      {/* 可点击展开区：图片 + 名称 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <CardImage src={major.image_url} alt={major.name} />
        <div
          className={`flex items-center justify-between gap-3 px-5 pt-4 ${
            major.link_url ? 'pb-1.5' : 'pb-4'
          }`}
        >
          <h2 className="min-w-0 truncate text-[17px] font-semibold tracking-tight text-apple-text">
            {major.name}
          </h2>
          <ChevronDown
            className={`h-5 w-5 flex-none text-apple-text-3 transition-transform duration-300 ease-apple ${
              open ? 'rotate-180' : ''
            }`}
            strokeWidth={1.8}
            aria-hidden
          />
        </div>
      </button>

      {/* 目录外链（存在时显示） */}
      {major.link_url && (
        <div className={`px-5 ${open ? 'pb-2' : 'pb-4'}`}>
          <a
            href={major.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-px text-[14px] font-medium text-apple-blue hover:underline"
          >
            查看详情 <span aria-hidden>›</span>
          </a>
        </div>
      )}

      {/* 小单元列表：grid-rows 0fr→1fr 平滑展开 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-apple ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {subs.length > 0 ? (
            <ul className="divide-y divide-apple-border/70 px-5 pb-3">
              {subs.map((sub) => (
                <SubUnitRow key={sub.id} sub={sub} />
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 pt-1 text-[13px] text-apple-text-3">
              该单元下暂无可选小单元
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
