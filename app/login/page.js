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
    <main className="login-wrap">
      <form className="login" onSubmit={signIn}>
        <div className="brand">
          <div className="skyline"><i/><i/><i/><i/><i/><i/></div>
          <h1>أركان المكان</h1>
          <p>النظام الإداري</p>
        </div>

        {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}

        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input id="email" type="email" dir="ltr" required autoComplete="username"
                 value={email} onChange={(e)=>setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="pw">كلمة المرور</label>
          <input id="pw" type="password" dir="ltr" required autoComplete="current-password"
                 value={password} onChange={(e)=>setPassword(e.target.value)} />
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
        </button>
      </form>
    </main>
  );
}
