import type { ReactNode } from 'react';
import type { ChatMessage } from '@/lib/chat-types';

interface MessageBubbleProps {
  message: ChatMessage;
  /**
   * 对方消息旁的小头像（本站加的可选槽位）。
   * 参考项目是单人演示页，气泡旁没有头像；接进本站的对话板块后
   * 一屏里可能既有官方也有好友，不给头像就分不清谁在说话。
   * 自己发的消息不渲染头像。
   */
  avatar?: ReactNode;
  /** 发送失败时点击气泡重试（只对 status='failed' 的消息生效） */
  onRetry?: () => void;
  /**
   * 气泡内的标签（本站扩展，迁移 031）：人工客服的消息标一个「客服」，
   * 用户要能一眼分清这条是真人发的还是机器人自动回的。
   */
  badge?: string;
}

/**
 * 消息气泡 —— 整体来自参考项目
 * `C:\Users\22346\Documents\ChatGPT\svg动画`，样式与结构未改，
 * 只加了一个可选的头像槽位（见上面说明）。
 */
export default function MessageBubble({
  message,
  avatar,
  onRetry,
  badge,
}: MessageBubbleProps) {
  const failed = message.status === "failed";
  return (
    <div
      className={[
        "message-row",
        message.mine ? "message-row-mine" : "message-row-other",
      ].join(" ")}
    >
      {!message.mine && avatar && (
        <span className="message-avatar">{avatar}</span>
      )}

      {/* 失败的气泡留在原位、标红，点一下重试 —— 直接撤掉的话用户只看到
          "消息消失了"，既不知道失败了也不知道怎么办 */}
      {failed && (
        <button
          type="button"
          className="message-failed-retry"
          onClick={onRetry}
          aria-label="发送失败，点击重试"
        >
          !
        </button>
      )}

      <div
        className={[
          "message-bubble",
          message.mine
            ? "message-bubble-mine"
            : "message-bubble-other",
          failed ? "message-bubble-failed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={failed ? onRetry : undefined}
        role={failed ? "button" : undefined}
      >
        <div className="message-content">
          {message.text}
        </div>

        <div className="message-meta">
          {/* 「客服」标签跟时间同一行靠左，用户扫一眼就知道这条是真人 */ }
          {badge && <span className="message-badge">{badge}</span>}
          <span>{message.time}</span>

          {message.mine && (
            <span
              className={`message-status status-${message.status}`}
            >
              {message.status === "sending" && "·"}
              {message.status === "sent" && "✓"}
              {message.status === "read" && "✓✓"}
              {failed && "发送失败"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
