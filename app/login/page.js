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
      <section data-ui-part="auth-hero" aria-label="هوية أركان المكان">
        <div data-ui-part="auth-hero-brand">
          <strong>أركان المكان</strong>
          <span>نبني قيمة تدوم</span>
        </div>
        <div data-ui-part="auth-hero-copy">
          <strong>أكثر من مشاريع.. نصنع أثرًا يدوم.</strong>
          <span>نظام تشغيلي موحد لإدارة المشاريع والموارد والمال والمستندات بوضوح واحد وهوية واحدة.</span>
        </div>
        <span data-ui-part="auth-hero-signature">ARKAN SIGNATURE</span>
      </section>

      <form data-ui-role="auth-card" data-ui-slot="form" onSubmit={signIn}>
        <div data-ui-part="brand">
          <div data-ui-part="brand-mark" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
          <h1>مرحبًا بك مجددًا</h1>
          <p>سجّل الدخول إلى أركان المكان</p>
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
        <span data-ui-part="auth-security-note">دخول آمن إلى نظام أركان المكان</span>
      </form>
    </main>
  );
}
