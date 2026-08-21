'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function signIn(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const value = login.trim();
      if (value.includes('@')) {
        const { error } = await supabase.auth.signInWithPassword({ email:value, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.functions.invoke('identity-login', {
          body:{ identity:value, password },
        });
        if (error || !data?.session?.access_token || !data?.session?.refresh_token) {
          throw new Error(data?.message || 'تعذر التحقق من بيانات الدخول.');
        }
        const { error:setError } = await supabase.auth.setSession({
          access_token:data.session.access_token,
          refresh_token:data.session.refresh_token,
        });
        if (setError) throw setError;
      }
      router.replace('/dashboard');
    } catch {
      setErr('رقم الهوية أو البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    } finally { setBusy(false); }
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
          <label htmlFor="login">رقم الهوية أو البريد الإلكتروني</label>
          <input id="login" dir="ltr" required autoComplete="username"
                 value={login} onChange={(e)=>setLogin(e.target.value)}
                 placeholder="رقم الهوية / الإقامة للموظف" />
          <span className="hint">الموظفون يدخلون برقم الهوية أو الإقامة. حساب الإدارة القديم يمكنه الاستمرار بالبريد الإلكتروني.</span>
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
