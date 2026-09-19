'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const EMAIL='muhammad.ij.torky@gmail.com';

export default function MuhammadTorkyEntry(){
  const router=useRouter();
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{
      if(!alive)return;
      if(data.session)router.replace('/dashboard/approvals');
      else setChecking(false);
    });
    return()=>{alive=false;};
  },[router]);

  async function signIn(event){
    event.preventDefault();
    setError('');
    setBusy(true);
    const {error:signInError}=await supabase.auth.signInWithPassword({email:EMAIL,password});
    if(signInError){
      setError('كلمة المرور غير صحيحة. تحقق منها وحاول مرة أخرى.');
      setBusy(false);
      return;
    }
    router.replace('/dashboard/approvals');
  }

  if(checking)return <main data-ui-surface="auth" data-ui-slot="page"><section data-ui-role="auth-card" data-ui-slot="form">جارٍ فتح مكتب الاعتمادات…</section></main>;

  return (
    <main data-ui-surface="auth" data-ui-slot="page">
      <section data-ui-part="auth-hero" aria-label="هوية أركان المكان">
        <div data-ui-part="auth-hero-brand">
          <strong>أركان المكان</strong>
          <span>نبني قيمة تدوم</span>
        </div>
        <div data-ui-part="auth-hero-copy">
          <strong>مكتب الاعتمادات</strong>
          <span>واجهة إدارية مخصصة لمراجعة المستندات واتخاذ القرارات.</span>
        </div>
        <span data-ui-part="auth-hero-signature">ARKAN APPROVALS</span>
      </section>

      <form data-ui-role="auth-card" data-ui-slot="form" onSubmit={signIn}>
        <div data-ui-part="brand">
          <div data-ui-part="brand-mark" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
          <h1>محمد انتصار تركي</h1>
          <p>دخول مباشر إلى مكتب الاعتمادات</p>
        </div>

        {error?<div data-ui-slot="notice" data-ui-tone="error" role="alert">{error}</div>:null}

        <div data-ui-role="field-group">
          <label>البريد الإلكتروني</label>
          <input data-ui-control="field" type="email" dir="ltr" value={EMAIL} readOnly/>
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
            onChange={(event)=>setPassword(event.target.value)}
          />
        </div>

        <button data-ui-control="action" data-ui-variant="primary" type="submit" disabled={busy}>
          {busy?'جارٍ الدخول…':'دخول مكتب الاعتمادات'}
        </button>
        <span data-ui-part="auth-security-note">دخول آمن — صلاحيات اعتمادات فقط</span>
      </form>
    </main>
  );
}
