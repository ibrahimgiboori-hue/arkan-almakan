'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function SystemUserPage() {
  const [email,setEmail]=useState('');
  const [linkedId,setLinkedId]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [employees,setEmployees]=useState([]);
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function load() {
    setErr('');
    const session=(await supabase.auth.getSession()).data.session;
    if (!session) return;
    setEmail(session.user.email || '');
    const [u,e]=await Promise.all([
      supabase.from('app_users').select('employee_id, employees(full_name_ar, job_title)').eq('id',session.user.id).maybeSingle(),
      supabase.from('employees').select('id, employee_no, full_name_ar, job_title').order('full_name_ar'),
    ]);
    if (u.error || e.error) { setErr((u.error||e.error).message); return; }
    const id=u.data?.employee_id || '';
    setLinkedId(id); setSelectedId(id); setEmployees(e.data||[]);
  }

  useEffect(()=>{load();},[]);

  async function save(e) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true); setErr(''); setMsg('');
    const {error}=await supabase.rpc('link_current_user_employee',{p_employee_id:selectedId});
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('تم ربط حساب الدخول بالشخص المحدد. هذا الربط يعرّف مستخدم البرنامج فقط ولا يغير المنصب أو صلاحيات الاعتماد.');
    await load();
  }

  const current=employees.find((x)=>x.id===linkedId);

  return (
    <>
      <div className="page-head"><div><h1>مستخدم النظام</h1><p>ربط حساب الدخول بالشخص الحقيقي داخل المنشأة</p></div></div>
      {err&&<div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg&&<div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>الهوية داخل البرنامج</h2></header>
        <div style={{padding:18,lineHeight:1.9}}>
          <div style={{marginBottom:14,color:'var(--ink-soft)',fontSize:13.5}}>
            حساب الدخول يحدد من قام بالتسجيل داخل البرنامج. لا يعني أن هذا الشخص هو صاحب الطلب أو صاحب الاعتماد أو الموقع على المستند.
          </div>
          <div className="form-grid">
            <div className="field span2"><label>حساب الدخول</label><input value={email} readOnly dir="ltr" /></div>
            <div className="field span2"><label>الشخص المرتبط حاليًا</label><input value={current ? `${current.full_name_ar}${current.job_title?` - ${current.job_title}`:''}` : 'غير مرتبط'} readOnly /></div>
          </div>

          <form onSubmit={save} style={{marginTop:18}}>
            <div className="field">
              <label>ربط الحساب بشخص آخر</label>
              <select required value={selectedId} onChange={(e)=>setSelectedId(e.target.value)}>
                <option value="">اختر الشخص</option>
                {employees.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}{x.job_title?` - ${x.job_title}`:''}</option>)}
              </select>
              <span className="hint">اختر الشخص الذي يستخدم هذا الحساب فعليًا. لا تختَر صاحب الصلاحية الذي تسجل المعاملات نيابة عنه.</span>
            </div>
            <div style={{marginTop:14}}><button className="btn" type="submit" disabled={busy||!selectedId}>{busy?'جارٍ الحفظ':'حفظ الربط'}</button></div>
          </form>
        </div>
      </div>
    </>
  );
}
