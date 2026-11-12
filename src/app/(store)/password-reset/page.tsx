import PasswordResetBotClient from '@/components/auth/PasswordResetBotClient';

export const metadata = {
  title: '找回密码',
  description: '通过注册邮箱接收数字验证码，验证身份后设置新密码。',
};

export default function PasswordResetPage() {
  return <PasswordResetBotClient />;
}
