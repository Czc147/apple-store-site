import { redirect } from 'next/navigation';

// 每日推荐已并入「订阅 → 我的库」：内容走订阅仓库，独立 Tab/路由重定向到我的库
export default function DailyPage() {
  redirect('/library');
}
