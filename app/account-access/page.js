'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AccountAccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [identity,setIdentity] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!token) { setErr('رابط التفعيل غير مكتمل. اطلب رابطاً جديداً من الإدارة.'); return; }
    if (password.length < 8) { setErr('كلمة المرور يجب ألا تقل عن 8 خانات.'); return; }
    if (password !== confirm) { setErr('تأكيد كلمة المرور غير مطابق.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('identity-access', {
        body: { token, identity, password },
      });
      if (error || !data?.ok) throw new Error(data?.message || 'تعذر استخدام الرابط. قد يكون منتهياً أو سبق استخدامه.');
      if (data.session?.access_token && data.session?.refresh_token) {
        const { error:setError } = await supabase.auth.setSession({
          access_token:data.session.access_token,
          refresh_token:data.session.refresh_token,
        });
        if (setError) throw setError;
        router.replace('/dashboard');
        return;
      }
      router.replace('/login');
    } catch (e) {
      setErr(e.message || 'تعذر إكمال العملية.');
    } finally { setBusy(false); }
  }

  return (
    <main className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="brand">
          <div className="skyline"><i/><i/><i/><i/><i/><i/></div>
          <h1>أركان المكان</h1>
          <p>تفعيل حساب الدخول</p>
        </div>
        {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
        <div className="field">
          <label htmlFor="identity">رقم الهوية أو الإقامة</label>
          <input id="identity" dir="ltr" inputMode="numeric" autoComplete="username" required
                 value={identity} onChange={(e)=>setIdentity(e.target.value)} placeholder="10 أرقام" />
        </div>
        <div className="field">
          <label htmlFor="password">كلمة المرور الجديدة</label>
          <input id="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8}
                 value={password} onChange={(e)=>setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="confirm">تأكيد كلمة المرور</label>
          <input id="confirm" type="password" dir="ltr" autoComplete="new-password" required minLength={8}
                 value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ وتسجيل الدخول'}</button>
        <div style={{marginTop:14,textAlign:'center',fontSize:13}}><Link href="/login">العودة إلى تسجيل الدخول</Link></div>
      </form>
    </main>
  );
}
