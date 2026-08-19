'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import { OPERATION_CERTAINTY } from '@/lib/operation-safety.mjs';
import { pendingOperationCount, syncPendingOperations } from '@/lib/verified-operation-write';
import styles from './page.module.css';

const OPERATION_LABEL={attendance:'حضور',output:'إنجاز',expense:'مصروف',advance:'سلفة',payment:'دفعة'};
const STATUS_LABEL={draft:'قيد الإدخال',reconciled:'تمت المطابقة',closed:'مغلقة',cancelled:'ملغاة'};
const EMPTY={title:'',project_id:'',period_from:'',period_to:'',expected_documents:'',certainty:'confirmed',notes:''};

export default function OperationDataSafetyPage(){
  const [projects,setProjects]=useState([]);
  const [batches,setBatches]=useState([]);
  const [receipts,setReceipts]=useState([]);
  const [receiptCount,setReceiptCount]=useState(0);
  const [pending,setPending]=useState(0);
  const [form,setForm]=useState(EMPTY);
  const [showForm,setShowForm]=useState(false);
  const [busy,setBusy]=useState('');
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  async function load(){
    setErr('');
    const [p,b,r,c]=await Promise.all([
      supabase.from('projects').select('id,project_no,name_ar').order('project_no'),
      supabase.from('v_operation_entry_batch_health').select('id,batch_no,title,project_id,period_from,period_to,certainty,expected_documents,status,created_at,closed_at,operation_count,registered_document_refs,last_verified_at').order('created_at',{ascending:false}),
      supabase.from('operation_write_receipts').select('id,receipt_no,operation_type,project_id,work_date,batch_id,source_kind,source_ref,certainty,entity_table,entity_ids,saved_at,verified_at,projects(project_no,name_ar),operation_entry_batches(batch_no,title)').order('receipt_no',{ascending:false}).limit(100),
      supabase.from('operation_write_receipts').select('id',{count:'exact',head:true}),
    ]);
    const firstError=[p,b,r,c].find(x=>x.error)?.error;
    if(firstError){setErr('تعذر تحميل سجل سلامة البيانات: '+firstError.message);return;}
    setProjects(p.data||[]);setBatches(b.data||[]);setReceipts(r.data||[]);setReceiptCount(c.count||0);setPending(pendingOperationCount());
  }

  useEffect(()=>{load();},[]);

  async function createBatch(e){
    e.preventDefault();setBusy('create');setErr('');setMsg('');
    const {data,error}=await supabase.rpc('fn_create_operation_entry_batch',{
      p_title:form.title,p_project_id:form.project_id||null,p_period_from:form.period_from||null,
      p_period_to:form.period_to||null,p_expected_documents:Number(form.expected_documents||0),
      p_certainty:form.certainty,p_notes:form.notes||null,
    });
    setBusy('');
    if(error){setErr(error.message);return;}
    setForm(EMPTY);setShowForm(false);setMsg(`أُنشئت الدفعة ${data.batch_no}. أصبحت متاحة في مركز التشغيل.`);await load();
  }

  async function closeBatch(row){
    const refs=distinctRefs(row.id);
    if(!confirm(`إغلاق ${row.batch_no}؟\nالمراجع المسجلة: ${refs}${row.expected_documents?` من ${row.expected_documents}`:''}`))return;
    setBusy(row.id);setErr('');setMsg('');
    const {data,error}=await supabase.rpc('fn_close_operation_entry_batch',{p_batch_id:row.id,p_note:'أغلقت بعد المراجعة من شاشة سلامة البيانات'});
    setBusy('');
    if(error){setErr(error.message);return;}
    setMsg(`أُغلقت ${data.batch_no} بعد مطابقة ${data.registered_document_refs||0} مرجع ورقي.`);await load();
  }

  async function sync(){
    if(!pending)return;
    setBusy('sync');setErr('');setMsg('');
    const result=await syncPendingOperations();
    setBusy('');setPending(result.pendingCount||0);
    if(result.synced)setMsg(`تمت مزامنة ${result.synced} حركة وظهرت إيصالاتها في الخادم.`);
    if(result.failed)setErr(`تعذرت مزامنة ${result.failed} حركة. بقيت على هذا الجهاز لإعادة المحاولة.`);
    await load();
  }

  function distinctRefs(batchId){return Number(batches.find(b=>b.id===batchId)?.registered_document_refs||0);}
  const last=receipts[0]||null;
  const openCount=useMemo(()=>batches.filter(x=>['draft','reconciled'].includes(x.status)).length,[batches]);

  return <div dir="rtl">
    <div className="page-head"><div><h1>سلامة بيانات التشغيل</h1><p>إثباتات الحفظ ودفعات الأوراق والعمليات التي تنتظر المزامنة.</p></div><div className="rowsplit"><Link className="btn ghost" href="/dashboard/site-operations">مركز التشغيل</Link><button className="btn" onClick={()=>setShowForm(x=>!x)}>دفعة أوراق جديدة</button></div></div>

    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    <div className={styles.healthGrid}>
      <div className={styles.healthCard}><span>إيصالات الخادم</span><b>{receiptCount}</b><small>كل إيصال مرتبط بحركة فعلية</small></div>
      <div className={`${styles.healthCard} ${pending?styles.warn:''}`}><span>ينتظر المزامنة على هذا الجهاز</span><b>{pending}</b><small>{pending?'لم تُفقد، لكنها ليست مسجلة في الخادم بعد':'لا توجد عمليات معلقة'}</small>{pending>0&&<button onClick={sync} disabled={busy==='sync'}>{busy==='sync'?'جارٍ التحقق…':'مزامنة الآن'}</button>}</div>
      <div className={styles.healthCard}><span>دفعات أوراق مفتوحة</span><b>{openCount}</b><small>لا تغلق قبل مطابقة المراجع</small></div>
      <div className={styles.healthCard}><span>آخر حفظ مثبت</span><b className={styles.receiptNo}>{last?`#${last.receipt_no}`:'—'}</b><small>{last?new Date(last.verified_at).toLocaleString('ar-SA-u-ca-gregory'):'لا يوجد حتى الآن'}</small></div>
    </div>

    {showForm&&<form className={styles.batchForm} onSubmit={createBatch}>
      <header><div><h2>دفعة إدخال أوراق</h2><p>اجمع الأوراق التي ستدخلها تحت رقم واحد يمكن مطابقته وإغلاقه.</p></div></header>
      <div className="form-grid">
        <div className="field span2"><label>اسم الدفعة</label><input required minLength="3" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="مثال: تايم شيت مشروع 7 — يوليو 2026"/></div>
        <div className="field"><label>المشروع</label><select value={form.project_id} onChange={e=>setForm(f=>({...f,project_id:e.target.value}))}><option value="">دفعة عامة</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>)}</select></div>
        <div className="field"><label>عدد الأوراق المتوقع</label><input type="number" min="0" value={form.expected_documents} onChange={e=>setForm(f=>({...f,expected_documents:e.target.value}))}/></div>
        <div className="field"><label>من تاريخ</label><input type="date" value={form.period_from} onChange={e=>setForm(f=>({...f,period_from:e.target.value}))}/></div>
        <div className="field"><label>إلى تاريخ</label><input type="date" value={form.period_to} onChange={e=>setForm(f=>({...f,period_to:e.target.value}))}/></div>
        <div className="field"><label>حالة البيانات</label><select value={form.certainty} onChange={e=>setForm(f=>({...f,certainty:e.target.value}))}>{Object.entries(OPERATION_CERTAINTY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>ملاحظة</label><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
      </div>
      <div className="rowsplit"><button className="btn" disabled={busy==='create'}>{busy==='create'?'جارٍ الإنشاء…':'إنشاء الدفعة'}</button><button type="button" className="btn ghost" onClick={()=>setShowForm(false)}>إلغاء</button></div>
    </form>}

    <section className="section" style={{marginTop:16}}><header><h2>دفعات الإدخال</h2></header><div className={styles.tableWrap}><table><thead><tr><th>رقم الدفعة</th><th>البيان</th><th>المشروع</th><th>الفترة</th><th>الأوراق</th><th>الحالة</th><th>—</th></tr></thead><tbody>
      {batches.map(b=>{const refs=distinctRefs(b.id),project=projects.find(p=>p.id===b.project_id);return <tr key={b.id}><td className="mono">{b.batch_no}</td><td><b>{b.title}</b><div className={styles.sub}>{OPERATION_CERTAINTY[b.certainty]||b.certainty} · {b.operation_count||0} حركة</div></td><td>{project?`${project.project_no} — ${project.name_ar}`:'عامة'}</td><td className="mono">{b.period_from?`${dateAr(b.period_from)}${b.period_to?` — ${dateAr(b.period_to)}`:''}`:'—'}</td><td>{refs}{b.expected_documents?` / ${b.expected_documents}`:''}</td><td>{STATUS_LABEL[b.status]||b.status}</td><td>{['draft','reconciled'].includes(b.status)&&<button className="btn ghost" style={{padding:'4px 9px',fontSize:12}} disabled={busy===b.id} onClick={()=>closeBatch(b)}>إغلاق بعد المطابقة</button>}</td></tr>;})}
      {!batches.length&&<tr><td colSpan="7"><div className="empty">لا توجد دفعات أوراق بعد.</div></td></tr>}
    </tbody></table></div></section>

    <section className="section"><header><h2>آخر إثباتات الحفظ</h2><span className={styles.serverOnly}>هذه القائمة مقروءة من الخادم</span></header><div className={styles.tableWrap}><table><thead><tr><th>الإثبات</th><th>الحركة</th><th>المشروع</th><th>تاريخ الحدث</th><th>مصدرها</th><th>وقت الحفظ</th></tr></thead><tbody>
      {receipts.map(r=><tr key={r.id}><td className="mono"><b>#{r.receipt_no}</b></td><td>{OPERATION_LABEL[r.operation_type]||r.operation_type}<div className={styles.sub}>{r.entity_ids?.length||0} سجل</div></td><td>{r.projects?`${r.projects.project_no} — ${r.projects.name_ar}`:'—'}</td><td className="mono">{dateAr(r.work_date)}</td><td>{r.operation_entry_batches?.batch_no||'إدخال مباشر'}{r.source_ref&&<div className={styles.sub}>{r.source_ref}</div>}</td><td className="mono">{new Date(r.verified_at).toLocaleString('ar-SA-u-ca-gregory')}</td></tr>)}
      {!receipts.length&&<tr><td colSpan="6"><div className="empty">ستظهر هنا أول حركة تحفظ عبر طبقة الإثبات الجديدة.</div></td></tr>}
    </tbody></table></div></section>
  </div>;
}
