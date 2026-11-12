'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabaseBrowser } from '@/lib/supabase/client';
import EmailCodeAuth from '@/emailCodeAuth/EmailCodeAuth';
import { checkEmailAuthAccount, clearEmailPasswordFlag, writeEmailPassword } from '@/emailCodeAuth/app-services';
export default function PasswordRecoveryClient() {
  const { configured } = useAuth();
  const router = useRouter();
  if (!configured) return <p className="px-page py-12 text-center" role="status">密码恢复暂不可用，请稍后再试。</p>;
  return <div className="px-page py-12"><EmailCodeAuth purpose="recovery" auth={supabaseBrowser().auth}
    checkAccount={async token => { await checkEmailAuthAccount(token); }} writePassword={writeEmailPassword} onPasswordSet={clearEmailPasswordFlag}
    onComplete={() => router.push('/login?notice=password-updated')} onCancel={() => router.push('/login')} /></div>;
}
