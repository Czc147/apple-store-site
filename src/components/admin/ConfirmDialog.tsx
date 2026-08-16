'use client';

import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { btnDanger, btnGhost } from './ui';

interface ConfirmDialogProps {
  open: boolean;
  /** 弹窗标题，如「删除大单元」 */
  title: string;
  /** 主文案，如「确定要删除「基础套装」吗？」 */
  message: string;
  /** 附加警示（红框提示），如级联删除说明 */
  note?: string;
  confirmText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** 删除等危险操作的二次确认弹窗 */
export default function ConfirmDialog({
  open,
  title,
  message,
  note,
  confirmText = '删除',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button
            type="button"
            className={btnGhost}
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className={btnDanger}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '删除中…' : confirmText}
          </button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-apple-text">{message}</p>
      {note && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#D70015]/10 px-3 py-2.5 text-[13px] leading-relaxed text-[#B80012]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{note}</span>
        </div>
      )}
    </Modal>
  );
}
