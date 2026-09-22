import { useEffect, useRef, useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * 可选表情。故意保持精简 —— 需求文档要求「不要随意增加大量颜色」，
 * 这里是纯文本字符，不引入任何新色值。
 */
const EMOJIS = ["🙂", "😄", "😍", "🎉", "✨", "👍", "🙏", "😂"];

export default function MessageInput({
  onSend,
  onFocus,
  onBlur,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点面板外面 / 按 Esc 收起（否则开着面板点别处会一直挂着）
  useEffect(() => {
    if (!pickerOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const send = () => {
    const text = value.trim();

    if (!text) return;

    onSend(text);
    setValue("");
    setPickerOpen(false);
  };

  /** 插入到光标处；没有选区信息时退化为追加到末尾 */
  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;

    setValue(value.slice(0, start) + emoji + value.slice(end));

    // 光标落到插入内容之后，方便连续插入
    window.requestAnimationFrame(() => {
      const next = start + emoji.length;
      input?.focus();
      input?.setSelectionRange(next, next);
    });
  };

  return (
    <div className="message-input-wrap" ref={wrapRef}>
      {pickerOpen && (
        <div className="emoji-strip" role="group" aria-label="表情">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-item"
              // 不抢输入框焦点，否则移动端键盘会先收起再弹起
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertEmoji(emoji)}
              aria-label={`插入 ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="message-input">
        <button
          type="button"
          className="emoji-button"
          aria-label="Emoji"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          ☺
        </button>

        <input
          ref={inputRef}
          value={value}
          // placeholder 不构成无障碍名称，屏幕阅读器读不出这个输入框是干什么的
          aria-label="消息输入框"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              send();
            }
          }}
          placeholder="Message"
        />

        <button
          type="button"
          className="send-button"
          onClick={send}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
