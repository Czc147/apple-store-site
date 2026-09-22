'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  ShieldQuestion,
  Undo2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { uploadPostImage } from '@/lib/community';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CoverImage from '@/components/ui/CoverImage';
import DataError from '@/components/ui/DataError';
import EmptyState from '@/components/ui/EmptyState';
import RegisterBanner from '@/components/ui/RegisterBanner';
import {
  SHARE_STATUS_LABEL,
  cancelShareExchange,
  createShareExchange,
  fetchShareExchanges,
  type ShareExchange,
  type ShareStatus,
} from '@/lib/share';
import MajorSubPicker from './MajorSubPicker';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

const STATUS_TONE: Record<ShareStatus, 'blue' | 'success' | 'neutral' | 'danger'> = {
  pending: 'blue',
  approved: 'success',
  canceled: 'neutral',
  rejected: 'danger',
};

/**
 * 共享板块：用你手上的资源，换你需要的小单元。
 *
 * 规则（用户需求原文 + 我在接口层的落地）：
 * - 交出去的资源在**通过前双方都看不到**（接口不返回，不是 UI 遮住）
 * - 官方在通过前只能看到**参考图**与你要的小单元名字
 * - 通过后：你的资源对官方解锁，你要的小单元**自动进你的库**
 * - 追加：官方还没处理时你可以**撤回** —— 否则资源会无限期挂着，
 *   而这段时间你连自己交出去的东西都看不到
 */
export default function ShareBoard() {
  const { user, loading, getAuthHeaders } = useAuth();
  const [items, setItems] = useState<ShareExchange[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchShareExchanges(getAuthHeaders);
    if (list === null) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems(list);
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setItems(null);
      return;
    }
    void load();
  }, [loading, user?.id, load]);

  const handleCancel = async (id: string) => {
    setBusyId(id);
    const ok = await cancelShareExchange(getAuthHeaders, id);
    setBusyId(null);
    if (ok) await load();
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-apple-text-3">加载中…</p>;
  }

  if (!user) {
    return <RegisterBanner className="mx-auto max-w-wide" />;
  }

  if (failed && items === null) {
    return (
      <DataError
        message="共享列表加载失败，请检查网络后重试"
        onRetry={() => void load()}
        size="inline"
      />
    );
  }

  return (
    <div className="mx-auto max-w-wide space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          发起交换
        </Button>
      </div>

      <HowItWorks />

      {items === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="共享加载中">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-24 w-full rounded-card-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="还没有发起过交换"
          description="你手上有资源、又想要某个小单元，就可以在这里换。"
          size="inline"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                {it.ref_image_url && (
                  <div className="w-16 flex-none">
                    <CoverImage
                      src={it.ref_image_url}
                      alt="参考图"
                      ratio="square"
                      sizes="64px"
                      className="rounded-input"
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={STATUS_TONE[it.status]} size="sm">
                      {SHARE_STATUS_LABEL[it.status]}
                    </Badge>
                    <span className="text-2xs text-apple-text-3">
                      {timeAgo(it.created_at)}
                    </span>
                  </div>

                  <p className="mt-1.5 text-md text-apple-text">
                    想换：
                    <span className="font-medium">{it.wanted.name}</span>
                  </p>

                  {/* 通过前资源对双方都不解锁，这里如实说明而不是画个锁图标 */}
                  {it.resource_url ? (
                    <p className="mt-1 break-all text-xs text-apple-text-2">
                      你的资源已解锁：
                      <a
                        href={it.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-apple-blue underline-offset-2 hover:underline"
                      >
                        {it.resource_url.slice(0, 60)}
                      </a>
                    </p>
                  ) : (
                    it.status === 'pending' && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-apple-text-3">
                        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
                        资源已提交，官方处理前双方都看不到
                      </p>
                    )
                  )}

                  {it.review_note && (
                    <p className="mt-1 text-xs text-apple-text-2">
                      官方备注：{it.review_note}
                    </p>
                  )}
                </div>

                {it.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void handleCancel(it.id)}
                    disabled={busyId === it.id}
                    className="inline-flex flex-none items-center gap-1 rounded-btn px-2 py-1.5 text-xs text-apple-text-3 transition-colors duration-fast hover:text-apple-danger disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-danger/40"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    撤回
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        getAuthHeaders={getAuthHeaders}
        onCreated={() => {
          setFormOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="rounded-card-lg bg-apple-blue-soft px-4 py-3">
      <p className="text-sm font-medium text-apple-text">怎么换</p>
      <ol className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-apple-text-2">
        <li>1. 交出你的资源（网盘分享图或分享链接），再传一张参考图</li>
        <li>2. 选一个你想换的小单元</li>
        <li>3. 官方只看得到参考图和你选的小单元名字，看不到你的资源</li>
        <li>4. 官方确认后：资源双方解锁，小单元自动进你的「我的库」</li>
      </ol>
    </div>
  );
}

/** 发起交换的表单 */
function CreateSheet({
  open,
  onClose,
  getAuthHeaders,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<'link' | 'image'>('link');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [refImage, setRefImage] = useState<string | null>(null);
  /** 两级选择：先大单元，再小单元（用户需求 #9） */
  const [majorId, setMajorId] = useState('');
  const [wantedId, setWantedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'resource' | 'ref' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refInput = useRef<HTMLInputElement>(null);
  const resInput = useRef<HTMLInputElement>(null);

  const upload = async (
    file: File | undefined,
    which: 'resource' | 'ref',
  ) => {
    if (!file) return;
    setError(null);
    setUploading(which);
    const url = await uploadPostImage(getAuthHeaders, file);
    setUploading(null);
    if (!url) {
      setError('图片上传失败，请重试');
      return;
    }
    if (which === 'ref') setRefImage(url);
    else setLink(url);
  };

  const submit = async () => {
    setError(null);
    const resourceUrl = kind === 'link' ? link.trim() : link;
    if (!resourceUrl) {
      setError(kind === 'link' ? '请填写网盘分享链接' : '请上传分享图');
      return;
    }
    if (!refImage) {
      setError('请上传参考图');
      return;
    }
    if (!wantedId) {
      setError('请选择要换的小单元');
      return;
    }

    setBusy(true);
    const res = await createShareExchange(getAuthHeaders, {
      resource_kind: kind,
      resource_url: resourceUrl,
      resource_note: note.trim(),
      ref_image_url: refImage,
      wanted_sub_unit_id: wantedId,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // 成功后清空，免得下次打开还是旧内容
    setLink('');
    setNote('');
    setRefImage(null);
    setMajorId('');
    setWantedId('');
    onCreated();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="发起交换">
      <div className="space-y-4 pb-2">
        {/* 资源类型 */}
        <div>
          <p className="mb-2 text-sm font-medium text-apple-text">你的资源</p>
          <div className="flex gap-2">
            {(
              [
                { key: 'link' as const, label: '网盘分享链接', icon: Link2 },
                { key: 'image' as const, label: '上传分享图', icon: ImagePlus },
              ]
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setKind(key);
                  setLink('');
                }}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-btn px-3 py-2.5 text-sm font-medium',
                  'transition-colors duration-fast ease-apple',
                  kind === key
                    ? 'bg-apple-blue text-white'
                    : 'bg-apple-bg text-apple-text-2 hover:text-apple-text',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {kind === 'link' ? (
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://pan.xxx.com/s/xxxx"
              aria-label="网盘分享链接"
              className="mt-2 h-11 w-full rounded-input border border-transparent bg-apple-bg px-3.5 text-md text-apple-text outline-none placeholder:text-apple-text-3 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
            />
          ) : (
            <div className="mt-2">
              <input
                ref={resInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void upload(e.target.files?.[0], 'resource')}
              />
              <button
                type="button"
                onClick={() => resInput.current?.click()}
                disabled={uploading === 'resource'}
                className="flex w-full items-center justify-center gap-1.5 rounded-input border border-dashed border-apple-border bg-apple-bg py-4 text-sm text-apple-text-2 disabled:opacity-50"
              >
                {uploading === 'resource' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden />
                )}
                {link && kind === 'image' ? '已上传，点击更换' : '选择分享图'}
              </button>
            </div>
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="提取码或说明（选填）"
            aria-label="提取码或说明"
            maxLength={300}
            className="mt-2 h-11 w-full rounded-input border border-transparent bg-apple-bg px-3.5 text-md text-apple-text outline-none placeholder:text-apple-text-3 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
          />
        </div>

        {/* 参考图 */}
        <div>
          <p className="mb-2 text-sm font-medium text-apple-text">参考图</p>
          <p className="mb-2 text-xs leading-relaxed text-apple-text-3">
            官方在通过前只能看到这张图，请把能说明资源内容的部分截进来。
          </p>
          <input
            ref={refInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void upload(e.target.files?.[0], 'ref')}
          />
          {refImage ? (
            <div className="flex items-center gap-3">
              <div className="w-20">
                <CoverImage src={refImage} alt="参考图" ratio="square" sizes="80px" className="rounded-input" />
              </div>
              <button
                type="button"
                onClick={() => setRefImage(null)}
                className="text-sm text-apple-text-3 hover:text-apple-danger"
              >
                重新选择
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refInput.current?.click()}
              disabled={uploading === 'ref'}
              className="flex w-full items-center justify-center gap-1.5 rounded-input border border-dashed border-apple-border bg-apple-bg py-4 text-sm text-apple-text-2 disabled:opacity-50"
            >
              {uploading === 'ref' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-4 w-4" aria-hidden />
              )}
              选择参考图
            </button>
          )}
        </div>

        {/* 想要的小单元：先大单元后小单元（用户需求 #9） */}
        <div>
          <MajorSubPicker
            majorId={majorId}
            subId={wantedId}
            onMajorChange={setMajorId}
            onSubChange={setWantedId}
            disabled={busy}
            subLabel="想换的小单元"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-apple-text-3">
            官方在通过前只看得到这个小单元的名字。
          </p>
        </div>

        {error && (
          <p className="text-sm text-apple-danger" role="alert">
            {error}
          </p>
        )}

        <Button
          variant="primary"
          fullWidth
          onClick={() => void submit()}
          disabled={busy || uploading !== null}
        >
          {busy ? '提交中…' : '提交交换'}
        </Button>
      </div>
    </BottomSheet>
  );
}
