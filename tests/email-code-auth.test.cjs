const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');
const logic = () => loadSource('src/emailCodeAuth/logic.ts');
const session = { access_token: 'fixture-only', user: { id: 'qa', email: 'qa@example.invalid' } };
function fixture() {
  const calls = [];
  return { calls, writePassword: async (token,password) => { calls.push(['update',{password,token}]); }, auth: {
    signUp: async args => { calls.push(['signup', args]); return { data: { session: null }, error: null }; },
    resetPasswordForEmail: async email => { calls.push(['recovery', email]); return { error: null }; },
    verifyOtp: async args => { calls.push(['verify', args]); return { data: { session }, error: null }; },
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    updateUser: async args => { calls.push(['update', args]); return { error: null }; },
    signOut: async () => ({ error: null }),
  }};
}
test('registration fails closed before sending if email confirmation is disabled', async () => {
  const f = fixture();
  await assert.rejects(() => logic().requestEmailCode(f.auth, 'signup', 'qa@example.invalid', false), /邮箱验证/);
  assert.equal(f.calls.length, 0);
});
test('signup creates an unconfirmed account with a random temporary password; recovery never signs up', async () => {
  const f = fixture();
  await logic().requestEmailCode(f.auth, 'signup', ' qa@example.invalid ', true);
  assert.equal(f.calls[0][0], 'signup');
  assert.equal(f.calls[0][1].email, 'qa@example.invalid');
  assert.ok(f.calls[0][1].password.length >= 32);
  const g = fixture(); await logic().requestEmailCode(g.auth, 'recovery', 'qa@example.invalid');
  assert.deepEqual(g.calls, [['recovery', 'qa@example.invalid']]);
});
for (const purpose of ['signup', 'recovery']) test(`${purpose} binds OTP proof to returned session and email`, async () => {
  const f = fixture();
  const proof = await logic().verifyEmailCode(f.auth, purpose, 'qa@example.invalid', '123456');
  assert.equal(proof.userId, 'qa'); assert.equal(proof.purpose, purpose);
  assert.deepEqual(f.calls[0][1], { email: 'qa@example.invalid', token: '123456', type: purpose });
  await logic().finishEmailPassword(f.auth, proof, 'new-password', async token => assert.equal(token, session.access_token), f.writePassword);
  assert.equal(f.calls.filter(x => x[0] === 'update').length, 1);
});
test('invalid OTP, empty session and wrong account do not yield proof', async () => {
  const f = fixture();
  await assert.rejects(() => logic().verifyEmailCode(f.auth, 'recovery', 'qa@example.invalid', 'bad'), /验证码/);
  f.auth.verifyOtp = async () => ({ data: { session: null }, error: null });
  await assert.rejects(() => logic().verifyEmailCode(f.auth, 'recovery', 'qa@example.invalid', '123456'), /验证/);
  f.auth.verifyOtp = async () => ({ data: { session }, error: null });
  await assert.rejects(() => logic().verifyEmailCode(f.auth, 'recovery', 'other@example.invalid', '123456'), /邮箱/);
});
test('missing or switched session, server identity failure, and account restrictions stop password updates', async () => {
  for (const cause of ['missing', 'switched', 'identity', 'restricted', 'no-proof']) {
    const f = fixture();
    const proof = await logic().verifyEmailCode(f.auth, 'recovery', 'qa@example.invalid', '123456');
    if(cause==='missing') f.auth.getSession=async()=>({data:{session:null},error:null});
    if(cause==='switched') f.auth.getSession=async()=>({data:{session:{...session,user:{...session.user,id:'other'}}},error:null});
    if(cause==='identity') f.auth.getUser=async()=>({data:{user:null},error:{message:'invalid'}});
    await assert.rejects(() => logic().finishEmailPassword(f.auth, cause==='no-proof'?null:proof, 'new-password', async()=>{if(cause==='restricted')throw new Error('账号限制');},f.writePassword));
    assert.equal(f.calls.some(x=>x[0]==='update'),false,cause);
  }
});

test('session changes during restriction check cannot update another account password', async () => {
  const f=fixture();
  const proof=await logic().verifyEmailCode(f.auth,'recovery','qa@example.invalid','123456');
  await assert.rejects(()=>logic().finishEmailPassword(f.auth,proof,'new-password',async()=>{
    f.auth.getSession=async()=>({data:{session:{...session,user:{id:'other',email:'other@example.invalid'}}},error:null});
  },f.writePassword));
  assert.equal(f.calls.some(x=>x[0]==='update'),false);
});

test('legacy recovery URL only opens email verification, never a password form', () => {
  const React = require('react');
  const { renderToStaticMarkup }=require('react-dom/server');
  const Component=loadSource('src/emailCodeAuth/AuthClientIntegration.tsx', {
    'next/navigation':{useRouter:()=>({replace(){}}),useSearchParams:()=>new URLSearchParams('recovery=1')},
    '@/lib/auth-context':{useAuth:()=>({user:null,loading:false,configured:true})},
    '@/lib/supabase/client':{supabaseBrowser:()=>({auth:{}})},
    '@/components/premium-orbi/PremiumOrbi':()=>null,
    '@/brand/BrandLockup':()=>null,
  }).default;
  const html=renderToStaticMarkup(React.createElement(Component));
  assert.ok(html.includes('发送验证码'));
  assert.equal(html.includes('type="password"'),false);
});

test('account status adapter rejects a missing session before any fetch',async()=>{
  const {checkEmailAuthAccount}=loadSource('src/emailCodeAuth/app-services.ts');
  await assert.rejects(()=>checkEmailAuthAccount(null),/会话/);
});

test('password write is pinned to verified token, never re-reads the SDK target',async()=>{
  const f=fixture();const proof=await logic().verifyEmailCode(f.auth,'recovery','qa@example.invalid','123456');
  f.auth.updateUser=async()=>{throw new Error('SDK target can switch to another account');};
  await logic().finishEmailPassword(f.auth,proof,'new-password',async()=>{},f.writePassword);
  assert.deepEqual(f.calls.find(x=>x[0]==='update'),['update',{token:'fixture-only',password:'new-password'}]);
});

test('pending password marker survives component recreation, cleanup never signs out a different account',async()=>{
  const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const pending=loadSource('src/emailCodeAuth/pending-session.ts');
  const f=fixture();let signouts=0;f.auth.signOut=async()=>{signouts++;return {error:null};};
  const proof={userId:'qa',email:'qa@example.invalid',purpose:'recovery'};
  assert.equal(pending.markPendingPassword(proof,storage),true);
  assert.equal(pending.hasPendingPassword('qa',storage),true);
  f.auth.getSession=async()=>({data:{session:{...session,user:{id:'other'}}},error:null});
  await pending.releasePendingSession(f.auth,proof,storage);
  assert.equal(signouts,0);assert.equal(pending.hasPendingPassword('qa',storage),false);
  pending.markPendingPassword(proof,storage);f.auth.getSession=async()=>({data:{session},error:null});
  await pending.releasePendingSession(f.auth,proof,storage);
  assert.equal(signouts,1);assert.equal(pending.hasPendingPassword('qa',storage),false);
});

test('mandatory password setup cancel signs out before returning to login',async()=>{
  const {cancelPasswordSetup}=loadSource('src/emailCodeAuth/pending-session.ts');
  const events=[];await cancelPasswordSetup({signOut:async()=>{events.push('signout');return {error:null};}},()=>events.push('login'));
  assert.deepEqual(events,['signout','login']);
});
