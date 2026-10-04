import PasswordResetBotClient from '@/components/auth/PasswordResetBotClient';

export const metadata = {
  title: '客服机器人找回密码',
  description: '通过账号、常用设备类型和登录地区自动验证，并生成临时密码。',
};

export default function PasswordResetPage() {
  return <PasswordResetBotClient />;
}
