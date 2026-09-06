import { redirect } from 'next/navigation';

// 兑换已并入「我的库」：卡密输入框内嵌在 /library 顶部，独立路由重定向过去
export default function RedeemPage() {
  redirect('/library');
}
