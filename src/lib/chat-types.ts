export interface ChatMessage {
  id: string;
  text: string;
  mine: boolean;
  time: string;
  /**
   * 发送状态。本仓在参考项目的三种之外**加了 failed** ——
   * 参考项目是本地演示，不存在"发失败"；真接后端后必须有，
   * 否则失败时只能把气泡撤掉，用户看到的就是"消息凭空消失"。
   */
  status?: "sending" | "sent" | "read" | "failed";
  /**
   * 消息种类（迁移 031）：官方留言支持人工客服后出现。
   * - agent  人工客服发的 → 气泡上方标「客服」
   * - system 系统提示（客服已介入 / 服务已结束）→ 渲染成居中灰字，不是气泡
   * 好友聊天里永远是 text，不影响。
   */
  kind?: "text" | "agent" | "system";
}
