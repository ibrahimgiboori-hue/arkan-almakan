'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function signIn(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErr('البريد أو كلمة المرور غير صحيحة. تحقق منهما وحاول مرة أخرى.');
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <main data-ui-surface="auth" data-ui-slot="page">
      <form data-ui-role="auth-card" data-ui-slot="form" onSubmit={signIn}>
        <div data-ui-part="brand">
          <div data-ui-part="brand-mark" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
          <h1>أركان المكان</h1>
          <p>النظام الإداري</p>
        </div>

        {err ? <div data-ui-slot="notice" data-ui-tone="error" role="alert">{err}</div> : null}

        <div data-ui-role="field-group">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input
            id="email"
            data-ui-control="field"
            type="email"
            dir="ltr"
            required
            autoComplete="username"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
          />
        </div>

        <div data-ui-role="field-group">
          <label htmlFor="pw">كلمة المرور</label>
          <input
            id="pw"
            data-ui-control="field"
            type="password"
            dir="ltr"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
          />
        </div>

        <button data-ui-control="action" data-ui-variant="primary" type="submit" disabled={busy}>
          {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
        </button>
      </form>
    </main>
  );
}
