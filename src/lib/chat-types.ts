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
}
