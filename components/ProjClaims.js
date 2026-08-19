'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { CLAIM_CLASS } from '@/lib/projects';

const MAROON = '#8B3332';
const FALLBACK_STAGES = [
  { stage:'draft', seq:1, name_ar:'مسودة القياس', docs:[] },
  { stage:'submitted', seq:2, name_ar:'مطالبة مقدمة', docs:[] },
  { stage:'owner_approved', seq:3, name_ar:'مطالبة معتمدة', docs:[] },
  { stage:'collected', seq:4, name_ar:'تم السداد', docs:[] },
];
const NEXT = {
  draft:['submitted','تقديم المطالبة'],
  submitted:['owner_approved','تسجيل اعتماد الجهة'],
  owner_approved:['collected','تسجيل السداد'],
};

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

export default function ProjClaims({ project, canWrite, onChange }) {
  const [claims,setClaims] = useState(null);
  const [available,setAvailable] = useState([]);
  const [items,setItems] = useState([]);
  const [claimLines,setClaimLines] = useState({});
  const [steps,setSteps] = useState([]);
  const [docs,setDocs] = useState({});
  const [checks,setChecks] = useState({});
  const [selected,setSelected] = useState([]);
  const [open,setOpen] = useState(null);
  const [upl,setUpl] = useState(null);
  const [showMeasure,setShowMeasure] = useState(false);
  const [measure,setMeasure] = useState({ item:'', from:'', to:'', qty:'', price:'', ref:'', notes:'' });
  const [busy,setBusy] = useState(false);
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
    if (cr.error) { setErr(cr.error.message); return; }
    if (av.error) { setErr(av.error.message); return; }
    if (it.error) { setErr(it.error.message); return; }

    const rows = cr.data || [];
    setClaims(rows);
    setAvailable(av.data || []);
    setItems(it.data || []);
    setSelected(s => s.filter(id => (av.data || []).some(x=>x.measurement_id===id && x.ready_for_claim)));

    const ids = rows.map(x=>x.id);
    if (!ids.length) {
      setDocs({}); setChecks({}); setClaimLines({}); onChange?.(); return;
    }

    const [att,val,lines] = await Promise.all([
      supabase.from('op_attachments').select('*').eq('entity_type','claim').in('entity_id',ids).order('created_at'),
      supabase.from('v_claim_validation').select('*').in('claim_id',ids),
      supabase.from('claim_lines').select('claim_id,project_item_id,qty_this,unit_price,amount,measurement_id,measurement_no_snapshot,measurement_period_from,measurement_period_to,description_snapshot,unit_snapshot').in('claim_id',ids),
    ]);

    const dg = {};
    (att.data || []).forEach(x=>{ (dg[x.entity_id] = dg[x.entity_id] || []).push(x); });
    setDocs(dg);

    const vg = {};
    (val.data || []).forEach(x=>{ vg[x.claim_id] = x; });
    setChecks(vg);

    const lg = {};
    (lines.data || []).forEach(x=>{ (lg[x.claim_id] = lg[x.claim_id] || []).push(x); });
    setClaimLines(lg);
    onChange?.();
  }

  useEffect(()=>{
    (async()=>{
      const [defs,dcs] = await Promise.all([
        supabase.from('claim_stage_defs').select('*').order('seq'),
        supabase.from('claim_stage_docs').select('*').order('seq'),
      ]);
      const byStage = {};
      (dcs.data || []).forEach(d=>{ (byStage[d.stage] = byStage[d.stage] || []).push(d); });
      const built = (defs.data || []).filter(x=>x.stage!=='invoiced').map(x=>({ ...x, docs:byStage[x.stage] || [] }));
      setSteps(built.length ? built : FALLBACK_STAGES);
    })();
  },[]);

  useEffect(()=>{ load(); },[project.id]);

  const stepOf = st => steps.find(s=>s.stage===st);
  const docsAt = (cid,st,code) => (docs[cid] || []).filter(d=>d.stage===st && (!code || d.doc_code===code));
  const lacking = c => {
    const st = stepOf(c.status);
    if (!st) return [];
    return (st.docs || []).filter(d=>d.required && docsAt(c.id,d.stage,d.code).length===0);
  };

  const selectedRows = useMemo(()=>available.filter(x=>selected.includes(x.measurement_id)),[available,selected]);
  const selectedTotal = selectedRows.reduce((s,x)=>s+Number(x.amount || 0),0);

  function chooseItem(itemId) {
    const it = items.find(x=>x.project_item_id===itemId);
    setMeasure({
      item:itemId,
      from:it?.suggested_period_from || '',
      to:'', qty:'', price:String(it?.sell_price ?? ''), ref:'', notes:'',
    });
  }

  async function recordMeasurement() {
    if (!measure.item || !measure.from || !measure.to || !measure.qty) {
      setErr('أدخل البند وبداية الفترة وتاريخ القياس والكمية'); return;
    }
    setBusy(true); setErr(''); setMsg('');
    const { data,error } = await supabase.rpc('record_item_measurement',{
      p_project_item:measure.item,
      p_period_from:measure.from,
      p_period_to:measure.to,
      p_qty:Number(measure.qty),
      p_unit_price:measure.price==='' ? null : Number(measure.price),
      p_document_ref:measure.ref || null,
      p_notes:measure.notes || null,
      p_measured_by_employee:null,
    });
    if (error) setErr(error.message);
    else {
      const r = Array.isArray(data) ? data[0] : data;
      setMsg(`تم تسجيل التمتير رقم ${r?.measurement_no || ''}`);
      setShowMeasure(false);
      setMeasure({ item:'',from:'',to:'',qty:'',price:'',ref:'',notes:'' });
      await load();
    }
    setBusy(false);
  }

  async function completeHistoricalStart(m) {
    const value = window.prompt(`بداية فترة التمتير رقم ${m.measurement_no} - ${m.description_ar}`,'');
    if (value===null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { setErr('أدخل التاريخ بصيغة YYYY-MM-DD'); return; }
    if (value > m.period_to) { setErr('بداية الفترة لا يمكن أن تكون بعد تاريخ القياس'); return; }
    const { error } = await supabase.from('item_measurements').update({ period_from:value }).eq('id',m.measurement_id).eq('status','available');
    if (error) setErr(error.message); else { setMsg('تم استكمال فترة التمتير'); load(); }
  }

  async function editMeasurement(m) {
    const from = window.prompt('بداية فترة القياس',m.period_from || '');
    if (from===null) return;
    const to = window.prompt('تاريخ القياس',m.period_to || '');
    if (to===null) return;
    const q = window.prompt('الكمية المقاسة',String(m.qty_measured ?? ''));
    if (q===null) return;
    const p = window.prompt('فئة السعر',String(m.unit_price ?? ''));
    if (p===null) return;
    if (!from || !to || from>to || Number(q)<=0 || Number(p)<0) { setErr('راجع فترة القياس والكمية وفئة السعر'); return; }
    const { error } = await supabase.from('item_measurements').update({ period_from:from,period_to:to,qty_measured:Number(q),unit_price:Number(p) }).eq('id',m.measurement_id).eq('status','available');
    if (error) setErr(error.message); else { setMsg('تم تعديل التمتير'); load(); }
  }

  async function cancelMeasurement(m) {
    if (!window.confirm(`إلغاء التمتير رقم ${m.measurement_no} للبند ${m.description_ar}؟`)) return;
    const { error } = await supabase.from('item_measurements').update({status:'cancelled'}).eq('id',m.measurement_id).eq('status','available');
    if (error) setErr(error.message); else { setMsg('تم إلغاء التمتير'); load(); }
  }

  function toggleMeasurement(m) {
    if (!m.ready_for_claim) return;
    setSelected(s=>s.includes(m.measurement_id) ? s.filter(x=>x!==m.measurement_id) : [...s,m.measurement_id]);
  }

  async function createClaimFromSelected() {
    if (!selected.length) { setErr('اختر تمتيراً واحداً على الأقل'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { data,error } = await supabase.rpc('create_claim_from_measurements',{
      p_project:project.id,
      p_measurement_ids:selected,
    });
    if (error) setErr(error.message);
    else {
      const r = Array.isArray(data) ? data[0] : data;
      setMsg(`تم إنشاء ${r?.claim_no || 'المستخلص'} من ${r?.measurements_count || selected.length} تمتير`);
      setSelected([]);
      await load();
    }
    setBusy(false);
  }

  const issueHref = (c,code) => {
    if (code==='claim_sheet') return `/print/claim/${c.id}?doc=measure`;
    if (code==='cover_letter') return `/print/claim/${c.id}?doc=demand`;
    if (code==='inv_request') return `/print/claim/${c.id}?doc=memo`;
    if (code==='payment_receipt_notice') return `/print/claim/${c.id}?doc=receipt`;
    return `/print/claim/${c.id}?doc=demand`;
  };

  async function markIssued(claim,doc) {
    const ref = window.prompt(`رقم أو مرجع ${doc.name_ar} - اختياري`) ?? '';
    const { error } = await supabase.from('op_attachments').insert({
      entity_type:'claim',entity_id:claim.id,stage:doc.stage,doc_code:doc.code,
      direction:'out',title:doc.name_ar,ref_no:ref || null,notes:'صادر من النظام',
    });
    if (error) setErr(error.message); else { setMsg(`تم توثيق إصدار ${doc.name_ar}`); load(); }
  }

  async function uploadDoc(claim,doc,file,ref,amount) {
    setBusy(true); setErr('');
    try {
      const safe = file.name.replace(/[^\w.\-]/g,'_');
      const path = `claims/${claim.id}/${doc.code}_${Date.now()}_${safe}`;
      const up = await supabase.storage.from('docs').upload(path,file);
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from('op_attachments').insert({
        entity_type:'claim',entity_id:claim.id,stage:doc.stage,doc_code:doc.code,
        direction:doc.direction,title:doc.name_ar,file_path:path,ref_no:ref || null,
        amount:amount ? Number(amount) : null,
      });
      if (error) throw new Error(error.message);
      setMsg('تم رفع المستند وتوثيقه'); setUpl(null); await load();
    } catch(e) { setErr(e.message); }
    setBusy(false);
  }

  async function openFile(path) {
    const { data,error } = await supabase.storage.from('docs').createSignedUrl(path,120);
    if (error) setErr(error.message); else window.open(data.signedUrl,'_blank');
  }

  async function delDoc(a) {
    if (!window.confirm('حذف هذا المستند من سجل المستخلص؟')) return;
    if (a.file_path) await supabase.storage.from('docs').remove([a.file_path]);
    const { error } = await supabase.from('op_attachments').delete().eq('id',a.id);
    if (error) setErr(error.message); else load();
  }

  async function advance(claim,to) {
    setErr(''); setMsg('');
    const chk = await supabase.rpc('claim_can_advance',{p_claim:claim.id});
    const r = Array.isArray(chk.data) ? chk.data[0] : chk.data;
    if (chk.error) { setErr(chk.error.message); return; }
    if (r && r.ok===false) { setErr(r.reason); setOpen(claim.id); return; }

    let ref=null,amount=null;
    if (to==='owner_approved') ref=window.prompt('مرجع اعتماد الجهة - اختياري') ?? null;
    if (to==='collected') {
      const v=window.prompt('المبلغ المسدد',String(claim.net_payable || ''));
      if (v===null) return;
      amount=Number(v);
      if (!Number.isFinite(amount) || amount<0) { setErr('المبلغ المسدد غير صحيح'); return; }
      ref=window.prompt('مرجع التحويل أو السداد - اختياري') ?? null;
    }
    const { error } = await supabase.rpc('advance_claim',{p_claim:claim.id,p_to:to,p_ref:ref,p_amount:amount});
    if (error) setErr(error.message); else { setMsg('تم تحديث حالة المستخلص'); load(); }
  }

  async function recordInvoice(claim) {
    const no=window.prompt('رقم الفاتورة الضريبية',claim.invoice_no || '');
    if (no===null) return;
    if (!no.trim()) { setErr('رقم الفاتورة مطلوب'); return; }
    const dt=window.prompt('تاريخ الفاتورة',todayLocal());
    if (dt===null) return;
    const { error }=await supabase.rpc('record_claim_invoice',{p_claim:claim.id,p_invoice_no:no.trim(),p_invoice_date:dt});
    if (error) setErr(error.message); else { setMsg('تم تسجيل بيانات الفاتورة'); load(); }
  }

  async function goBack(claim) {
    if (!window.confirm(`إرجاع ${claim.claim_no} خطوة واحدة للتصحيح؟`)) return;
    const { error }=await supabase.rpc('rollback_claim_one_step',{p_claim:claim.id});
    if (error) setErr(error.message); else { setMsg('تم إرجاع المستخلص خطوة واحدة'); load(); }
  }

  async function upd(id,fields) {
    const { error }=await supabase.from('progress_claims').update(fields).eq('id',id);
    if (error) setErr(error.message); else load();
  }

  async function hardDelete(claim) {
    const typed=window.prompt(`حذف نهائي للمستخلص ${claim.claim_no} بكل بنوده ومستنداته.\nسيعود التمتير المرتبط متاحاً للمطالبة.\nاكتب: حذف`);
    if (typed===null) return;
    if (typed.trim()!=='حذف') { setErr('لم يتم الحذف لأن كلمة التأكيد غير مطابقة'); return; }
    setBusyDel(true); setErr('');
    try {
      const { data,error }=await supabase.rpc('delete_claim_deep',{p_claim:claim.id});
      if (error) throw new Error(error.message);
      const r=Array.isArray(data) ? data[0] : data;
      if (r?.files?.length) await supabase.storage.from('docs').remove(r.files);
      setMsg(`تم حذف ${r?.deleted_no || claim.claim_no} وأعيد التمتير إلى القائمة المتاحة`);
      await load();
    } catch(e) { setErr(e.message); }
    setBusyDel(false);
  }

  if (!claims) return <div className="empty">جارٍ التحميل</div>;

  return <>
    {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    <div className="section" style={{marginTop:0,marginBottom:14,overflowX:'auto'}}>
      <header>
        <div>
          <h2>التمتير المتاح بدون مستخلص</h2>
          <div style={{fontSize:12.5,color:'var(--ink-soft)',marginTop:3}}>
            يظهر هنا تلقائياً كل تمتير لم يدخل في مستخلص. اختر تمتيراً واحداً لمستخلص مستقل أو عدة تمتيرات لدمجها في مستخلص واحد.
          </div>
        </div>
        {canWrite && <button className="btn" onClick={()=>setShowMeasure(!showMeasure)}>{showMeasure?'إغلاق':'تسجيل تمتير'}</button>}
      </header>

      {showMeasure && canWrite && <div style={{padding:14,borderBottom:'1px solid var(--hair)',background:'#FCFAFA'}}>
        <div className="form-grid">
          <div className="field span2"><label>البند *</label>
            <select value={measure.item} onChange={e=>chooseItem(e.target.value)}>
              <option value="">اختر البند</option>
              {items.map(x=><option key={x.project_item_id} value={x.project_item_id}>{x.description_ar}</option>)}
            </select>
          </div>
          <div className="field"><label>بداية فترة القياس *</label><input type="date" value={measure.from} onChange={e=>setMeasure({...measure,from:e.target.value})}/></div>
          <div className="field"><label>تاريخ القياس *</label><input type="date" value={measure.to} onChange={e=>setMeasure({...measure,to:e.target.value})}/></div>
          <div className="field"><label>الكمية المقاسة *</label><input type="number" step="any" dir="ltr" value={measure.qty} onChange={e=>setMeasure({...measure,qty:e.target.value})}/></div>
          <div className="field"><label>فئة السعر</label><input type="number" step="0.01" dir="ltr" value={measure.price} onChange={e=>setMeasure({...measure,price:e.target.value})}/></div>
          <div className="field"><label>مرجع ورقة القياس</label><input value={measure.ref} onChange={e=>setMeasure({...measure,ref:e.target.value})}/></div>
          <div className="field span2"><label>ملاحظات</label><input value={measure.notes} onChange={e=>setMeasure({...measure,notes:e.target.value})}/></div>
        </div>
        <div className="rowsplit" style={{marginTop:12}}>
          <button className="btn" disabled={busy} onClick={recordMeasurement}>{busy?'جارٍ التسجيل':'تسجيل التمتير'}</button>
          <span style={{fontSize:12,color:'var(--ink-soft)'}}>تاريخ تسجيلك في البرنامج لا يغيّر فترة القياس.</span>
        </div>
      </div>}

      {available.length===0 ? <div className="empty"><h3>لا يوجد تمتير متاح</h3><p>سجّل التمتير عند وصول القياس، وسيظهر هنا حتى تربطه بمستخلص.</p></div> : <>
        <table>
          <thead><tr>
            <th style={{width:44}}>اختيار</th><th>البند</th><th>رقم التمتير</th><th>فترة القياس</th>
            <th className="num">الكمية</th><th>الوحدة</th><th className="num">فئة السعر</th><th className="num">القيمة</th><th>الإجراءات</th>
          </tr></thead>
          <tbody>{available.map(m=><tr key={m.measurement_id}>
            <td><input type="checkbox" checked={selected.includes(m.measurement_id)} disabled={!m.ready_for_claim} onChange={()=>toggleMeasurement(m)}/></td>
            <td>{m.description_ar}</td>
            <td className="num">{m.measurement_no}</td>
            <td>
              {m.period_from ? <span className="mono">{dateAr(m.period_from)} - {dateAr(m.period_to)}</span> : <div>
                <span style={{fontWeight:700,color:'#8A2E28'}}>بداية الفترة مطلوبة</span>
                <div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>تاريخ القياس: {dateAr(m.period_to)}</div>
              </div>}
            </td>
            <td className="num">{Number(m.qty_measured).toLocaleString('en-US',{maximumFractionDigits:3})}</td>
            <td>{m.unit || '—'}</td>
            <td className="num">{money(m.unit_price)}</td>
            <td className="num" style={{fontWeight:700}}>{money(m.amount)}</td>
            <td>{canWrite && <div className="rowsplit">
              {!m.period_from && <button className="btn" style={tiny} onClick={()=>completeHistoricalStart(m)}>تحديد بداية الفترة</button>}
              <button className="btn ghost" style={tiny} onClick={()=>editMeasurement(m)}>تعديل</button>
              <button className="btn ghost" style={{...tiny,color:'#A32B24',borderColor:'#EBC3C0'}} onClick={()=>cancelMeasurement(m)}>إلغاء</button>
            </div>}</td>
          </tr>)}</tbody>
        </table>
        <div style={{padding:'12px 14px',display:'flex',gap:14,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',borderTop:'1px solid var(--hair)'}}>
          <div><strong>{selected.length}</strong> تمتير محدد {selected.length>0 && <span> — الإجمالي {money(selectedTotal)}</span>}</div>
          {canWrite && <button className="btn" disabled={busy || selected.length===0} onClick={createClaimFromSelected}>
            {busy?'جارٍ الإنشاء':selected.length>1?'إنشاء مستخلص موحد من المحدد':'إنشاء مستخلص من التمتير المحدد'}
          </button>}
        </div>
      </>}
    </div>

    <div className="section" style={{marginTop:0,overflowX:'auto'}}>
      <header><h2>المستخلصات</h2></header>
      <table>
        <thead><tr>
          <th>الرقم</th><th>نطاق القياسات</th><th>التمتيرات</th><th className="num">قيمة الأعمال</th><th className="num">الوعاء</th><th className="num">الضريبة</th>
          <th className="num">محتجزات</th><th className="num">استرداد مقدمة</th><th className="num">المستحق</th><th>الحالة</th><th>المستندات والإجراءات</th>
        </tr></thead>
        <tbody>{claims.map(c=>{
          const nx=NEXT[c.status];
          const need=lacking(c);
          const issues=checks[c.id]?.issues || [];
          const lines=claimLines[c.id] || [];
          const invoiceFile=docsAt(c.id,'collected','tax_invoice').length>0;
          const invoiceComplete=!!c.invoice_no && !!c.invoiced_at && invoiceFile;
          return <React.Fragment key={c.id}>
            <tr>
              <td className="mono">{c.claim_no}</td>
              <td className="mono" style={{fontSize:12}}>{dateAr(c.period_from)} - {dateAr(c.period_to)}</td>
              <td>{lines.filter(x=>x.measurement_id).length || '—'}</td>
              <td className="num">{money(c.gross_amount)}</td>
              <td className="num">{money(c.taxable_base)}</td>
              <td className="num" style={{color:MAROON}}>{money(c.vat_amount)}</td>
              <td className="num">{canWrite && c.status==='draft' ? <input type="number" step="0.01" dir="ltr" defaultValue={c.retention_amount} onBlur={e=>upd(c.id,{retention_amount:Number(e.target.value||0)})} style={inp}/> : money(c.retention_amount)}</td>
              <td className="num">{canWrite && c.status==='draft' ? <input type="number" step="0.01" dir="ltr" defaultValue={c.advance_recovery} onBlur={e=>upd(c.id,{advance_recovery:Number(e.target.value||0)})} style={inp}/> : money(c.advance_recovery)}</td>
              <td className="num" style={{fontWeight:700}}>{money(c.net_payable)}</td>
              <td>
                <span className={`pill ${CLAIM_CLASS[c.status] || ''}`}>{stepOf(c.status)?.name_ar || c.status}</span>
                {issues.length>0 && <div style={{fontSize:11,color:'#8A2E28',marginTop:4}}>مراجعة مطلوبة</div>}
                {c.collected_at && <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:3}}>السداد {dateAr(c.collected_at)}</div>}
                {c.invoice_no && <div className="mono" style={{fontSize:11,color:'var(--ink-soft)'}}>فاتورة {c.invoice_no}</div>}
                {c.status==='collected' && <div style={{fontSize:10.5,color:invoiceComplete?'#245c31':'#7a2925'}}>{invoiceComplete?'الفاتورة موثقة':'الفاتورة تحتاج استكمال'}</div>}
              </td>
              <td><div className="rowsplit">
                <button className="btn ghost" style={mini} onClick={()=>setOpen(open===c.id?null:c.id)}>التفاصيل</button>
                {c.status==='draft' && <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=measure`}>محضر القياس</a>}
                {['submitted','owner_approved'].includes(c.status) && <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=demand`}>المطالبة</a>}
                {c.status==='collected' && <>
                  <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=receipt`}>إشعار الاستلام</a>
                  <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=memo`}>طلب الفاتورة</a>
                  {canWrite && <button className="btn ghost" style={mini} onClick={()=>recordInvoice(c)}>تسجيل الفاتورة</button>}
                </>}
                {canWrite && nx && <button className="btn" style={mini} onClick={()=>advance(c,nx[0])}>{nx[1]}</button>}
                {canWrite && c.status!=='draft' && <button className="btn ghost" style={mini} onClick={()=>goBack(c)}>رجوع خطوة</button>}
                {canWrite && <button className="btn ghost" disabled={busyDel} style={{...mini,color:'#A32B24',borderColor:'#EBC3C0'}} onClick={()=>hardDelete(c)}>حذف نهائي</button>}
              </div></td>
            </tr>
            {open===c.id && <tr><td colSpan={11} style={{background:'#FCFAFA',padding:14}}>
              {issues.length>0 && <div className="msg err" style={{marginBottom:10}}><strong>مراجعة بيانات المستخلص</strong>{issues.map((x,i)=><div key={i}>{x}</div>)}</div>}

              {lines.filter(x=>x.measurement_id).length>0 && <div style={{marginBottom:14}}>
                <div style={{fontWeight:700,color:MAROON,marginBottom:6}}>التمتيرات داخل المستخلص</div>
                <table><thead><tr><th>البند</th><th>رقم التمتير</th><th>فترة القياس</th><th className="num">الكمية</th><th>الوحدة</th><th className="num">فئة السعر</th><th className="num">القيمة</th></tr></thead>
                <tbody>{lines.filter(x=>x.measurement_id).map((l,i)=><tr key={l.measurement_id || i}>
                  <td>{l.description_snapshot || '—'}</td><td className="num">{l.measurement_no_snapshot || '—'}</td>
                  <td className="mono">{dateAr(l.measurement_period_from)} - {dateAr(l.measurement_period_to)}</td>
                  <td className="num">{Number(l.qty_this || 0).toLocaleString('en-US',{maximumFractionDigits:3})}</td><td>{l.unit_snapshot || '—'}</td>
                  <td className="num">{money(l.unit_price)}</td><td className="num">{money(l.amount)}</td>
                </tr>)}</tbody></table>
              </div>}

              <div style={{fontWeight:700,color:MAROON,marginBottom:6}}>المستندات</div>
              {steps.map(st=>{
                const cur=stepOf(c.status);
                const isCur=st.stage===c.status;
                const passed=(cur?.seq || 0)>st.seq;
                return <div key={st.stage} style={{padding:'7px 0',borderBottom:'1px solid #eee',opacity:(isCur||passed)?1:.55}}>
                  <div style={{fontWeight:isCur?700:500,marginBottom:4}}>{st.name_ar}{isCur?' - المرحلة الحالية':''}</div>
                  {(st.docs || []).map(d=>{
                    const list=docsAt(c.id,d.stage,d.code);
                    return <div key={d.code} style={{display:'flex',gap:10,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',padding:'3px 0'}}>
                      <div><span>{d.name_ar}</span>{d.required && list.length===0 && (isCur||passed) && <span style={{color:'#8A2E28',fontSize:11}}> - مطلوب</span>}
                        {list.map(a=><div key={a.id} style={{fontSize:11.5,color:'var(--ink-soft)'}}>{a.ref_no || 'موثق'} {a.file_path && <button className="btn ghost" style={tiny} onClick={()=>openFile(a.file_path)}>فتح</button>} {canWrite && <button className="btn ghost" style={{...tiny,color:'#A32B24'}} onClick={()=>delDoc(a)}>حذف</button>}</div>)}</div>
                      {canWrite && (isCur||passed) && <div className="rowsplit">
                        {d.direction==='out' && <><a className="btn ghost" style={tiny} target="_blank" rel="noreferrer" href={issueHref(c,d.code)}>طباعة</a><button className="btn ghost" style={tiny} onClick={()=>markIssued(c,d)}>توثيق الإصدار</button></>}
                        <button className="btn ghost" style={tiny} onClick={()=>setUpl({claim:c,doc:d})}>رفع ملف</button>
                      </div>}
                    </div>;
                  })}
                </div>;
              })}
            </td></tr>}
          </React.Fragment>;
        })}
        {claims.length===0 && <tr><td colSpan={11}><div className="empty"><h3>لا توجد مستخلصات</h3><p>اختر من التمتير المتاح أعلاه لإنشاء أول مستخلص.</p></div></td></tr>}
        </tbody>
      </table>
    </div>

    {upl && <UploadBox step={upl.doc} busy={busy} onCancel={()=>setUpl(null)} onSave={(f,ref,amt)=>uploadDoc(upl.claim,upl.doc,f,ref,amt)}/>} 
  </>;
}

function UploadBox({ step,busy,onCancel,onSave }) {
  const [file,setFile]=useState(null);
  const [ref,setRef]=useState('');
  const [amount,setAmount]=useState('');
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}} onClick={onCancel}>
    <div onClick={e=>e.stopPropagation()} dir="rtl" style={{background:'#fff',padding:20,width:420,maxWidth:'92vw'}}>
      <h3 style={{margin:'0 0 4px',fontSize:16,color:MAROON}}>{step?.name_ar || 'مستند'}</h3>
      <p style={{fontSize:12.5,color:'#555',margin:'0 0 14px'}}>{step?.hint_ar || 'ارفع المستند المؤيد لهذه المرحلة'}</p>
      <div className="field" style={{marginBottom:10}}><label>الملف</label><input type="file" onChange={e=>setFile(e.target.files?.[0] || null)}/></div>
      <div className="field" style={{marginBottom:10}}><label>الرقم أو المرجع</label><input value={ref} onChange={e=>setRef(e.target.value)}/></div>
      <div className="field" style={{marginBottom:16}}><label>المبلغ - إن وجد</label><input type="number" step="0.01" dir="ltr" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
      <div className="rowsplit"><button className="btn" disabled={!file || busy} onClick={()=>onSave(file,ref,amount)}>{busy?'جارٍ الرفع':'رفع وتوثيق'}</button><button className="btn ghost" onClick={onCancel}>إلغاء</button></div>
    </div>
  </div>;
}

const inp={width:90,border:'1px solid var(--hair)',padding:'3px',textAlign:'left'};
const mini={padding:'4px 8px',fontSize:12};
const tiny={padding:'2px 7px',fontSize:11.5,marginInlineStart:5};
