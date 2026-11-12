/** Device and region do not prove control of an account. This legacy path is retired. */
export const dynamic = 'force-dynamic';
export async function POST() {
  return Response.json({ error: '请通过注册邮箱的数字验证码重置密码', code: 'RECOVERY_PROOF_REQUIRED' }, {
    status: 410, headers: { 'Cache-Control': 'no-store' },
  });
}
