'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ContractorLogin(){
  const router=useRouter();
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event){
    event.preventDefault();setBusy(true);setError('');
    const value=username.toLowerCase().trim();
    const {error:signError}=await supabase.auth.signInWithPassword({email:`${value}@portal.arkan.local`,password});
    if(signError){setError('اسم المستخدم أو كلمة المرور غير صحيحة.');setBusy(false);return;}
    const {error:portalError}=await supabase.rpc('fn_portal_dashboard');
    if(portalError){await supabase.auth.signOut();setError('هذا الحساب غير مفعل في بوابة المقاولين.');setBusy(false);return;}
    router.replace('/contractor');
  }
  return <main className="contractor-login" dir="rtl"><form onSubmit={submit}>
    <div className="portal-brand"><b>أركان المكان</b><span>بوابة المقاولين</span></div>
    <h1>دخول مسؤول المقاول</h1>
    <p>أدخل البيانات الموجودة في بطاقة المقاول داخل النظام.</p>
    {error&&<div className="portal-error">{error}</div>}
    <label>اسم المستخدم<input dir="ltr" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label>
    <label>كلمة المرور<input dir="ltr" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <button disabled={busy}>{busy?'جارٍ الدخول…':'دخول'}</button>
  </form></main>;
}
