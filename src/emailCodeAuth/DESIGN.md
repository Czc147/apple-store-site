# EmailCodeAuth

Reusable signup / password-recovery email OTP flow. Ordinary sign-in stays email + password.

## Files and ownership

`EmailCodeAuth.tsx` owns transient form state and focus; `logic.ts` owns Supabase port operations, normalization and session checks; `styles.css` owns visual styles. Application adapters supply account restrictions, configuration and routing. There is no demo dependency.

`app-services.ts` supplies this project's auth proxy and account API adapters. `AuthClientIntegration.tsx` composes the existing login card, branding and referral binding with this core. Import `EmailCodeAuth.tsx` directly when reusing the core in another page.

## Visual specification

Max width 420px; padding 28px (22px at widths <=420px); radius 20px; border #e5e5ea; white background. Existing apple CSS variables override surface/text colors. Heading 24px / 600, body 14px / 1.6; input 16px prevents iOS zoom, height 46px; controls at least 44px. Accent #0071e3, errors #b42318. Spacing: 10px label/input, 18px form rows, 24px intro-to-form.

## Motion

No animated properties, easing, stagger or transitions. React owns discrete step changes. Reduced-motion has identical behavior.

## Public contract

`purpose`: required `signup | recovery`. `auth`: required EmailAuthPort (Supabase Auth methods). `configured`: boolean, default true. `checkAccount(token)`: required async restriction check, reject on blocked/unknown status. `writePassword(token,password)`: required adapter which MUST send the supplied verified token explicitly, never look up a mutable shared-client session. `readConfirmationEnabled()`: required for signup, omitted resolves to disabled. `onRegistered(session)`: optional attribution after password set and before sign-out; failure does not roll back password. `onComplete(purpose)`: optional completion navigation after sign-out. `onCancel()`: optional return action. Mount with a key equal to purpose when switching workflows.

`onPasswordSet(token)` optionally clears an app-specific password-change flag after updating password and before sign-out. Failure does not undo password modification.

`EmailCodeProof` is ephemeral UI progress, not a server authorization credential. Real authorization is Supabase's verified session. It is bound to purpose/email/user; finish rechecks both current session and server identity before updating password, and checks the session again after the account API round trip. No proof is inferred from URL parameters. This does not introduce a custom password-reset admin endpoint.

The site adapter writes through `PUT /api/supabase/auth/user` with an explicit captured Bearer token. It does not use a service-role admin reset or shared SDK updateUser. `pending-session.ts` stores only a user-id-scoped unfinished-flow marker in localStorage (no token/code/password); pending sessions are signed out when abandoned, and login guards the marker on reload or another tab. This marker controls UI workflow, not server authorization; clearing it cannot create identity proof.

## Accessibility and performance

Native form submit, visible labels, email autocomplete, numeric OTP keyboard, one-time-code autocomplete, new-password autocomplete; focus advances at each step. Status and alert live regions. No network polling; one 1-second cooldown timer uses an absolute deadline and is removed on unmount. Synchronous busy guard prevents double requests. Fields and secondary actions disabled during requests. No passwords or codes persisted or logged. Single input permits 6–10 digits to match provider configuration. 60s resend cooldown is UX only; provider enforces real limits.

## Usage

```tsx
<EmailCodeAuth
  key="recovery"
  purpose="recovery"
  auth={supabase.auth}
  writePassword={writeEmailPassword}
  checkAccount={async token => {
    const response = await fetch('/api/account/status', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('账号暂时无法进行此操作');
  }}
  onComplete={() => router.push('/login?notice=password-updated')}
  onCancel={() => router.push('/login')}
/>
```

Hosted prerequisites: enable Confirm email; signup and reset-password templates display `{{ .Token }}`; configure OTP expiry and real send/verify limits. Do not disable email confirmation to make a test pass. Local UI success does not prove hosted settings or email delivery.
