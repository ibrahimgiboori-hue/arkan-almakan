'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { money, dateAr } from '@/lib/format';
import { CLAIM_CLASS } from '@/lib/projects';
import { projectClaimsService } from '@/lib/application/project-claims-service';
import {
  PROJECT_CLAIM_JOURNEY,
  PROJECT_CLAIM_STAGE_LABELS,
  projectClaimCurrentJourneyLabel,
  projectClaimDocsAt,
  projectClaimJourneyState,
  projectClaimSelectedMeasurements,
} from '@/lib/project-claims.mjs';

const MAROON = '#8B3332';

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
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
    try {
      const workspace=await projectClaimsService.loadWorkspace({projectId:project.id});
      setClaims(workspace.claims);
      setAvailable(workspace.available);
      setItems(workspace.items);
      setDocs(workspace.docs);
      setClaimLines(workspace.claimLines);
      setJourneys(workspace.journeys);
      setSelected((current)=>current.filter((id)=>workspace.available.some((row)=>row.measurement_id===id&&row.ready_for_claim)));
      const ids=workspace.claims.map((claim)=>claim.id);
      if(requestedClaim&&ids.includes(requestedClaim))setOpen(requestedClaim);
      onChange?.();
    } catch(error) {
      setErr(error?.message||'تعذر تحميل المستخلصات');
      setClaims([]);
      setAvailable([]);
      setItems([]);
      setDocs({});
      setClaimLines({});
      setJourneys({});
    }
  }

  useEffect(()=>{ load(); },[project.id]);
  useEffect(()=>{ if (requestedClaim && claims?.some(c=>c.id===requestedClaim)) setOpen(requestedClaim); },[requestedClaim,claims]);

  const docsAt=(cid,stage,code)=>projectClaimDocsAt(docs,cid,stage,code);
  const selectedSummary=useMemo(()=>projectClaimSelectedMeasurements(available,selected),[available,selected]);
  const selectedRows=selectedSummary.rows;
  const selectedTotal=selectedSummary.total;

  function chooseItem(itemId) {
    const it=items.find(x=>x.project_item_id===itemId);
    setMeasure({item:itemId,from:it?.suggested_period_from||'',to:'',qty:'',price:String(it?.sell_price??''),ref:'',notes:''});
  }

  async function recordMeasurement() {
    setBusy('measure'); setErr(''); setMsg('');
    try {
      const result=await projectClaimsService.recordMeasurement({measure});
      setMsg(`تم تسجيل التمتير رقم ${result?.measurement_no||''}`);
      setShowMeasure(false);
      setMeasure({item:'',from:'',to:'',qty:'',price:'',ref:'',notes:''});
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function completeHistoricalStart(m) {
    const value=window.prompt(`بداية فترة التمتير رقم ${m.measurement_no}`,m.period_from||'');
    if(value===null)return;
    try {
      await projectClaimsService.completeHistoricalStart({measurement:m,value});
      setMsg('تم استكمال فترة التمتير');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
  }

  async function editMeasurement(m) {
    const from=window.prompt('بداية فترة القياس',m.period_from||''); if(from===null)return;
    const to=window.prompt('تاريخ القياس',m.period_to||''); if(to===null)return;
    const q=window.prompt('الكمية المقاسة',String(m.qty_measured??'')); if(q===null)return;
    const p=window.prompt('فئة السعر',String(m.unit_price??'')); if(p===null)return;
    try {
      await projectClaimsService.editMeasurement({measurement:m,from,to,qty:q,price:p});
      setMsg('تم تعديل التمتير');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
  }

  async function cancelMeasurement(m) {
    if(!window.confirm(`إلغاء التمتير رقم ${m.measurement_no}؟`))return;
    try {
      await projectClaimsService.cancelMeasurement({measurement:m});
      setMsg('تم إلغاء التمتير');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
  }

  async function createClaimFromSelected() {
    setBusy('create');setErr('');setMsg('');
    try {
      const result=await projectClaimsService.createClaim({projectId:project.id,measurementIds:selected});
      setMsg(`تم إنشاء ${result?.claim_no||result?.proof?.claim_no||'المستخلص'}`);
      setSelected([]);
      await load();
      if(result?.claim_id)setOpen(result.claim_id);
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function issueMeasureSheet(claim) {
    setBusy(`issue:${claim.id}`); setErr('');
    try {
      await projectClaimsService.ensureMeasureSheet({
        claimId:claim.id,
        alreadyExists:docsAt(claim.id,'draft','claim_sheet').length>0,
      });
      window.open(`/print/claim/${claim.id}?doc=measure`,'_blank','noopener,noreferrer');
      setMsg('تم تجهيز محضر القياس');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function submitInternal(claim) {
    if(!docsAt(claim.id,'draft','claim_sheet').length){await issueMeasureSheet(claim);return;}
    setBusy(`submit:${claim.id}`);setErr('');setMsg('');
    try {
      await projectClaimsService.submitInternal({claimId:claim.id});
      setMsg('أُرسل المستخلص للاعتماد الداخلي');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function decideApproval(claim,decision) {
    const ctx=journeys[claim.id]||{};
    const workflowId=ctx.approval?.workflow?.id;
    if(!workflowId)return;
    const note=(approvalNotes[claim.id]||'').trim();
    setBusy(`decision:${claim.id}`);setErr('');setMsg('');
    try {
      const result=await projectClaimsService.decideApproval({workflowId,decision,note});
      setMsg(result.result==='approved'?'اكتمل الاعتماد الداخلي':'تم تنفيذ القرار');
      setApprovalNotes((value)=>({...value,[claim.id]:''}));
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function recordClientSubmission(claim) {
    const ref=window.prompt('مرجع التسليم للعميل - اختياري',claim.client_submission_ref||''); if(ref===null)return;
    const dt=window.prompt('تاريخ التقديم للعميل',claim.client_submitted_at||todayLocal()); if(dt===null)return;
    setBusy(`client:${claim.id}`);setErr('');
    try {
      await projectClaimsService.recordClientSubmission({claimId:claim.id,date:dt,reference:ref});
      setMsg('تم تسجيل تقديم المطالبة للعميل');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function recordOwnerApproval(claim) {
    const ref=window.prompt('مرجع اعتماد العميل - اختياري',claim.owner_ref||''); if(ref===null)return;
    setBusy(`owner:${claim.id}`);setErr('');
    try {
      await projectClaimsService.recordOwnerApproval({claimId:claim.id,reference:ref});
      setMsg('تم تسجيل اعتماد العميل');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  function patchCollect(claimId,field,value){setCollectForms(v=>({...v,[claimId]:{date:todayLocal(),account:'',ref:'',...(v[claimId]||{}),[field]:value}}));}

  async function collectClaim(claim) {
    const form={date:todayLocal(),account:'',ref:'',...(collectForms[claim.id]||{})};
    setBusy(`collect:${claim.id}`);setErr('');
    try {
      await projectClaimsService.collectClaim({claimId:claim.id,accountId:form.account,date:form.date||todayLocal(),reference:form.ref});
      setMsg('تم تسجيل التحصيل وترحيله إلى الخزينة تلقائيًا');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function recordInvoice(claim) {
    const no=window.prompt('رقم الفاتورة الضريبية',claim.invoice_no||''); if(no===null)return;
    const dt=window.prompt('تاريخ الفاتورة',claim.invoiced_at||todayLocal()); if(dt===null)return;
    setBusy(`invoice:${claim.id}`);setErr('');
    try {
      await projectClaimsService.recordInvoice({claimId:claim.id,invoiceNo:no,date:dt});
      setMsg('تم تسجيل بيانات الفاتورة');
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function uploadDoc(claim,doc,file,ref) {
    setBusy(`upload:${claim.id}`);setErr('');
    try {
      await projectClaimsService.uploadDocument({claimId:claim.id,doc,file,reference:ref});
      setMsg(`تم رفع ${doc.name_ar}`);
      setUpl(null);
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusy('');
  }

  async function openFile(path){
    try {
      const url=await projectClaimsService.openDocument(path);
      window.open(url,'_blank','noopener,noreferrer');
    } catch(error) { setErr(error?.message||String(error)); }
  }

  async function upd(id,fields){
    try {
      await projectClaimsService.updateDraftClaim({claimId:id,fields});
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
  }

  async function hardDelete(claim){
    const typed=window.prompt(`حذف ${claim.claim_no} نهائيًا وإعادة قياساته للقائمة. اكتب: حذف`);if(typed?.trim()!=='حذف')return;
    setBusyDel(true);setErr('');
    try {
      const result=await projectClaimsService.hardDelete({claimId:claim.id});
      setMsg('تم حذف المستخلص');
      if(result.cleanupWarning)setErr(result.cleanupWarning);
      await load();
    } catch(error) { setErr(error?.message||String(error)); }
    setBusyDel(false);
  }

  if(claims===null)return <div className="empty">جارٍ تحميل رحلة المستخلصات…</div>;

  return <>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    <div className="section" style={{marginTop:0,marginBottom:14,overflowX:'auto'}} data-project-claims-journey="engineered-v1">
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
        const invoiceFile=docsAt(c.id,'collected','tax_invoice').some(x=>x.file_path); const state=projectClaimJourneyState(c,ctx,invoiceFile);
        const current=projectClaimCurrentJourneyLabel(state);
        const form={date:todayLocal(),account:'',ref:'',...(collectForms[c.id]||{})};
        return <React.Fragment key={c.id}><tr><td><strong className="mono">{c.claim_no}</strong><div style={{fontSize:11,color:'var(--ink-soft)'}}>{lines.length} قياس</div></td><td className="mono">{dateAr(c.period_from)} - {dateAr(c.period_to)}</td><td className="num">{money(c.gross_amount)}</td><td className="num" style={{color:MAROON}}>{money(c.vat_amount)}</td><td className="num"><strong>{money(c.net_payable)}</strong></td><td><span className={`pill ${CLAIM_CLASS[c.status]||''}`}>{current}</span></td><td><button className="btn" style={mini} onClick={()=>setOpen(open===c.id?null:c.id)}>{open===c.id?'إغلاق':'فتح الرحلة'}</button></td></tr>
        {open===c.id&&<tr><td colSpan={7} style={{padding:16,background:'#FCFAFA'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(120px,1fr))',gap:8,overflowX:'auto',paddingBottom:8}}>{PROJECT_CLAIM_JOURNEY.map(([key,label])=><div key={key} style={{minWidth:120,padding:'10px 8px',border:'1px solid var(--hair)',borderRadius:8,background:state[key]==='current'?'#fff':state[key]==='done'?'#f5f7f4':'#fafafa',opacity:state[key]==='future'?.55:1}}><small>{state[key]==='done'?'✓ تم':state[key]==='current'?'الآن':'لاحقًا'}</small><div style={{fontWeight:700,marginTop:3}}>{label}</div></div>)}</div>

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
