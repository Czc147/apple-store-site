import { useEffect, useRef, type ReactNode } from "react";
import type { ChatMessage } from '@/lib/chat-types';
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
  /**
   * 对方消息旁的小头像（本站加的可选槽位，见 MessageBubble 说明）。
   * 传的是一个渲染函数而不是静态节点 —— 每个会话的头像不同，
   * 而且官方要用 Orbi、好友要用资料头像。
   */
  renderAvatar?: (message: ChatMessage) => ReactNode;
  /** 没有消息时显示的内容（本站用来放"我是 Orbi"的欢迎形象） */
  empty?: ReactNode;
  /** 点击发送失败的消息时重试（本仓扩展，见 MessageBubble 的失败态） */
  onRetry?: (messageId: string) => void;
}

/**
 * 消息列表 —— 来自参考项目
 * `C:\Users\22346\Documents\ChatGPT\svg动画`，滚动行为与结构未改，
 * 只加了「头像槽位」与「空态」两个可选参数。
 */
export default function MessageList({
  messages,
  renderAvatar,
  empty,
  onRetry,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    element.scrollTo({
      top: element.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  return (
    <div
      ref={containerRef}
      className="message-list"
    >
      {messages.length === 0 && empty}
      {messages.map((message) =>
        // 系统提示不是"谁说的话"，是状态变化（客服接入/结束）——
        // 做成气泡会被误读成官方说了这句，所以单独渲染成居中灰字
        message.kind === 'system' ? (
          <p key={message.id} className="message-system">
            {message.text}
          </p>
        ) : (
          <MessageBubble
            key={message.id}
            message={message}
            avatar={renderAvatar?.(message)}
            badge={message.kind === 'agent' ? '客服' : undefined}
            onRetry={onRetry ? () => onRetry(message.id) : undefined}
          />
        ),
      )}
    </div>
  );
}
