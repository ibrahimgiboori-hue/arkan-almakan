'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { interpretGuardedWrite } from '@/lib/guarded-write.mjs';
import { money, dateAr } from '@/lib/format';
import { CLAIM_CLASS } from '@/lib/projects';

const MAROON = '#8B3332';
const JOURNEY = [
  ['measurement','القياس'],
  ['internal','الاعتماد الداخلي'],
  ['client_submit','التقديم للعميل'],
  ['client_approve','اعتماد العميل'],
  ['collection','التحصيل'],
  ['invoice','الفاتورة'],
];

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function journeyState(claim, ctx, invoiceFile) {
  const wf = ctx?.approval?.workflow;
  const internalDone = claim.status !== 'draft';
  const clientSubmitted = Boolean(claim.client_submitted_at);
  const ownerApproved = ['owner_approved','collected'].includes(claim.status);
  const collected = claim.status === 'collected';
  const invoiceDone = collected && Boolean(claim.invoice_no && claim.invoiced_at && invoiceFile);
  return {
    measurement:'done',
    internal: internalDone ? 'done' : (wf?.status === 'pending' ? 'current' : 'current'),
    client_submit: internalDone ? (clientSubmitted ? 'done' : 'current') : 'future',
    client_approve: clientSubmitted ? (ownerApproved ? 'done' : 'current') : 'future',
    collection: ownerApproved ? (collected ? 'done' : 'current') : 'future',
    invoice: collected ? (invoiceDone ? 'done' : 'current') : 'future',
    invoiceDone,
  };
}

export default function ProjClaims({ project, canWrite, onChange }) {
  const searchParams = useSearchParams();
  const requestedClaim = searchParams.get('claim');
  const [claims,setClaims] = useState(null);
  const [available,setAvailable] = useState([]);
  const [items,setItems] = useState([]);
  const [claimLines,setClaimLines] = useState({});
  const [docs,setDocs] = useState({});
  const [journeys,setJourneys] = useState({});
  const [selected,setSelected] = useState([]);
  const [open,setOpen] = useState(null);
  const [upl,setUpl] = useState(null);
  const [showMeasure,setShowMeasure] = useState(false);
  const [measure,setMeasure] = useState({ item:'', from:'', to:'', qty:'', price:'', ref:'', notes:'' });
  const [approvalNotes,setApprovalNotes] = useState({});
  const [collectForms,setCollectForms] = useState({});
  const [busy,setBusy] = useState('');
  const [busyDel,setBusyDel] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  async function load() {
    setErr('');
    const [cr,av,it] = await Promise.all([
      supabase.from('progress_claims').select('*').eq('project_id',project.id).order('seq_no'),
      supabase.from('v_available_measurements').select('*').eq('project_id',project.id).order('period_to').order('measurement_no'),
      supabase.from('v_item_measurement_status').select('*').eq('project_id',project.id).order('description_ar'),
    ]);
    if (cr.error || av.error || it.error) {
      setErr((cr.error || av.error || it.error)?.message || 'تعذر تحميل المستخلصات');
      setClaims([]); return;
    }
    const rows = cr.data || [];
    setClaims(rows); setAvailable(av.data || []); setItems(it.data || []);
    setSelected(s => s.filter(id => (av.data || []).some(x=>x.measurement_id===id && x.ready_for_claim)));
    const ids = rows.map(x=>x.id);
    if (!ids.length) { setDocs({}); setClaimLines({}); setJourneys({}); onChange?.(); return; }

    const [att,lines,...contexts] = await Promise.all([
      supabase.from('op_attachments').select('*').eq('entity_type','claim').in('entity_id',ids).order('created_at'),
      supabase.from('claim_lines').select('claim_id,project_item_id,qty_this,unit_price,amount,measurement_id,measurement_no_snapshot,measurement_period_from,measurement_period_to,description_snapshot,unit_snapshot').in('claim_id',ids),
      ...ids.map(id=>supabase.rpc('fn_claim_journey_context',{p_claim_id:id})),
    ]);
    const dg={}; (att.data||[]).forEach(x=>{(dg[x.entity_id]=dg[x.entity_id]||[]).push(x);}); setDocs(dg);
    const lg={}; (lines.data||[]).forEach(x=>{(lg[x.claim_id]=lg[x.claim_id]||[]).push(x);}); setClaimLines(lg);
    const jg={}; ids.forEach((id,index)=>{ if (!contexts[index]?.error) jg[id]=contexts[index].data || {}; }); setJourneys(jg);
    if (requestedClaim && ids.includes(requestedClaim)) setOpen(requestedClaim);
    onChange?.();
  }

  useEffect(()=>{ load(); },[project.id]);
  useEffect(()=>{ if (requestedClaim && claims?.some(c=>c.id===requestedClaim)) setOpen(requestedClaim); },[requestedClaim,claims]);

  const docsAt=(cid,stage,code)=>(docs[cid]||[]).filter(d=>d.stage===stage&&(!code||d.doc_code===code));
  const selectedRows=useMemo(()=>available.filter(x=>selected.includes(x.measurement_id)),[available,selected]);
  const selectedTotal=selectedRows.reduce((s,x)=>s+Number(x.amount||0),0);

  function chooseItem(itemId) {
    const it=items.find(x=>x.project_item_id===itemId);
    setMeasure({item:itemId,from:it?.suggested_period_from||'',to:'',qty:'',price:String(it?.sell_price??''),ref:'',notes:''});
  }

  async function recordMeasurement() {
    if (!measure.item||!measure.from||!measure.to||!measure.qty) { setErr('أدخل البند والفترة والكمية'); return; }
    setBusy('measure'); setErr(''); setMsg('');
    const {data,error}=await supabase.rpc('record_item_measurement',{
      p_project_item:measure.item,p_period_from:measure.from,p_period_to:measure.to,p_qty:Number(measure.qty),
      p_unit_price:measure.price===''?null:Number(measure.price),p_document_ref:measure.ref||null,p_notes:measure.notes||null,p_measured_by_employee:null,
    });
    if(error)setErr(error.message); else { const r=Array.isArray(data)?data[0]:data; setMsg(`تم تسجيل التمتير رقم ${r?.measurement_no||''}`); setShowMeasure(false); setMeasure({item:'',from:'',to:'',qty:'',price:'',ref:'',notes:''}); await load(); }
    setBusy('');
  }

  async function completeHistoricalStart(m) {
    const value=window.prompt(`بداية فترة التمتير رقم ${m.measurement_no}`,m.period_from||'');
    if(value===null)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>m.period_to){setErr('راجع تاريخ بداية الفترة');return;}
    const outcome=interpretGuardedWrite(await supabase.from('item_measurements').update({period_from:value}).eq('id',m.measurement_id).eq('status','available').select('id'),{conflictMessage:'لم يعد التمتير متاحًا للتعديل'});
    if(!outcome.ok)setErr(outcome.message);else setMsg('تم استكمال فترة التمتير'); load();
  }

  async function editMeasurement(m) {
    const from=window.prompt('بداية فترة القياس',m.period_from||''); if(from===null)return;
    const to=window.prompt('تاريخ القياس',m.period_to||''); if(to===null)return;
    const q=window.prompt('الكمية المقاسة',String(m.qty_measured??'')); if(q===null)return;
    const p=window.prompt('فئة السعر',String(m.unit_price??'')); if(p===null)return;
    if(!from||!to||from>to||Number(q)<=0||Number(p)<0){setErr('راجع فترة القياس والكمية والسعر');return;}
    const outcome=interpretGuardedWrite(await supabase.from('item_measurements').update({period_from:from,period_to:to,qty_measured:Number(q),unit_price:Number(p)}).eq('id',m.measurement_id).eq('status','available').select('id'),{conflictMessage:'لم يعد التمتير متاحًا للتعديل'});
    if(!outcome.ok)setErr(outcome.message);else setMsg('تم تعديل التمتير'); load();
  }

  async function cancelMeasurement(m) {
    if(!window.confirm(`إلغاء التمتير رقم ${m.measurement_no}؟`))return;
    const outcome=interpretGuardedWrite(await supabase.from('item_measurements').update({status:'cancelled'}).eq('id',m.measurement_id).eq('status','available').select('id'),{conflictMessage:'لم يعد التمتير متاحًا للإلغاء'});
    if(!outcome.ok)setErr(outcome.message);else setMsg('تم إلغاء التمتير'); load();
  }

  async function createClaimFromSelected() {
    if(!selected.length){setErr('اختر تمتيراً واحداً على الأقل');return;}
    setBusy('create');setErr('');setMsg('');
    const {data,error}=await supabase.rpc('create_claim_from_measurements',{p_project:project.id,p_measurement_ids:selected});
    if(error)setErr(error.message);else{const r=Array.isArray(data)?data[0]:data;setMsg(`تم إنشاء ${r?.claim_no||'المستخلص'}`);setSelected([]);await load();if(r?.claim_id)setOpen(r.claim_id);}
    setBusy('');
  }

  async function issueMeasureSheet(claim) {
    setBusy(`issue:${claim.id}`); setErr('');
    if(!docsAt(claim.id,'draft','claim_sheet').length){
      const {error}=await supabase.from('op_attachments').insert({entity_type:'claim',entity_id:claim.id,stage:'draft',doc_code:'claim_sheet',direction:'out',title:'محضر قياس وحصر الأعمال',notes:'أُصدر من رحلة المستخلص'});
      if(error){setErr(error.message);setBusy('');return;}
    }
    window.open(`/print/claim/${claim.id}?doc=measure`,'_blank','noopener,noreferrer');
    setMsg('تم تجهيز محضر القياس'); setBusy(''); await load();
  }

  async function submitInternal(claim) {
    if(!docsAt(claim.id,'draft','claim_sheet').length){await issueMeasureSheet(claim);return;}
    setBusy(`submit:${claim.id}`);setErr('');setMsg('');
    const {error}=await supabase.rpc('fn_submit_progress_claim_for_approval',{p_claim_id:claim.id,p_note:null});
    if(error)setErr(error.message);else{setMsg('أُرسل المستخلص للاعتماد الداخلي');await load();}
    setBusy('');
  }

  async function decideApproval(claim,decision) {
    const ctx=journeys[claim.id]||{}; const workflowId=ctx.approval?.workflow?.id; if(!workflowId)return;
    const note=(approvalNotes[claim.id]||'').trim();
    if(decision!=='approve'&&!note){setErr('اكتب سبب الإرجاع أو الرفض');return;}
    setBusy(`decision:${claim.id}`);setErr('');setMsg('');
    const {data,error}=await supabase.rpc('fn_approval_decide',{p_workflow_id:workflowId,p_decision:decision,p_comment:note||null,p_next_user_id:null,p_next_capability:null,p_next_reason:null});
    if(error)setErr(error.message);else{setMsg(data==='approved'?'اكتمل الاعتماد الداخلي':'تم تنفيذ القرار');setApprovalNotes(v=>({...v,[claim.id]:''}));await load();}
    setBusy('');
  }

  async function recordClientSubmission(claim) {
    const ref=window.prompt('مرجع التسليم للعميل - اختياري',claim.client_submission_ref||''); if(ref===null)return;
    const dt=window.prompt('تاريخ التقديم للعميل',claim.client_submitted_at||todayLocal()); if(dt===null)return;
    setBusy(`client:${claim.id}`);setErr('');
    const {error}=await supabase.rpc('record_claim_client_submission',{p_claim:claim.id,p_submission_date:dt,p_ref:ref||null});
    if(error)setErr(error.message);else{setMsg('تم تسجيل تقديم المطالبة للعميل');await load();}
    setBusy('');
  }

  async function recordOwnerApproval(claim) {
    const ref=window.prompt('مرجع اعتماد العميل - اختياري',claim.owner_ref||''); if(ref===null)return;
    setBusy(`owner:${claim.id}`);setErr('');
    const {error}=await supabase.rpc('advance_claim',{p_claim:claim.id,p_to:'owner_approved',p_ref:ref||null,p_amount:null});
    if(error)setErr(error.message);else{setMsg('تم تسجيل اعتماد العميل');await load();}
    setBusy('');
  }

  function patchCollect(claimId,field,value){setCollectForms(v=>({...v,[claimId]:{date:todayLocal(),account:'',ref:'',...(v[claimId]||{}),[field]:value}}));}
  async function collectClaim(claim) {
    const form={date:todayLocal(),account:'',ref:'',...(collectForms[claim.id]||{})};
    if(!form.account){setErr('اختر الحساب الذي استلم المبلغ');return;}
    setBusy(`collect:${claim.id}`);setErr('');
    const {error}=await supabase.rpc('fn_claim_collect_to_treasury',{p_claim_id:claim.id,p_account_id:form.account,p_collection_date:form.date||todayLocal(),p_reference:form.ref||null});
    if(error)setErr(error.message);else{setMsg('تم تسجيل التحصيل وترحيله إلى الخزينة تلقائيًا');await load();}
    setBusy('');
  }

  async function recordInvoice(claim) {
    const no=window.prompt('رقم الفاتورة الضريبية',claim.invoice_no||''); if(no===null)return;
    if(!no.trim()){setErr('رقم الفاتورة مطلوب');return;}
    const dt=window.prompt('تاريخ الفاتورة',claim.invoiced_at||todayLocal()); if(dt===null)return;
    setBusy(`invoice:${claim.id}`);
    const {error}=await supabase.rpc('record_claim_invoice',{p_claim:claim.id,p_invoice_no:no.trim(),p_invoice_date:dt});
    if(error)setErr(error.message);else{setMsg('تم تسجيل بيانات الفاتورة');await load();}
    setBusy('');
  }

  async function uploadDoc(claim,doc,file,ref) {
    setBusy(`upload:${claim.id}`);setErr('');
    try{
      const safe=file.name.replace(/[^\w.\-]/g,'_');const path=`claims/${claim.id}/${doc.code}_${Date.now()}_${safe}`;
      const up=await supabase.storage.from('docs').upload(path,file);if(up.error)throw up.error;
      const {error}=await supabase.from('op_attachments').insert({entity_type:'claim',entity_id:claim.id,stage:doc.stage,doc_code:doc.code,direction:doc.direction,title:doc.name_ar,file_path:path,ref_no:ref||null});if(error)throw error;
      setMsg(`تم رفع ${doc.name_ar}`);setUpl(null);await load();
    }catch(e){setErr(e.message||String(e));}
    setBusy('');
  }

  async function openFile(path){const {data,error}=await supabase.storage.from('docs').createSignedUrl(path,120);if(error)setErr(error.message);else window.open(data.signedUrl,'_blank','noopener,noreferrer');}
  async function upd(id,fields){const {error}=await supabase.from('progress_claims').update(fields).eq('id',id);if(error)setErr(error.message);else load();}

  async function hardDelete(claim){
    const typed=window.prompt(`حذف ${claim.claim_no} نهائيًا وإعادة قياساته للقائمة. اكتب: حذف`);if(typed?.trim()!=='حذف')return;
    setBusyDel(true);setErr('');const {data,error}=await supabase.rpc('delete_claim_deep',{p_claim:claim.id});
    if(error)setErr(error.message);else{const r=Array.isArray(data)?data[0]:data;if(r?.files?.length)await supabase.storage.from('docs').remove(r.files);setMsg('تم حذف المستخلص');await load();}setBusyDel(false);
  }

  if(claims===null)return <div className="empty">جارٍ تحميل رحلة المستخلصات…</div>;

  return <>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    <div className="section" style={{marginTop:0,marginBottom:14,overflowX:'auto'}}>
      <header><div><h2>القياسات الجاهزة</h2></div>{canWrite&&<button className="btn" onClick={()=>setShowMeasure(v=>!v)}>{showMeasure?'إغلاق':'تسجيل قياس'}</button>}</header>
      {showMeasure&&canWrite&&<div style={{padding:14,borderBottom:'1px solid var(--hair)'}}><div className="form-grid">
        <div className="field span2"><label>البند</label><select value={measure.item} onChange={e=>chooseItem(e.target.value)}><option value="">اختر البند</option>{items.map(x=><option key={x.project_item_id} value={x.project_item_id}>{x.description_ar}</option>)}</select></div>
        <div className="field"><label>من</label><input type="date" value={measure.from} onChange={e=>setMeasure({...measure,from:e.target.value})}/></div>
        <div className="field"><label>إلى</label><input type="date" value={measure.to} onChange={e=>setMeasure({...measure,to:e.target.value})}/></div>
        <div className="field"><label>الكمية</label><input type="number" step="any" value={measure.qty} onChange={e=>setMeasure({...measure,qty:e.target.value})}/></div>
        <div className="field"><label>السعر</label><input type="number" step="0.01" value={measure.price} onChange={e=>setMeasure({...measure,price:e.target.value})}/></div>
        <div className="field span2"><label>مرجع / ملاحظة</label><input value={measure.ref} onChange={e=>setMeasure({...measure,ref:e.target.value})}/></div>
      </div><div style={{marginTop:10}}><button className="btn" disabled={busy==='measure'} onClick={recordMeasurement}>تسجيل القياس</button></div></div>}
      {available.length===0?<div className="empty"><h3>لا توجد قياسات تنتظر مستخلصًا</h3></div>:<><table><thead><tr><th>اختيار</th><th>البند</th><th>الرقم</th><th>الفترة</th><th className="num">الكمية</th><th className="num">القيمة</th><th>إجراء</th></tr></thead><tbody>{available.map(m=><tr key={m.measurement_id}><td><input type="checkbox" checked={selected.includes(m.measurement_id)} disabled={!m.ready_for_claim} onChange={()=>setSelected(s=>s.includes(m.measurement_id)?s.filter(x=>x!==m.measurement_id):[...s,m.measurement_id])}/></td><td>{m.description_ar}</td><td>{m.measurement_no}</td><td>{m.period_from?`${dateAr(m.period_from)} - ${dateAr(m.period_to)}`:'بداية الفترة مطلوبة'}</td><td className="num">{Number(m.qty_measured||0).toLocaleString('en-US',{maximumFractionDigits:3})}</td><td className="num">{money(m.amount)}</td><td>{canWrite&&<div className="rowsplit">{!m.period_from&&<button className="btn ghost" style={tiny} onClick={()=>completeHistoricalStart(m)}>تحديد البداية</button>}<button className="btn ghost" style={tiny} onClick={()=>editMeasurement(m)}>تعديل</button><button className="btn ghost" style={tiny} onClick={()=>cancelMeasurement(m)}>إلغاء</button></div>}</td></tr>)}</tbody></table><div style={{padding:12,display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><span>{selected.length} محدد {selected.length?`— ${money(selectedTotal)}`:''}</span>{canWrite&&<button className="btn" disabled={!selected.length||busy==='create'} onClick={createClaimFromSelected}>إنشاء مستخلص من المحدد</button>}</div></>}
    </div>

    <div className="section" style={{marginTop:0,overflowX:'auto'}}>
      <header><h2>رحلة المستخلصات</h2></header>
      <table><thead><tr><th>المستخلص</th><th>فترة القياس</th><th className="num">قيمة الأعمال</th><th className="num">الضريبة</th><th className="num">المستحق</th><th>أين وصل؟</th><th>العمل</th></tr></thead>
      <tbody>{claims.map(c=>{
        const ctx=journeys[c.id]||{}; const wf=ctx.approval?.workflow; const approval=ctx.approval||{}; const lines=claimLines[c.id]||[];
        const invoiceFile=docsAt(c.id,'collected','tax_invoice').some(x=>x.file_path); const state=journeyState(c,ctx,invoiceFile);
        const current=JOURNEY.find(([key])=>state[key]==='current')?.[1] || (state.invoiceDone?'مكتمل':'—');
        const form={date:todayLocal(),account:'',ref:'',...(collectForms[c.id]||{})};
        return <React.Fragment key={c.id}><tr><td><strong className="mono">{c.claim_no}</strong><div style={{fontSize:11,color:'var(--ink-soft)'}}>{lines.length} قياس</div></td><td className="mono">{dateAr(c.period_from)} - {dateAr(c.period_to)}</td><td className="num">{money(c.gross_amount)}</td><td className="num" style={{color:MAROON}}>{money(c.vat_amount)}</td><td className="num"><strong>{money(c.net_payable)}</strong></td><td><span className={`pill ${CLAIM_CLASS[c.status]||''}`}>{current}</span></td><td><button className="btn" style={mini} onClick={()=>setOpen(open===c.id?null:c.id)}>{open===c.id?'إغلاق':'فتح الرحلة'}</button></td></tr>
        {open===c.id&&<tr><td colSpan={7} style={{padding:16,background:'#FCFAFA'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(120px,1fr))',gap:8,overflowX:'auto',paddingBottom:8}}>{JOURNEY.map(([key,label])=><div key={key} style={{minWidth:120,padding:'10px 8px',border:'1px solid var(--hair)',borderRadius:8,background:state[key]==='current'?'#fff':state[key]==='done'?'#f5f7f4':'#fafafa',opacity:state[key]==='future'?.55:1}}><small>{state[key]==='done'?'✓ تم':state[key]==='current'?'الآن':'لاحقًا'}</small><div style={{fontWeight:700,marginTop:3}}>{label}</div></div>)}</div>

          <div style={{marginTop:14,padding:14,border:'1px solid var(--hair)',borderRadius:10,background:'#fff'}}>
            {c.status==='draft'&&!wf&&<>{!docsAt(c.id,'draft','claim_sheet').length?<><h3>الخطوة التالية: محضر القياس</h3><button className="btn" disabled={busy===`issue:${c.id}`} onClick={()=>issueMeasureSheet(c)}>إصدار محضر القياس</button></>:<><h3>الخطوة التالية: الاعتماد الداخلي</h3><button className="btn" disabled={busy===`submit:${c.id}`} onClick={()=>submitInternal(c)}>إرسال للاعتماد الداخلي</button></>}</>}
            {c.status==='draft'&&wf?.status==='returned'&&<><h3>أُعيد المستخلص للتعديل</h3><p>{wf.return_note||'راجع البيانات ثم أعد الإرسال.'}</p><button className="btn" onClick={()=>submitInternal(c)}>إعادة الإرسال للاعتماد</button></>}
            {c.status==='draft'&&wf?.status==='pending'&&<>{approval.can_act?<><h3>قرار الاعتماد الداخلي</h3><textarea rows={3} value={approvalNotes[c.id]||''} onChange={e=>setApprovalNotes(v=>({...v,[c.id]:e.target.value}))} placeholder="ملاحظة؛ مطلوبة عند الإرجاع أو الرفض" style={{width:'100%',marginBottom:10}}/><div className="rowsplit"><button className="btn" onClick={()=>decideApproval(c,'approve')}>اعتماد</button><button className="btn ghost" onClick={()=>decideApproval(c,'return')}>إرجاع للتعديل</button><button className="btn ghost" onClick={()=>decideApproval(c,'reject')}>رفض</button></div></>:<><h3>بانتظار الاعتماد الداخلي</h3><p>{ctx.approval?.steps?.find(x=>x.status==='pending')?.target_group_label||'الجهة المختصة'} هي صاحبة الخطوة الآن.</p></>}</>}
            {c.status==='submitted'&&!c.client_submitted_at&&<><h3>الخطوة التالية: تقديم المطالبة للعميل</h3><div className="rowsplit"><a className="btn ghost" target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=demand`}>عرض المطالبة</a><button className="btn" onClick={()=>recordClientSubmission(c)}>تسجيل التقديم للعميل</button></div></>}
            {c.status==='submitted'&&c.client_submitted_at&&<><h3>بانتظار اعتماد العميل</h3><p>قُدمت في {dateAr(c.client_submitted_at)}{c.client_submission_ref?` — ${c.client_submission_ref}`:''}</p>{canWrite&&<button className="btn" onClick={()=>recordOwnerApproval(c)}>تسجيل اعتماد العميل</button>}</>}
            {c.status==='owner_approved'&&<>{ctx.can_collect?<><h3>الخطوة التالية: التحصيل</h3><div className="form-grid"><div className="field"><label>الحساب المستلم</label><select value={form.account} onChange={e=>patchCollect(c.id,'account',e.target.value)}><option value="">اختر الحساب</option>{(ctx.treasury_accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name_ar}{a.bank_name?` — ${a.bank_name}`:''}</option>)}</select></div><div className="field"><label>تاريخ التحصيل</label><input type="date" value={form.date} onChange={e=>patchCollect(c.id,'date',e.target.value)}/></div><div className="field span2"><label>مرجع التحويل</label><input value={form.ref} onChange={e=>patchCollect(c.id,'ref',e.target.value)}/></div></div><button className="btn" onClick={()=>collectClaim(c)}>تسجيل التحصيل</button></>:<><h3>بانتظار التحصيل</h3><p>المستخلص جاهز؛ صاحب صلاحية الخزينة يفتح نفس الرحلة ويسجل الحساب المستلم هنا.</p></>}</>}
            {c.status==='collected'&&<><h3>{state.invoiceDone?'اكتملت رحلة المستخلص':'الخطوة الأخيرة: الفاتورة الضريبية'}</h3><p>تم التحصيل {dateAr(c.collected_at)}{c.collect_ref?` — ${c.collect_ref}`:''}</p>{!state.invoiceDone&&<div className="rowsplit">{!c.invoice_no&&<button className="btn" onClick={()=>recordInvoice(c)}>تسجيل بيانات الفاتورة</button>}{c.invoice_no&&<span className="pill">فاتورة {c.invoice_no}</span>}{!invoiceFile&&<button className="btn ghost" onClick={()=>setUpl({claim:c,doc:{stage:'collected',code:'tax_invoice',direction:'in',name_ar:'الفاتورة الضريبية'}})}>رفع الفاتورة</button>}</div>}</>}
          </div>

          <div style={{marginTop:14}}><strong>بيانات المستخلص</strong><div className="grid k4" style={{marginTop:8}}><div className="card"><small>قيمة الأعمال</small><strong>{money(c.gross_amount)}</strong></div><div className="card"><small>محتجزات</small>{canWrite&&c.status==='draft'?<input type="number" step="0.01" defaultValue={c.retention_amount} onBlur={e=>upd(c.id,{retention_amount:Number(e.target.value||0)})}/>:<strong>{money(c.retention_amount)}</strong>}</div><div className="card"><small>استرداد مقدمة</small>{canWrite&&c.status==='draft'?<input type="number" step="0.01" defaultValue={c.advance_recovery} onBlur={e=>upd(c.id,{advance_recovery:Number(e.target.value||0)})}/>:<strong>{money(c.advance_recovery)}</strong>}</div><div className="card"><small>المستحق</small><strong>{money(c.net_payable)}</strong></div></div></div>
          {lines.length>0&&<div style={{marginTop:14}}><strong>القياسات الداخلة</strong><table style={{marginTop:6}}><thead><tr><th>البند</th><th>القياس</th><th>الفترة</th><th className="num">الكمية</th><th className="num">القيمة</th></tr></thead><tbody>{lines.map((l,i)=><tr key={l.measurement_id||i}><td>{l.description_snapshot||'—'}</td><td>{l.measurement_no_snapshot||'—'}</td><td>{dateAr(l.measurement_period_from)} - {dateAr(l.measurement_period_to)}</td><td className="num">{Number(l.qty_this||0).toLocaleString('en-US',{maximumFractionDigits:3})}</td><td className="num">{money(l.amount)}</td></tr>)}</tbody></table></div>}
          {(docs[c.id]||[]).some(a=>a.file_path)&&<div style={{marginTop:14}}><strong>الملفات</strong><div className="rowsplit" style={{marginTop:6}}>{(docs[c.id]||[]).filter(a=>a.file_path).map(a=><button key={a.id} className="btn ghost" style={tiny} onClick={()=>openFile(a.file_path)}>{a.title||'فتح ملف'}</button>)}</div></div>}
          {canWrite&&c.status==='draft'&&wf?.status!=='pending'&&<div style={{marginTop:16,borderTop:'1px solid var(--hair)',paddingTop:12}}><button className="btn ghost" disabled={busyDel} onClick={()=>hardDelete(c)}>حذف المستخلص</button></div>}
        </td></tr>}</React.Fragment>;
      })}{claims.length===0&&<tr><td colSpan={7}><div className="empty"><h3>لا توجد مستخلصات</h3></div></td></tr>}</tbody></table>
    </div>

    {upl&&<UploadBox step={upl.doc} busy={Boolean(busy)} onCancel={()=>setUpl(null)} onSave={(f,ref)=>uploadDoc(upl.claim,upl.doc,f,ref)}/>} 
  </>;
}

function UploadBox({step,busy,onCancel,onSave}){
  const [file,setFile]=useState(null);const [ref,setRef]=useState('');
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}} onClick={onCancel}><div onClick={e=>e.stopPropagation()} dir="rtl" style={{background:'#fff',padding:20,width:420,maxWidth:'92vw',borderRadius:10}}><h3>{step?.name_ar||'مستند'}</h3><div className="field"><label>الملف</label><input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/></div><div className="field" style={{marginTop:10}}><label>المرجع</label><input value={ref} onChange={e=>setRef(e.target.value)}/></div><div className="rowsplit" style={{marginTop:14}}><button className="btn" disabled={!file||busy} onClick={()=>onSave(file,ref)}>رفع وتوثيق</button><button className="btn ghost" onClick={onCancel}>إلغاء</button></div></div></div>;
}

const mini={padding:'4px 8px',fontSize:12};
const tiny={padding:'2px 7px',fontSize:11.5};
