'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const { data: appUser, error } = await supabase.from('app_users').select('is_active').eq('id', data.session.user.id).maybeSingle();
      if (!alive) return;
      if (error || !appUser?.is_active) {
        setErr('الحساب غير مهيأ لاستخدام النظام.');
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router]);

  async function save(event) {
    event.preventDefault();
    setErr('');
    if (password.length < 10) { setErr('استخدم كلمة مرور لا تقل عن 10 أحرف.'); return; }
    if (password !== confirm) { setErr('تأكيد كلمة المرور غير مطابق.'); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setBusy(false);
      setErr(authError.message || 'تعذر تغيير كلمة المرور.');
      return;
    }
    const { error: flagError } = await supabase.rpc('confirm_own_password_change');
    setBusy(false);
    if (flagError) {
      setErr('تم تغيير كلمة المرور، لكن تعذر إغلاق حالة كلمة المرور المؤقتة. حاول الحفظ مرة أخرى.');
      return;
    }
    router.replace('/dashboard');
  }

  if (!ready) return <main className="login-wrap"><div className="login"><div className="msg">جارٍ تجهيز الحساب…</div></div></main>;

  return (
    <main className="login-wrap">
      <form className="login" onSubmit={save}>
        <div className="brand">
          <div className="skyline"><i/><i/><i/><i/><i/><i/></div>
          <h1>أركان المكان</h1>
          <p>تغيير كلمة المرور المؤقتة</p>
        </div>
        <div className="msg" style={{marginBottom:14,lineHeight:1.8}}>لأمان الحساب، يجب تعيين كلمة مرور خاصة بك قبل الدخول إلى النظام.</div>
        {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
        <div className="field"><label htmlFor="new-password">كلمة المرور الجديدة</label><input id="new-password" type="password" dir="ltr" minLength="10" required autoComplete="new-password" value={password} onChange={(event)=>setPassword(event.target.value)}/></div>
        <div className="field"><label htmlFor="confirm-password">تأكيد كلمة المرور</label><input id="confirm-password" type="password" dir="ltr" minLength="10" required autoComplete="new-password" value={confirm} onChange={(event)=>setConfirm(event.target.value)}/></div>
        <button className="btn" type="submit" disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ كلمة المرور والدخول'}</button>
      </form>
    </main>
  );
}
