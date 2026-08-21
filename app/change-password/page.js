'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready,setReady] = useState(false);
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');

  useEffect(()=>{
    let alive=true;
    (async()=>{
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) { router.replace('/login'); return; }
      const { data:row } = await supabase.from('app_users')
        .select('must_change_password,is_active').eq('id',data.session.user.id).maybeSingle();
      if (!row?.is_active) { await supabase.auth.signOut(); router.replace('/login'); return; }
      if (!row.must_change_password) { router.replace('/dashboard'); return; }
      setReady(true);
    })();
    return ()=>{alive=false;};
  },[router]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('كلمة المرور الجديدة يجب ألا تقل عن 8 خانات.'); return; }
    if (password !== confirm) { setErr('تأكيد كلمة المرور غير مطابق.'); return; }
    setBusy(true);
    try {
      const { data,error } = await supabase.functions.invoke('employee-access-admin', {
        body:{ action:'change_own_password', password },
      });
      if (error || !data?.ok) throw new Error(data?.message || 'تعذر تغيير كلمة المرور.');
      router.replace('/dashboard');
    } catch (e) {
      setErr(e.message || 'تعذر تغيير كلمة المرور.');
    } finally { setBusy(false); }
  }

  if (!ready) return <div className="empty">جارٍ التحقق…</div>;

  return (
    <main className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="brand">
          <div className="skyline"><i/><i/><i/><i/><i/><i/></div>
          <h1>أركان المكان</h1>
          <p>إنشاء كلمة مرور خاصة بك</p>
        </div>
        <div className="msg" style={{marginBottom:14}}>دخلت بكلمة مرور مؤقتة من الإدارة. أنشئ الآن كلمة مرور خاصة بك قبل استخدام النظام.</div>
        {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
        <div className="field">
          <label htmlFor="new-password">كلمة المرور الجديدة</label>
          <input id="new-password" type="password" dir="ltr" autoComplete="new-password" required minLength={8}
                 value={password} onChange={(e)=>setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">تأكيد كلمة المرور</label>
          <input id="confirm-password" type="password" dir="ltr" autoComplete="new-password" required minLength={8}
                 value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور والمتابعة'}</button>
      </form>
    </main>
  );
}
